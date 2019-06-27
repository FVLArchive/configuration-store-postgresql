import { BaseConfigurationStore } from '@fvlab/configurationstore';
import { PoolClient, Pool, PoolConfig, Client } from 'pg';
import * as format from 'pg-format';
import { readFile } from 'fs-extra';

/**
 * Configuration parameters for the PostgreSQL client.
 *
 * @export
 * @interface PostgreSqlConfiguration
 * @extends {PoolConfig}
 */
export interface PostgreSqlConfiguration extends PoolConfig {
	/**
	 * Default database to use to connect to the PostgreSQL server to verify that the configuration table exists.
	 *
	 * @type {string}
	 * @memberof PostgreSqlConfiguration
	 */
	default_database?: string;

	/**
	 * Table to use to store the configuration.
	 *
	 * @type {string}
	 * @memberof PostgreSqlConfiguration
	 */
	tableName?: string;
}

/**
 * Entry in the configuration table.
 *
 * Represents the structure of the table.
 *
 * @interface PostgresSqlConfigurationEntry
 * @template T Type of the data that is contained in the entry.
 */
interface PostgresSqlConfigurationEntry<T> {
	id?: string;
	config_path: string;
	data: T;
}

/**
 * Template for the configuration table.
 *
 * @class PostgresSqlConfigurationEntryTemplate
 * @implements {PostgresSqlConfigurationEntry<T>}
 * @template T
 */
class PostgresSqlConfigurationEntryTemplate<T> implements PostgresSqlConfigurationEntry<T> {
	constructor(public config_path: string, public data: T, public id?: string) {}
}

/**
 * PostgrSQL based configuration store.
 *
 * @export
 * @class PostgreSqlConfigurationStore
 * @extends {BaseConfigurationStore}
 */
export class PostgreSqlConfigurationStore extends BaseConfigurationStore {
	private pool!: Pool;
	private tableName: string = 'config';
	private config!: PostgreSqlConfiguration;

	/**
	 * Initiate PostgrSqlConfigurationStore.
	 * If the database does not exist, it creates a new one.
	 * @param {(PostgreSqlConfiguration)} [config] Configuration object or URL or ENV variables
	 * @returns {Promise<this>} A promise of this instance of the configuration store.
	 * @memberof PostgreSqlConfigurationStore
	 */
	public async init(config?: PostgreSqlConfiguration): Promise<this> {
		if (!config) {
			// Read from JSON file.
			throw new Error('PostgreSQL configuration must be present');
		}
		this.config = config;

		const tempConfig: PostgreSqlConfiguration = {
			host: config.host, // PostgreSQL host.
			port: config.port, // PostgreSQL host.
			database: config.default_database || 'postgres', // PostgreSQL database to store configuration.
			user: config.user, // Username to connect with.
			password: config.password // Password to connect with.
		};

		await this.connectionWrapper(async client => {
			const checkDbExistsQuery = format(
				"SELECT * FROM pg_database WHERE datname = '%I';",
				config.database.toLowerCase()
			);
			const result = await client.query(checkDbExistsQuery);
			if (result.rowCount === 0) {
				// No Database exists
				await this.createDatabase(tempConfig); // If database is new then we need tables to be created.
			}
		}, tempConfig);

		await this.createTables();

		return this;
	}

	/**
	 * Save data in the DB at the given path.
	 *
	 * @template T
	 * @param {string} settingsPath Path to save data at.
	 * @param {T} value Value of the data to save.
	 * @returns {Promise<T>} Value that was saved.
	 * @memberof PostgreSqlConfigurationStore
	 */
	protected async setData<T>(settingsPath: string, value: T): Promise<T> {
		const template = new PostgresSqlConfigurationEntryTemplate(settingsPath, value);

		return this.connectionWrapper(async client => {
			const sqlFirstParam = '$1';
			const sqlSecondParam = 'CAST($2 AS json)';
			const configPath = 'config_path';
			const uniqueKeyName = 'config_un';
			const sql = format(
				`INSERT INTO %1$I (%2$s) VALUES %3$s ON CONFLICT ON CONSTRAINT %5$I DO UPDATE SET data = %4$s;`,
				this.tableName,
				[configPath, 'data'], // IDs aren't needed for inserts
				[[sqlFirstParam, sqlSecondParam]], // Generate SQL params - The cast is required as there is no implicit cast from string to JSON
				sqlSecondParam,
				uniqueKeyName
			);
			const sqlParam = [template.config_path, JSON.stringify(template.data)];
			await client.query(sql, sqlParam);
			return value;
		});
	}

	/**
	 * Retreive's data at a given path.  If the data doesn't exist at that path it adds the default value provided.
	 *
	 * @template T
	 * @param {string} settingsPath Path to get data from.
	 * @param {(T | undefined)} [defaultValue] Default value to save/use if the requested path is empty.
	 * @returns {(Promise<T | undefined>)} The requested data if it exists or default if it does not.
	 * @memberof PostgreSqlConfigurationStore
	 */
	protected async getData<T>(settingsPath: string, defaultValue?: T | undefined): Promise<T | undefined> {
		return this.connectionWrapper(async client => {
			let sql = `SELECT * FROM ${this.tableName}`;
			const sqlParam = [];
			if (settingsPath) {
				sql += ' WHERE config_path = $1';
				sqlParam.push(settingsPath);
			}
			sql += ' LIMIT 1';
			sql += ';';

			const queryResult = await client.query(sql, sqlParam);

			if (queryResult.rowCount) {
				const queryResultEntry: PostgresSqlConfigurationEntry<T> = queryResult.rows[0];
				return queryResultEntry.data;
			}
			// Set default value in DB
			else return await this.setData(settingsPath, defaultValue);
		});
	}

	/**
	 * Update data at a given path. Note, it will overwrite the data.
	 *
	 * @template T
	 * @param {string} settingsPath Path to update data at.
	 * @param {T} value Value of the data to update.
	 * @returns {Promise<T>} Updated data.
	 * @memberof PostgreSqlConfigurationStore
	 */
	protected async updateData<T>(settingsPath: string, value: T): Promise<T> {
		return this.setData(settingsPath, value);
	}

	/**
	 * Connect to the PostgreSQL database. If a connection already exists, close it and open a new one.
	 *
	 * @private
	 * @param {PostgreSqlConfiguration} [config]
	 * @param {boolean} [usePool=true] Uses a global connection pool rather than a client
	 * @returns {(Promise<PoolClient | Client>)}
	 * @memberof PostgreSqlConfigurationStore
	 */
	private async connect(
		config?: PostgreSqlConfiguration,
		usePool: boolean = true
	): Promise<PoolClient | Client> {
		const sqlConfig = config || this.config;
		if (!this.pool && usePool) {
			this.pool = new Pool(sqlConfig);
		}
		const client = !usePool ? new Client(sqlConfig) : await this.pool.connect();
		if (!usePool) client.connect();

		return client;
	}

	/**
	 * Close the connection to the PostgreSQL database.
	 *
	 * @private
	 * @param {(PoolClient | Client)} client
	 * @returns {Promise<void>}
	 * @memberof PostgreSqlConfigurationStore
	 */
	private async disconnect(client: PoolClient | Client): Promise<void> {
		if (this.isPoolClient(client)) await client.release();
		else if (this.isClient(client)) await client.end();
	}

	/**
	 * Determines if the client is a regular Client.
	 *
	 * For more on Type Guards
	 * See: https://www.typescriptlang.org/docs/handbook/advanced-types.html#user-defined-type-guards
	 *
	 * @private
	 * @param {(PoolClient | Client)} client Client to check.
	 * @returns {client is Client} If the client is a Client.
	 * @memberof PostgreSqlConfigurationStore
	 */
	private isClient(client: PoolClient | Client): client is Client {
		return client && 'end' in client;
	}

	/**
	 * Determines if the client is a Pool Client.
	 *
	 * For more on Type Guards
	 * See: https://www.typescriptlang.org/docs/handbook/advanced-types.html#user-defined-type-guards
	 *
	 * @private
	 * @param {(PoolClient | Client)} client Client to check.
	 * @returns {client is PoolClient} If the client is a Pool Client.
	 * @memberof PostgreSqlConfigurationStore
	 */
	private isPoolClient(client: PoolClient | Client): client is PoolClient {
		return client && 'release' in client;
	}

	/**
	 * Wrap a function in a connection so that it will automatically open and close the connection to the DB.
	 *
	 * @private
	 * @template R Return type of the wrapped function.
	 * @param {((client?: PoolClient | Client) => Promise<R>)} func Function to wrap.
	 * @param {PostgreSqlConfiguration} [config] Connection configuration, if it is different than the class configuration.
	 * @returns {Promise<R>} The result of the wrapped function.
	 * @memberof PostgreSqlConfigurationStore
	 */
	private async connectionWrapper<R>(
		func: (client?: PoolClient | Client) => Promise<R>,
		config?: PostgreSqlConfiguration
	): Promise<R> {
		const client = await this.connect(config, !config);
		const returnValue = await func(client);
		await this.disconnect(client);
		return returnValue;
	}

	/**
	 *Creates the initial database if there isn't one.
	 *
	 * @param {PostgreSqlConfiguration} [config] Configuration Override
	 * @memberof PostgreSqlConfigurationStore
	 */
	async createDatabase(config?: PostgreSqlConfiguration) {
		await this.connectionWrapper(async client => {
			const createDbQuery = format('CREATE DATABASE %I TEMPLATE template0;', this.config.database);
			console.log('Creating Config Database', 'createDbQuery:', createDbQuery);
			try {
				await client.query(createDbQuery);
			} catch (e) {
				console.warn('createDatabase', 'database creation failed:', e.message);
			}
		}, config);
	}

	/**
	 * Creates the initial tables for the database that the client
	 * is connected to.
	 *
	 * @param {PostgreSqlConfiguration} [config] Configuration Override
	 * @memberof PostgresDatabase
	 */
	async createTables(config?: PostgreSqlConfiguration) {
		await this.connectionWrapper(async client => {
			const databaseQuery = (await readFile(`${__dirname}/sql/init_config.sql`)).toString();
			await client.query(databaseQuery);
		}, config);
	}
}

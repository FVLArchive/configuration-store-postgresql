import { BaseConfigurationStore } from '@fvlab/configurationstore';
import { Client, ClientConfig } from 'pg';
import * as format from 'pg-format';
import { readFile } from 'fs-extra';

/**
 * Configuration parameters for the PostgreSQL client.
 *
 * @export
 * @interface PostgreSqlConfiguration
 * @extends {ClientConfig}
 */
export interface PostgreSqlConfiguration extends ClientConfig {
	default_database?: string;
	tableName?: string;
}

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

export class PostgreSqlConfigurationStore extends BaseConfigurationStore {
	private client!: Client;
	private tableName: string = 'config';
	private config!: PostgreSqlConfiguration;

	/**
	 * Initiate PostgrSqlConfigurationStore.
	 * If the database does not exist, it creates a new one.
	 * @param {(PostgreSqlConfiguration)} [config] Configuration object or URL or ENV variables
	 * @memberof PostgrSqlConfigurationStore
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
			console.log('init', 'checkDbExistsQuery:', checkDbExistsQuery);
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

		return this.connectionWrapper(async () => {
			const sql = format(
				`INSERT INTO %I (%s) VALUES %s;`,
				this.tableName,
				['config_path', 'data'], // IDs aren't needed for inserts
				[['$1', 'CAST($2 AS json)']] // Generate SQL params - The cast is required as there is no implicit cast from string to JSON
			);
			const sqlParam = [template.config_path, JSON.stringify(template.data)];
			console.log('setData', 'settingsPath:', settingsPath);
			console.log('setData', 'SQL:', sql);
			await this.client.query(sql, sqlParam);
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
		return this.connectionWrapper(async () => {
			let sql = `SELECT * FROM ${this.tableName}`;
			const sqlParam = [];
			if (settingsPath) {
				sql += ' WHERE config_path = $1';
				sqlParam.push(settingsPath);
				console.log('settingsPath:', settingsPath);
			}
			sql += ' LIMIT 1';
			sql += ';';

			console.log('getData', 'settingsPath:', settingsPath);
			console.log('getDate SQL:', sql);

			const queryResult = await this.client.query(sql, sqlParam);

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
		const template = new PostgresSqlConfigurationEntryTemplate(settingsPath, value);

		return this.connectionWrapper(async () => {
			const sql = format(`UPDATE %I SET data = CAST($2 AS json) WHERE config_path = $1;`, this.tableName);
			const sqlParam = [template.config_path, JSON.stringify(template.data)];
			console.log('updateData', 'settingsPath:', settingsPath);
			console.log('updateData', 'SQL:', sql);
			await this.client.query(sql, sqlParam);
			return value;
		});
	}

	/**
	 * Connect to the PostgreSQL database.  If a connection already exists, close it and open a new one.
	 *
	 * @private
	 * @returns {Promise<Client>}
	 * @memberof PostgreSqlConfigurationStore
	 */
	private async connect(config?: PostgreSqlConfiguration): Promise<Client> {
		if (this.client) {
			try {
				await this.disconnect();
				console.warn('Client already connected, connection closed.');
			} catch (e) {
				console.error((<Error>e).stack);
			}
		}

		const sqlConfig = config || this.config;
		this.client = new Client(sqlConfig);
		try {
			await this.client.connect();
		} catch (e) {
			console.error('A connection error occurred:', e.stack);
		}
		return this.client;
	}

	/**
	 * Close the connection to the PostgreSQL database.
	 *
	 * @private
	 * @returns {Promise<void>}
	 * @memberof PostgreSqlConfigurationStore
	 */
	private async disconnect(): Promise<void> {
		if (this.client) await this.client.end();
		this.client = null;
	}

	/**
	 * Wrap a function in a connection so that it will automatically open and close the connection to the DB.
	 *
	 * @private
	 * @template R Return value of the wrapped function.
	 * @param {() => Promise<R>} func Function to wrap.
	 * @param {PostgreSqlConfiguration} [config] Connection configuration, if it is different than the class configuration.
	 * @returns {Promise<R>} The result of the wrapped function.
	 * @memberof PostgreSqlConfigurationStore
	 */
	private async connectionWrapper<R>(
		func: (client?: Client) => Promise<R>,
		config?: PostgreSqlConfiguration
	): Promise<R> {
		const client = await this.connect(config);
		const returnValue = await func(client);
		await this.disconnect();
		return returnValue;
	}

	/**
	 *Creates the initial database if there isn't one.
	 *
	 * @param {PostgreSqlConfiguration} [config] Configuration Override
	 * @memberof PostgreSqlConfigurationStore
	 */
	async createDatabase(config?: PostgreSqlConfiguration) {
		console.log('createDatabase');

		await this.connectionWrapper(async () => {
			const createDbQuery = format('CREATE DATABASE %I TEMPLATE template0;', this.config.database);
			console.log('createDatabase', 'createDbQuery:', createDbQuery);
			try {
				await this.client.query(createDbQuery);
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
		console.log('createTables');

		await this.connectionWrapper(async () => {
			const databaseQuery = (await readFile(`${__dirname}/sql/init_config.sql`)).toString();
			console.log('createTables', 'databaseQuery:', databaseQuery);
			await this.client.query(databaseQuery);
		}, config);
	}
}

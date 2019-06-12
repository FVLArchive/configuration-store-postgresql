import { PostgreSqlConfigurationStore } from './index';
const config = require('../pgConfig.json');

interface User {
	name: string;
	age: number;
}

async function initConfig(): Promise<PostgreSqlConfigurationStore> {
	const configStore = new PostgreSqlConfigurationStore('user');

	await configStore.init(config);

	return configStore;
}

const userId = new Date().toISOString();

initConfig()
	.then(async x => {
		await x.setUserData<User>(userId, { name: 'Jim', age: 25 });
		return x;
	})
	.then(async x => {
		const user = await x.getUserData<User>(userId);
		console.log('Test:', 'Got user:', user);
		return x;
	});

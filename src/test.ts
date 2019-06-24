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
const userId2 = userId + '123';

initConfig()
	.then(async x => {
		await x.setUserData<User>(userId, { name: 'Jim', age: 25 });
		await x.setUserData<User>(userId, { name: 'Jim', age: 205 });
		await x.updateUserData<User>(userId2, { name: 'John', age: 305 });
		await x.updateUserData<User>(userId2, { name: 'John', age: 15 });
		return x;
	})
	.then(async x => {
		const user = await x.getUserData<User>(userId);
		const user2 = await x.getUserData<User>(userId2);
		console.log('Test:', 'Got user:', user);
		console.log('Test:', 'Got user2:', user2);
		return x;
	});

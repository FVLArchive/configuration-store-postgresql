# PostgreSQLConfigurationStore

Simple application settings or document storage using PostgreSQL. Global configurations will be stored under `/internal/global/` and user-specific configurations will be stored under `/internal/user/<userId>`. The paths can be configured by passing optional arguments to the constructor.

~~[NPM Package](https://www.npmjs.com/package/@fvlab/comingSoon)~~ Package not published yet.

# Usage

## Building

To build the project run the command below.

```bash
npm run build
```

## Testing

Testing is done via `test.ts` which is currently a scratchpad for various operations.

```
npm run test
```

## Initialization

Before anything can be read or written to PostgreSQL the library must be initialized. This is a necessary step to setup the Firebase configuration. There are two types of initialization available.

### Initialize with Options

The first type of initialization available allows the library to be initialized with connection information. The bare minimum to include is

```typescript
{
	host: "localhost", // PostgreSQL host.
	port: 5432, // PostgreSQL host.
	database: "config_store", // PostgreSQL database to store configuration.
	user: "username", // Username to connect with.
	password: "password" // Password to connect with.
}
```

If you'd like to overwrite the default table the configuration is written to, `config`, supply the `tableName` property with the configuration.

Connections are made with [pg](https://www.npmjs.com/package/pg), for more options see [their documentation](https://node-postgres.com/).

```ts
public init(config?: PostgreSqlConfiguration): this
```

### Initialize with a JSON File

_Coming Soon_

The second type of initialization available allows the library to be initialized with an preexisting JSON file that contains the configuration. The format is the same as a above,

```json
{
	"host": "localhost", // PostgreSQL host.
	"port": 5432, // PostgreSQL host.
	"database": "config_store", // PostgreSQL database to store configuration.
	"user": "username", // Username to connect with.
	"password": "password" // Password to connect with.
}
```

If you'd like to overwrite the default table the configuration is written to, `config`, supply the `tableName` property with the configuration.

Connections are made with [pg](https://www.npmjs.com/package/pg), for more options see [their documentation](https://node-postgres.com/).

```ts
public init(): this
```

## Create and initialize the object.

```ts
const currentUserId = '1234';
const settings = new PostgreSqlConfigurationStore(
	currentUserId,
	'/custom/pathToGlobalConfig/',
	'/custom/pathToUserConfig'
);
return settings.init();
```

## Retrieve values by key or get it's default value if a value doesn't exist for the key.

```ts
return settings.getGlobalData('someKey', 'default value')
.then(globalValue => ...);
```

```ts
return settings.getUserData('someOtherKey', 'default value')
.then(userValue => ...);
```

## Set the key-value pair.

```ts
return settings.setGlobalData('someKey', 'some value')
.then(globalValue => ...);
```

```ts
return settings.setUserData('someOtherKey', 'some value')
.then(userValue => ...);
```

## Update the Data Stored in the Specified Path

```ts
return settings.updateGlobalData('somePath', 'some value')
.then(globalValue => ...);
```

```ts
return settings.updateGlobalData('someOtherPath', 'some value')
.then(userValue => ...);
```

## Supported operations

1. Forward-slash separated path

   ```ts
   return settings.setGlobalData('some/other/path', 'some value')
   .then(globalValue => ...);
   ```

1. Object / Array value

   ```ts
   return settings
    .updateGlobalData('somePath', { child1: "value1", child2: 42})
    .then(globalValue => ...);
   ```

   ```ts
   return settings
    .setGlobalData('somePath', [4, 2])
    .then(globalValue => ...);
   ```

1. `set` operations only create. `update` operations overwrite existing data at the path.

   ```js
   // Current Config Store
   "apiKeys": {
     "someService": "some-api-key"
   }
   ```

   ```ts
   settings.updateGlobalData('apiKeys', { someOtherService: 'some-other-api-key' });

   // Expected Config Store
   "apiKeys": {
     "someService": "some-api-key",
     "someOtherService": "some-other-api-key"
   }
   ```

   ```ts
   settings.setGlobalData('apiKeys', { anotherService: 'another-api-key' });

   // Expected Config Store
   "apiKeys": {
     "anotherService": "another-api-key"
   }
   ```

<!--
# Generate Documentation

Documentation within this project is generated via [Typedoc](https://typedoc.org).

```bash
npm run docs
```
-->

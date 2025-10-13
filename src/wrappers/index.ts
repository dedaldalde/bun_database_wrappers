// Export all database wrappers
export { MySQLWrapper, createMySQL } from "./mysqlwrapper";
export { RedisWrapper, createRedis } from "./rediswrapper";
export { SQLiteWrapper, createSQLite } from "./sqlitewrapper";

// Export types
export type { MySQLConnectionOptions, QueryResult } from "./mysqlwrapper";
export type { SetOptions } from "./rediswrapper";

// Export error classes for unified error handling
export { DBError } from "./mysqlwrapper";

// Re-export everything for convenience
export * from "./mysqlwrapper";
export * from "./rediswrapper";
export * from "./sqlitewrapper";

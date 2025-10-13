import { SQL } from "bun";

/**
 * Custom error class for database operations with enhanced context
 */
export class DBError extends Error {
  public readonly context: { query?: string; params?: any[] };
  public override readonly cause?: unknown;

  constructor(
    message: string,
    context: { query?: string; params?: any[] },
    cause?: unknown
  ) {
    super(message);
    this.name = "DBError";
    this.context = context;
    this.cause = cause;
    if (cause instanceof Error) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }
}

/**
 * Result shape for queries
 */
export interface QueryResult<T = unknown> {
  rows?: T[];
  affectedRows?: number;
  lastInsertId?: number;
}

/**
 * Escape and validate SQL identifiers (table/column names)
 * Only alphanumerics and underscores are allowed
 */
function quoteIdentifier(identifier: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(identifier)) {
    throw new Error(`Invalid SQL identifier: "${identifier}". Only alphanumerics and underscores allowed.`);
  }
  return `\`${identifier}\``;
}

/**
 * Connection options for MySQL
 */
export interface MySQLConnectionOptions {
  hostname?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  max?: number; // Maximum connections in pool
  idleTimeout?: number; // Close idle connections after seconds
  maxLifetime?: number; // Connection lifetime in seconds
  connectionTimeout?: number; // Timeout when establishing connections
  tls?: boolean | {
    rejectUnauthorized?: boolean;
    ca?: string;
    key?: string;
    cert?: string;
  };
}

/**
 * A wrapper class for MySQL database operations using Bun's SQL API
 */
export class MySQLWrapper {
  private db: SQL;

  /**
   * Create a new MySQL database connection
   * @param connectionString - MySQL connection string (e.g., "mysql://user:pass@localhost:3306/dbname")
   * @param options - Optional connection options
   */
  constructor(connectionString: string, options?: MySQLConnectionOptions) {
    // Use the new Bun SQL API with MySQL adapter
    if (options) {
      this.db = new SQL({
        adapter: "mysql",
        ...options,
      });
    } else {
      // Auto-detect MySQL from connection string
      this.db = new SQL(connectionString);
    }
  }

  /**
   * Execute a query that doesn't return rows (INSERT, UPDATE, DELETE)
   * @param query - SQL query string with placeholders
   * @param params - Query parameters (default: [])
   * @returns Query result
   */
  async run<T = unknown>(query: string, params: any[] = []): Promise<T> {
    return await this.executeQuery<T>(query, params);
  }

  /**
   * Execute a query that returns rows (SELECT)
   * @param query - SQL SELECT query
   * @param params - Query parameters (default: [])
   * @returns Array of row objects
   */
  async all<T = unknown>(query: string, params: any[] = []): Promise<T[]> {
    return await this.executeQuery<T[]>(query, params);
  }

  /**
   * Execute a query that returns a single row
   * @param query - SQL query
   * @param params - Query parameters (default: [])
   * @returns Single row object or undefined
   */
  async get<T = unknown>(query: string, params: any[] = []): Promise<T | undefined> {
    const results = await this.executeQuery<T[]>(query, params);
    return results[0];
  }

  /**
   * Execute a query that returns a single value
   * @param query - SQL query
   * @param params - Query parameters (default: [])
   * @returns Single scalar value or undefined
   */
  async scalar<T = unknown>(query: string, params: any[] = []): Promise<T | undefined> {
    const results = await this.executeQuery<any[]>(query, params);
    if (results.length > 0) {
      const firstRow = results[0];
      const firstKey = Object.keys(firstRow)[0];
      if (firstKey !== undefined) {
        return firstRow[firstKey] as T;
      }
    }
    return undefined;
  }

  /**
   * Helper method to execute queries with parameters
   * Enhanced with error wrapping for better debugging
   * @param query - SQL query string
   * @param params - Array of parameters
   * @returns Query results
   */
  private async executeQuery<T = unknown>(query: string, params: any[] = []): Promise<T> {
    try {
      if (params.length === 0) {
        return await this.db.unsafe(query);
      }
      // MySQL uses ? placeholders directly (not $1, $2)
      return await this.db.unsafe(query, params);
    } catch (error) {
      throw new DBError(
        `MySQL query failed: ${error instanceof Error ? error.message : String(error)}`,
        { query, params },
        error
      );
    }
  }

  /**
   * Execute multiple queries in a transaction
   * @param queries - Array of query strings or objects with {sql, params}
   * @returns Result of the transaction
   */
  async transaction(queries: (string | { sql: string; params?: any[] })[]) {
    return await this.db.begin(async (tx) => {
      for (const query of queries) {
        if (typeof query === "string") {
          await tx.unsafe(query);
        } else {
          const { sql, params = [] } = query;
          // MySQL uses ? placeholders directly
          await tx.unsafe(sql, params);
        }
      }
    });
  }

  /**
   * Create a table with the given schema
   * @param name - Table name
   * @param schema - Object mapping column names to their SQL type definitions
   *                Supports columns, indexes, and constraints
   * @returns Query result
   */
  async createTable(name: string, schema: Record<string, string>): Promise<unknown> {
    const columns = Object.entries(schema)
      .map(([key, value]) => {
        // Check if this is a constraint or index definition (starts with keywords)
        const constraintKeywords = ['INDEX', 'KEY', 'UNIQUE', 'PRIMARY', 'FOREIGN', 'CHECK', 'CONSTRAINT'];
        const isConstraint = constraintKeywords.some(keyword => key.toUpperCase().startsWith(keyword));
        
        if (isConstraint) {
          // For constraints/indexes, use the key as-is (it's already a SQL clause)
          return `${key} ${value}`;
        } else {
          // For regular columns, quote the identifier
          return `${quoteIdentifier(key)} ${value}`;
        }
      })
      .join(", ");
    const query = `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(name)} (${columns})`;
    return await this.run(query);
  }

  /**
   * Insert data into a table using Bun's SQL helper
   * @param table - Table name
   * @param data - Object with column-value pairs to insert
   * @returns Inserted row(s) if possible, or result info
   */
  async insert<T extends Record<string, unknown>>(table: string, data: T): Promise<QueryResult<T>> {
    // Validate identifier before use
    quoteIdentifier(table);
    // Use Bun's SQL helper for object insertion - it handles escaping internally
    // Note: MySQL doesn't support RETURNING clause like PostgreSQL
    const result = await this.db`INSERT INTO ${this.db(table)} ${this.db(data)}`;
    return result as unknown as QueryResult<T>;
  }

  /**
   * Bulk insert multiple rows
   * @param table - Table name
   * @param dataArray - Array of objects with column-value pairs
   * @returns Result with affected rows
   */
  async insertMany<T extends Record<string, unknown>>(table: string, dataArray: T[]): Promise<QueryResult<T>> {
    // Validate identifier before use
    quoteIdentifier(table);
    // Use Bun's bulk insert helper - it handles escaping internally
    const result = await this.db`INSERT INTO ${this.db(table)} ${this.db(dataArray)}`;
    return result as unknown as QueryResult<T>;
  }

  /**
   * Insert data into a table, ignoring duplicate key conflicts
   * @param table - Table name
   * @param data - Object with column-value pairs to insert
   * @returns Query result
   */
  async insertIgnore<T extends Record<string, unknown>>(table: string, data: T): Promise<unknown> {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = values.map(() => "?").join(", ");
    const query = `INSERT IGNORE INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(", ")}) VALUES (${placeholders})`;
    return await this.run(query, values);
  }

  /**
   * Insert or update data (upsert operation) using ON DUPLICATE KEY UPDATE
   * @param table - Table name
   * @param data - Object with column-value pairs
   * @param updateColumns - Columns to update on duplicate (if not provided, updates all non-key columns)
   * @returns Query result
   */
  async upsert<T extends Record<string, unknown>>(
    table: string,
    data: T,
    updateColumns?: string[]
  ): Promise<unknown> {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map(() => "?").join(", ");
    
    const columnsToUpdate = updateColumns || columns;
    const updateClause = columnsToUpdate
      .map(col => `${quoteIdentifier(col)} = VALUES(${quoteIdentifier(col)})`)
      .join(", ");
    
    const query = `INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(", ")}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}`;
    return await this.run(query, values);
  }

  /**
   * Update data in a table
   * @param table - Table name
   * @param data - Object with column-value pairs to update
   * @param whereClause - WHERE clause (e.g., "id = ?")
   * @param whereParams - Parameters for the WHERE clause (default: [])
   * @returns Query result with affected rows
   */
  async update<T extends Record<string, unknown>>(
    table: string,
    data: T,
    whereClause: string,
    whereParams: any[] = []
  ): Promise<unknown> {
    const setClause = Object.keys(data).map(k => `${quoteIdentifier(k)} = ?`).join(", ");
    const values = Object.values(data);
    const query = `UPDATE ${quoteIdentifier(table)} SET ${setClause} WHERE ${whereClause}`;
    return await this.run(query, [...values, ...whereParams]);
  }

  /**
   * Delete data from a table
   * @param table - Table name
   * @param whereClause - WHERE clause (e.g., "id = ?")
   * @param whereParams - Parameters for the WHERE clause (default: [])
   * @returns Query result with affected rows
   */
  async delete(table: string, whereClause: string, whereParams: any[] = []): Promise<unknown> {
    const query = `DELETE FROM ${quoteIdentifier(table)} WHERE ${whereClause}`;
    return await this.run(query, whereParams);
  }

  /**
   * Select data from a table
   * @param table - Table name
   * @param columns - Columns to select (default: "*")
   * @param whereClause - Optional WHERE clause (default: null)
   * @param whereParams - Parameters for the WHERE clause (default: [])
   * @returns Array of row objects
   */
  async select<T = unknown>(
    table: string,
    columns = "*",
    whereClause: string | null = null,
    whereParams: any[] = []
  ): Promise<T[]> {
    const query = `SELECT ${columns} FROM ${quoteIdentifier(table)}${whereClause ? ` WHERE ${whereClause}` : ""}`;
    return await this.all<T>(query, whereParams);
  }

  /**
   * Get a single row from a table
   * @param table - Table name
   * @param whereClause - WHERE clause (e.g., "id = ?")
   * @param whereParams - Parameters for the WHERE clause (default: [])
   * @returns Single row object or undefined
   */
  async getRow<T = unknown>(table: string, whereClause: string, whereParams: any[] = []): Promise<T | undefined> {
    const query = `SELECT * FROM ${quoteIdentifier(table)} WHERE ${whereClause} LIMIT 1`;
    return await this.get<T>(query, whereParams);
  }

  /**
   * Get a single value from a table
   * @param table - Table name
   * @param column - Column name to retrieve
   * @param whereClause - WHERE clause (e.g., "id = ?")
   * @param whereParams - Parameters for the WHERE clause (default: [])
   * @returns Single scalar value or undefined
   */
  async getValue<T = unknown>(
    table: string,
    column: string,
    whereClause: string,
    whereParams: any[] = []
  ): Promise<T | undefined> {
    const query = `SELECT ${quoteIdentifier(column)} FROM ${quoteIdentifier(table)} WHERE ${whereClause} LIMIT 1`;
    return await this.scalar<T>(query, whereParams);
  }

  /**
   * Execute a raw SQL query using template literals (for complex queries)
   * @param strings - Template string parts
   * @param values - Template string values
   * @returns Query results
   */
  async query(strings: TemplateStringsArray, ...values: any[]) {
    return await this.db(strings, ...values);
  }

  /**
   * Get the last inserted ID (useful after INSERT operations)
   * @returns Last insert ID
   */
  async lastInsertId(): Promise<number> {
    const result = await this.scalar("SELECT LAST_INSERT_ID() as id");
    return Number(result);
  }

  /**
   * Check if a table exists
   * @param tableName - Name of the table to check
   * @returns True if table exists, false otherwise
   */
  async tableExists(tableName: string): Promise<boolean> {
    const result = await this.scalar(
      "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
      [tableName]
    );
    return Number(result) > 0;
  }

  /**
   * Get list of all tables in the database
   * @returns Array of table names
   */
  async getTables(): Promise<string[]> {
    const results = await this.all(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()"
    );
    return results.map((row: any) => row.table_name || row.TABLE_NAME);
  }

  /**
   * Describe a table structure
   * @param tableName - Name of the table
   * @returns Array of column information
   */
  async describeTable(tableName: string): Promise<unknown[]> {
    return await this.all(`DESCRIBE ${quoteIdentifier(tableName)}`);
  }

  /**
   * Close the database connection pool
   * @param options - Close options (timeout in seconds)
   */
  async close(options?: { timeout?: number }): Promise<void> {
    await this.db.close(options);
  }

  /**
   * Support for async dispose pattern (using await ... syntax)
   * Automatically closes connection when wrapper goes out of scope
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }
}

/**
 * Factory function to create a MySQL wrapper instance
 * @param connectionString - MySQL connection string
 * @param options - Optional connection options
 * @returns A new MySQLWrapper instance
 */
export function createMySQL(connectionString: string, options?: MySQLConnectionOptions): MySQLWrapper {
  return new MySQLWrapper(connectionString, options);
}

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
  return `"${identifier}"`; // SQLite uses double quotes for identifiers
}

/**
 * A wrapper class for SQLite database operations using Bun's SQL API
 */
export class SQLiteWrapper {
  private db: SQL;

  /**
   * Create a new SQLite database connection
   * @param dbPath - Path to the database file (use ":memory:" for in-memory database)
   */
  constructor(dbPath: string) {
    // Use the new Bun SQL API with SQLite adapter
    if (dbPath === ":memory:") {
      this.db = new SQL(":memory:");
    } else if (dbPath.startsWith("sqlite://")) {
      this.db = new SQL(dbPath);
    } else {
      // For simple filenames, explicitly specify adapter
      this.db = new SQL(dbPath, { adapter: "sqlite" });
    }
    
    // Enable foreign keys
    this.db`PRAGMA foreign_keys = ON`.simple();
  }

  /**
   * Execute a query that doesn't return rows (INSERT, UPDATE, DELETE)
   * @param query - SQL query string with placeholders
   * @param params - Query parameters (default: [])
   * @returns Statement run result
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

      // Replace ? placeholders with $1, $2, etc. for Bun SQL API
      let paramIndex = 1;
      const convertedQuery = query.replace(/\?/g, () => `$${paramIndex++}`);
      
      return await this.db.unsafe(convertedQuery, params);
    } catch (error) {
      throw new DBError(
        `SQLite query failed: ${error instanceof Error ? error.message : String(error)}`,
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
          if (params.length === 0) {
            await tx.unsafe(sql);
          } else {
            let paramIndex = 1;
            const convertedQuery = sql.replace(/\?/g, () => `$${paramIndex++}`);
            await tx.unsafe(convertedQuery, params);
          }
        }
      }
    });
  }

  /**
   * Create a table with the given schema
   * @param name - Table name
   * @param schema - Object mapping column names to their SQL type definitions
   * @returns Statement run result
   */
  async createTable(name: string, schema: Record<string, string>): Promise<unknown> {
    const columns = Object.entries(schema)
      .map(([key, value]) => `${quoteIdentifier(key)} ${value}`)
      .join(", ");
    const query = `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(name)} (${columns})`;
    return await this.run(query);
  }

  /**
   * Insert data into a table using Bun's SQL helper
   * @param table - Table name
   * @param data - Object with column-value pairs to insert
   * @returns Inserted row(s)
   */
  async insert<T extends Record<string, unknown>>(table: string, data: T): Promise<T[]> {
    // Validate identifier before use
    quoteIdentifier(table);
    // Use Bun's SQL helper for object insertion - it handles escaping internally
    const result = await this.db`INSERT INTO ${this.db(table)} ${this.db(data)} RETURNING *`;
    return result as T[];
  }

  /**
   * Insert data into a table, ignoring UNIQUE or constraint conflicts
   * @param table - Table name
   * @param data - Object with column-value pairs to insert
   * @returns Statement run result
   */
  async insertOrIgnore<T extends Record<string, unknown>>(table: string, data: T): Promise<unknown> {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = values.map(() => "?").join(", ");
    const query = `INSERT OR IGNORE INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(", ")}) VALUES (${placeholders})`;
    return await this.run(query, values);
  }

  /**
   * Insert or update data (upsert operation)
   * @param table - Table name
   * @param data - Object with column-value pairs
   * @param conflictColumns - Columns to check for conflicts
   * @param updateOnConflict - If true, updates non-conflict columns; if false, does nothing (default: true)
   * @returns Statement run result
   */
  async upsert<T extends Record<string, unknown>>(
    table: string,
    data: T,
    conflictColumns: string[],
    updateOnConflict = true
  ): Promise<unknown> {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map(() => "?").join(", ");
    let query = `INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(", ")}) VALUES (${placeholders})`;
    if (conflictColumns?.length) {
      if (updateOnConflict) {
        const setClause = columns
          .filter(c => !conflictColumns.includes(c))
          .map(c => `${quoteIdentifier(c)} = excluded.${quoteIdentifier(c)}`)
          .join(", ");
        query += ` ON CONFLICT(${conflictColumns.map(quoteIdentifier).join(",")}) DO UPDATE SET ${setClause || conflictColumns.map((c: string) => `${quoteIdentifier(c)}=${quoteIdentifier(c)}`).join(",")}`;
      } else {
        query += ` ON CONFLICT(${conflictColumns.map(quoteIdentifier).join(",")}) DO NOTHING`;
      }
    }
    return await this.run(query, values);
  }

  /**
   * Update data in a table using Bun's SQL helper
   * @param table - Table name
   * @param data - Object with column-value pairs to update
   * @param whereClause - WHERE clause (e.g., "id = ?")
   * @param whereParams - Parameters for the WHERE clause (default: [])
   * @returns Statement run result with changes count
   */
  async update<T extends Record<string, unknown>>(
    table: string,
    data: T,
    whereClause: string,
    whereParams: any[] = []
  ): Promise<unknown> {
    // Build UPDATE query with Bun's SQL helper for the SET clause
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
   * @returns Statement run result with changes count
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
    const query = `SELECT * FROM ${quoteIdentifier(table)} WHERE ${whereClause}`;
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
    const query = `SELECT ${quoteIdentifier(column)} FROM ${quoteIdentifier(table)} WHERE ${whereClause}`;
    return await this.scalar<T>(query, whereParams);
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    await this.db.close();
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
 * Factory function to create a SQLite wrapper instance
 * @param dbPath - Path to database file or ":memory:" for in-memory database
 * @returns A new SQLiteWrapper instance
 */
export function createSQLite(dbPath: string): SQLiteWrapper {
  return new SQLiteWrapper(dbPath);
}

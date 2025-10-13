import { SQL } from "bun";

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
  async run(query: string, params: any[] = []) {
    // Convert parameterized query to template literal format
    const result = await this.executeQuery(query, params);
    return result;
  }

  /**
   * Execute a query that returns rows (SELECT)
   * @param query - SQL SELECT query
   * @param params - Query parameters (default: [])
   * @returns Array of row objects
   */
  async all(query: string, params: any[] = []) {
    return await this.executeQuery(query, params);
  }

  /**
   * Execute a query that returns a single row
   * @param query - SQL query
   * @param params - Query parameters (default: [])
   * @returns Single row object or undefined
   */
  async get(query: string, params: any[] = []) {
    const results = await this.executeQuery(query, params);
    return results[0];
  }

  /**
   * Execute a query that returns a single value
   * @param query - SQL query
   * @param params - Query parameters (default: [])
   * @returns Single scalar value or undefined
   */
  async scalar(query: string, params: any[] = []) {
    const results = await this.executeQuery(query, params);
    if (results.length > 0) {
      const firstRow = results[0];
      const firstKey = Object.keys(firstRow)[0];
      if (firstKey !== undefined) {
        return firstRow[firstKey];
      }
    }
    return undefined;
  }

  /**
   * Helper method to execute queries with parameters
   * @param query - SQL query string
   * @param params - Array of parameters
   * @returns Query results
   */
  private async executeQuery(query: string, params: any[] = []) {
    // Build the query dynamically using template literal
    if (params.length === 0) {
      return await this.db.unsafe(query);
    }

    // Replace ? placeholders with $1, $2, etc. for Bun SQL API
    let paramIndex = 1;
    const convertedQuery = query.replace(/\?/g, () => `$${paramIndex++}`);
    
    return await this.db.unsafe(convertedQuery, params);
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
  async createTable(name: string, schema: Record<string, string>) {
    const columns = Object.entries(schema)
      .map(([key, value]) => `${key} ${value}`)
      .join(", ");
    const query = `CREATE TABLE IF NOT EXISTS ${name} (${columns})`;
    return await this.run(query);
  }

  /**
   * Insert data into a table using Bun's SQL helper
   * @param table - Table name
   * @param data - Object with column-value pairs to insert
   * @returns Inserted row(s)
   */
  async insert(table: string, data: Record<string, any>) {
    // Use Bun's SQL helper for object insertion
    return await this.db`INSERT INTO ${this.db(table)} ${this.db(data)} RETURNING *`;
  }

  /**
   * Insert data into a table, ignoring UNIQUE or constraint conflicts
   * @param table - Table name
   * @param data - Object with column-value pairs to insert
   * @returns Statement run result
   */
  async insertOrIgnore(table: string, data: Record<string, any>) {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = values.map(() => "?").join(", ");
    const query = `INSERT OR IGNORE INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`;
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
  async upsert(
    table: string,
    data: Record<string, any>,
    conflictColumns: string[],
    updateOnConflict = true
  ) {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map(() => "?").join(", ");
    let query = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`;
    if (conflictColumns?.length) {
      if (updateOnConflict) {
        const setClause = columns
          .filter(c => !conflictColumns.includes(c))
          .map(c => `${c} = excluded.${c}`)
          .join(", ");
        query += ` ON CONFLICT(${conflictColumns.join(",")}) DO UPDATE SET ${setClause || conflictColumns.map((c: string) => `${c}=${c}`).join(",")}`;
      } else {
        query += ` ON CONFLICT(${conflictColumns.join(",")}) DO NOTHING`;
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
  async update(
    table: string,
    data: Record<string, any>,
    whereClause: string,
    whereParams: any[] = []
  ) {
    // Build UPDATE query with Bun's SQL helper for the SET clause
    const setClause = Object.keys(data).map(k => `${k} = ?`).join(", ");
    const values = Object.values(data);
    const query = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;
    return await this.run(query, [...values, ...whereParams]);
  }

  /**
   * Delete data from a table
   * @param table - Table name
   * @param whereClause - WHERE clause (e.g., "id = ?")
   * @param whereParams - Parameters for the WHERE clause (default: [])
   * @returns Statement run result with changes count
   */
  async delete(table: string, whereClause: string, whereParams: any[] = []) {
    const query = `DELETE FROM ${table} WHERE ${whereClause}`;
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
  async select(
    table: string,
    columns = "*",
    whereClause: string | null = null,
    whereParams: any[] = []
  ) {
    const query = `SELECT ${columns} FROM ${table}${whereClause ? ` WHERE ${whereClause}` : ""}`;
    return await this.all(query, whereParams);
  }

  /**
   * Get a single row from a table
   * @param table - Table name
   * @param whereClause - WHERE clause (e.g., "id = ?")
   * @param whereParams - Parameters for the WHERE clause (default: [])
   * @returns Single row object or undefined
   */
  async getRow(table: string, whereClause: string, whereParams: any[] = []) {
    const query = `SELECT * FROM ${table} WHERE ${whereClause}`;
    return await this.get(query, whereParams);
  }

  /**
   * Get a single value from a table
   * @param table - Table name
   * @param column - Column name to retrieve
   * @param whereClause - WHERE clause (e.g., "id = ?")
   * @param whereParams - Parameters for the WHERE clause (default: [])
   * @returns Single scalar value or undefined
   */
  async getValue(
    table: string,
    column: string,
    whereClause: string,
    whereParams: any[] = []
  ) {
    const query = `SELECT ${column} FROM ${table} WHERE ${whereClause}`;
    return await this.scalar(query, whereParams);
  }

  /**
   * Close the database connection
   */
  async close() {
    await this.db.close();
  }
}

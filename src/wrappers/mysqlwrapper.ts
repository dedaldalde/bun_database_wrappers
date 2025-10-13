import { SQL } from "bun";

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
  async run(query: string, params: any[] = []) {
    return await this.executeQuery(query, params);
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
    if (params.length === 0) {
      return await this.db.unsafe(query);
    }

    // MySQL uses ? placeholders directly (not $1, $2)
    return await this.db.unsafe(query, params);
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
   * @returns Query result
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
   * @returns Inserted row(s) if possible, or result info
   */
  async insert(table: string, data: Record<string, any>) {
    // Use Bun's SQL helper for object insertion
    // Note: MySQL doesn't support RETURNING clause like PostgreSQL
    const result = await this.db`INSERT INTO ${this.db(table)} ${this.db(data)}`;
    return result;
  }

  /**
   * Bulk insert multiple rows
   * @param table - Table name
   * @param dataArray - Array of objects with column-value pairs
   * @returns Result with affected rows
   */
  async insertMany(table: string, dataArray: Record<string, any>[]) {
    // Use Bun's bulk insert helper
    return await this.db`INSERT INTO ${this.db(table)} ${this.db(dataArray)}`;
  }

  /**
   * Insert data into a table, ignoring duplicate key conflicts
   * @param table - Table name
   * @param data - Object with column-value pairs to insert
   * @returns Query result
   */
  async insertIgnore(table: string, data: Record<string, any>) {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = values.map(() => "?").join(", ");
    const query = `INSERT IGNORE INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`;
    return await this.run(query, values);
  }

  /**
   * Insert or update data (upsert operation) using ON DUPLICATE KEY UPDATE
   * @param table - Table name
   * @param data - Object with column-value pairs
   * @param updateColumns - Columns to update on duplicate (if not provided, updates all non-key columns)
   * @returns Query result
   */
  async upsert(
    table: string,
    data: Record<string, any>,
    updateColumns?: string[]
  ) {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map(() => "?").join(", ");
    
    const columnsToUpdate = updateColumns || columns;
    const updateClause = columnsToUpdate
      .map(col => `${col} = VALUES(${col})`)
      .join(", ");
    
    const query = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}`;
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
  async update(
    table: string,
    data: Record<string, any>,
    whereClause: string,
    whereParams: any[] = []
  ) {
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
   * @returns Query result with affected rows
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
    const query = `SELECT * FROM ${table} WHERE ${whereClause} LIMIT 1`;
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
    const query = `SELECT ${column} FROM ${table} WHERE ${whereClause} LIMIT 1`;
    return await this.scalar(query, whereParams);
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
  async describeTable(tableName: string) {
    return await this.all(`DESCRIBE ${tableName}`);
  }

  /**
   * Close the database connection pool
   * @param options - Close options (timeout in seconds)
   */
  async close(options?: { timeout?: number }) {
    await this.db.close(options);
  }
}

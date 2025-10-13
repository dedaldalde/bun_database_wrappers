import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { MySQLWrapper } from "../src/wrappers/mysqlwrapper";

/**
 * MySQL Wrapper Tests
 * 
 * NOTE: Requires MySQL environment variables:
 * - MYSQL_HOST (defaults to localhost)
 * - MYSQL_USER (defaults to root)
 * - MYSQL_PASSWORD (defaults to empty)
 * - MYSQL_DATABASE (defaults to testdb)
 * - MYSQL_PORT (defaults to 3306)
 */

describe("MySQLWrapper", () => {
  let db: MySQLWrapper;
  
  const host = process.env.MYSQL_HOST || "localhost";
  const user = process.env.MYSQL_USER || process.env.MYSQL_USERL || "root";
  const password = process.env.MYSQL_PASSWORD || "";
  const database = process.env.MYSQL_DATABASE || "testdb";
  const port = parseInt(process.env.MYSQL_PORT || "3306");

  beforeAll(async () => {
    db = new MySQLWrapper("", {
      hostname: host,
      port: port,
      database: database,
      username: user,
      password: password,
      max: 10,
      idleTimeout: 30,
    });

    // Clean up test tables
    await db.run("DROP TABLE IF EXISTS test_users");
    await db.run("DROP TABLE IF EXISTS test_orders");
  });

  afterAll(async () => {
    // Clean up
    await db.run("DROP TABLE IF EXISTS test_users");
    await db.run("DROP TABLE IF EXISTS test_orders");
    await db.close();
  });

  test("should connect to MySQL", async () => {
    const version = await db.scalar("SELECT VERSION()");
    expect(version).toBeDefined();
    expect(typeof version).toBe("string");
  });

  test("should create table", async () => {
    await db.createTable("test_users", {
      id: "INT AUTO_INCREMENT PRIMARY KEY",
      name: "VARCHAR(255) NOT NULL",
      email: "VARCHAR(255) UNIQUE NOT NULL",
      age: "INT",
      created_at: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
    });

    // Verify table exists
    const tables = await db.all(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?",
      [database, "test_users"]
    );
    expect(tables.length).toBe(1);
  });

  test("should insert data", async () => {
    const result = await db.insert("test_users", {
      name: "Alice",
      email: "alice@test.com",
      age: 30
    });
    
    expect(result).toBeDefined();
    
    // Verify the insert by querying
    const alice = await db.getRow("test_users", "email = ?", ["alice@test.com"]);
    expect(alice).toBeDefined();
    expect(alice?.name).toBe("Alice");
  });

  test("should select data", async () => {
    const users = await db.select("test_users");
    expect(users.length).toBeGreaterThan(0);
    expect(users[0].name).toBe("Alice");
  });

  test("should get single row", async () => {
    const user = await db.getRow("test_users", "email = ?", ["alice@test.com"]);
    expect(user).toBeDefined();
    expect(user?.name).toBe("Alice");
  });

  test("should get single value", async () => {
    const name = await db.getValue("test_users", "name", "email = ?", ["alice@test.com"]);
    expect(name).toBe("Alice");
  });

  test("should update data", async () => {
    await db.update("test_users", { age: 31 }, "email = ?", ["alice@test.com"]);
    const age = await db.getValue("test_users", "age", "email = ?", ["alice@test.com"]);
    expect(age).toBe(31);
  });

  test("should perform upsert", async () => {
    // First upsert (insert)
    await db.upsert(
      "test_users",
      { name: "Bob", email: "bob@test.com", age: 25 },
      ["age"] // Update age on duplicate email
    );
    
    let bob = await db.getRow("test_users", "email = ?", ["bob@test.com"]);
    expect(bob?.age).toBe(25);

    // Second upsert (update)
    await db.upsert(
      "test_users",
      { name: "Bob", email: "bob@test.com", age: 26 },
      ["age"] // Update age on duplicate email
    );
    
    bob = await db.getRow("test_users", "email = ?", ["bob@test.com"]);
    expect(bob?.age).toBe(26);
  });

  test("should delete data", async () => {
    await db.insert("test_users", { name: "Charlie", email: "charlie@test.com", age: 35 });
    await db.delete("test_users", "email = ?", ["charlie@test.com"]);
    
    const charlie = await db.getRow("test_users", "email = ?", ["charlie@test.com"]);
    expect(charlie).toBeUndefined();
  });

  test("should handle transactions", async () => {
    await db.createTable("test_orders", {
      id: "INT AUTO_INCREMENT PRIMARY KEY",
      user_id: "INT NOT NULL",
      product: "VARCHAR(255) NOT NULL",
      amount: "DECIMAL(10,2) NOT NULL"
    });

    await db.transaction([
      { sql: "INSERT INTO test_orders (user_id, product, amount) VALUES (?, ?, ?)", params: [1, "Laptop", 999.99] },
      { sql: "INSERT INTO test_orders (user_id, product, amount) VALUES (?, ?, ?)", params: [1, "Mouse", 29.99] }
    ]);

    const orders = await db.select("test_orders", "*", "user_id = ?", [1]);
    expect(orders.length).toBe(2);
  });

  test("should check if table exists", async () => {
    const exists = await db.tableExists("test_users");
    expect(exists).toBe(true);
    
    const notExists = await db.tableExists("nonexistent_table");
    expect(notExists).toBe(false);
  });

  test("should get list of tables", async () => {
    const tables = await db.getTables();
    expect(tables).toBeDefined();
    expect(tables.length).toBeGreaterThan(0);
    expect(tables).toContain("test_users");
  });

  test("should describe table structure", async () => {
    const structure = await db.describeTable("test_users");
    expect(structure).toBeDefined();
    expect(structure.length).toBeGreaterThan(0);
  });

  test("should execute raw queries", async () => {
    const result = await db.all("SELECT * FROM test_users WHERE age > ?", [20]);
    expect(result.length).toBeGreaterThan(0);
  });

  test("should get scalar value", async () => {
    const count = await db.scalar("SELECT COUNT(*) as count FROM test_users");
    expect(typeof count).toBe("number");
    expect(count).toBeGreaterThan(0);
  });
});

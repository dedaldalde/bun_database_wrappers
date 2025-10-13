import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { SQLiteWrapper } from "../src/wrappers/sqlitewrapper";

describe("SQLiteWrapper", () => {
  let db: SQLiteWrapper;

  beforeAll(async () => {
    // Create an in-memory database
    db = new SQLiteWrapper(":memory:");
  });

  afterAll(async () => {
    await db.close();
  });

  test("should create table", async () => {
    await db.createTable("users", {
      id: "INTEGER PRIMARY KEY AUTOINCREMENT",
      name: "TEXT NOT NULL",
      email: "TEXT UNIQUE NOT NULL",
      age: "INTEGER",
      created_at: "DATETIME DEFAULT CURRENT_TIMESTAMP"
    });

    // Verify table exists by trying to query it
    const result = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='users'");
    expect(result.length).toBe(1);
  });

  test("should insert data", async () => {
    const result = await db.insert("users", {
      name: "Alice",
      email: "alice@example.com",
      age: 30
    });
    
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].name).toBe("Alice");
  });

  test("should select all data", async () => {
    await db.insert("users", { name: "Bob", email: "bob@example.com", age: 25 });
    
    const users = await db.select("users");
    expect(users.length).toBeGreaterThanOrEqual(2);
  });

  test("should get single row", async () => {
    const user = await db.getRow("users", "email = ?", ["alice@example.com"]);
    expect(user).toBeDefined();
    expect(user?.name).toBe("Alice");
    expect(user?.age).toBe(30);
  });

  test("should get single value", async () => {
    const name = await db.getValue("users", "name", "email = ?", ["bob@example.com"]);
    expect(name).toBe("Bob");
  });

  test("should update data", async () => {
    await db.update("users", { age: 31 }, "email = ?", ["alice@example.com"]);
    
    const age = await db.getValue("users", "age", "email = ?", ["alice@example.com"]);
    expect(age).toBe(31);
  });

  test("should perform upsert (insert)", async () => {
    await db.upsert(
      "users",
      { name: "Charlie", email: "charlie@example.com", age: 35 },
      ["email"]
    );
    
    const charlie = await db.getRow("users", "email = ?", ["charlie@example.com"]);
    expect(charlie).toBeDefined();
    expect(charlie?.age).toBe(35);
  });

  test("should perform upsert (update)", async () => {
    await db.upsert(
      "users",
      { name: "Charlie Updated", email: "charlie@example.com", age: 36 },
      ["email"]
    );
    
    const charlie = await db.getRow("users", "email = ?", ["charlie@example.com"]);
    expect(charlie?.age).toBe(36);
  });

  test("should insert or ignore", async () => {
    // First insert should succeed
    await db.insertOrIgnore("users", { name: "David", email: "david@example.com", age: 40 });
    
    // Second insert with same email should be ignored
    await db.insertOrIgnore("users", { name: "David 2", email: "david@example.com", age: 41 });
    
    const david = await db.getRow("users", "email = ?", ["david@example.com"]);
    expect(david?.name).toBe("David"); // Original name
    expect(david?.age).toBe(40); // Original age
  });

  test("should delete data", async () => {
    await db.delete("users", "email = ?", ["david@example.com"]);
    
    const david = await db.getRow("users", "email = ?", ["david@example.com"]);
    expect(david).toBeUndefined();
  });

  test("should handle transactions", async () => {
    await db.createTable("orders", {
      id: "INTEGER PRIMARY KEY AUTOINCREMENT",
      user_id: "INTEGER NOT NULL",
      product: "TEXT NOT NULL",
      amount: "REAL NOT NULL"
    });

    await db.transaction([
      { sql: "INSERT INTO orders (user_id, product, amount) VALUES (?, ?, ?)", params: [1, "Laptop", 999.99] },
      { sql: "INSERT INTO orders (user_id, product, amount) VALUES (?, ?, ?)", params: [1, "Mouse", 29.99] },
      { sql: "INSERT INTO orders (user_id, product, amount) VALUES (?, ?, ?)", params: [2, "Keyboard", 79.99] }
    ]);

    const orders = await db.select("orders");
    expect(orders.length).toBe(3);
  });

  test("should execute raw queries", async () => {
    const result = await db.all("SELECT * FROM users WHERE age > ?", [25]);
    expect(result.length).toBeGreaterThan(0);
  });

  test("should get scalar value", async () => {
    const count = await db.scalar("SELECT COUNT(*) as count FROM users");
    expect(typeof count).toBe("number");
    expect(count).toBeGreaterThan(0);
  });

  test("should select with where clause", async () => {
    const users = await db.select("users", "*", "age > ?", [30]);
    expect(users.length).toBeGreaterThan(0);
    users.forEach((user: any) => {
      expect(user.age).toBeGreaterThan(30);
    });
  });

  test("should select specific columns", async () => {
    const users = await db.select("users", "name, email");
    expect(users.length).toBeGreaterThan(0);
    expect(users[0].name).toBeDefined();
    expect(users[0].email).toBeDefined();
    expect(users[0].age).toBeUndefined();
  });

  test("should handle multiple parameters", async () => {
    const result = await db.all(
      "SELECT * FROM users WHERE age > ? AND age < ?",
      [20, 40]
    );
    expect(result).toBeDefined();
  });
});

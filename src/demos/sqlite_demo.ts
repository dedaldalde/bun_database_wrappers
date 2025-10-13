import { SQLiteWrapper } from "../wrappers/sqlitewrapper";

async function testSQLiteWrapper() {
  console.log("Testing SQLiteWrapper with Bun SQL API...\n");

  // Create an in-memory database
  const db = new SQLiteWrapper(":memory:");
  try {
    // Create a table
    console.log("Creating users table...");
    await db.createTable("users", {
      id: "INTEGER PRIMARY KEY AUTOINCREMENT",
      name: "TEXT NOT NULL",
      email: "TEXT UNIQUE NOT NULL",
      age: "INTEGER",
      created_at: "DATETIME DEFAULT CURRENT_TIMESTAMP"
    });
    console.log("✓ Table created\n");

    // Create orders table
    console.log("Creating orders table...");
    await db.createTable("orders", {
      id: "INTEGER PRIMARY KEY AUTOINCREMENT",
      user_id: "INTEGER NOT NULL",
      product: "TEXT NOT NULL",
      amount: "REAL NOT NULL",
      order_date: "DATETIME DEFAULT CURRENT_TIMESTAMP"
    });
    console.log("✓ Orders table created\n");

    // Insert some data
    console.log("Inserting users...");
    await db.insert("users", { name: "Alice", email: "alice@example.com", age: 30 });
    await db.insert("users", { name: "Bob", email: "bob@example.com", age: 25 });
    await db.insert("users", { name: "Charlie", email: "charlie@example.com", age: 35 });
    console.log("✓ Users inserted\n");

    // Insert orders
    console.log("Inserting orders...");
    await db.insert("orders", { user_id: 1, product: "Laptop", amount: 999.99 });
    await db.insert("orders", { user_id: 1, product: "Mouse", amount: 29.99 });
    await db.insert("orders", { user_id: 2, product: "Keyboard", amount: 79.99 });
    await db.insert("orders", { user_id: 3, product: "Monitor", amount: 299.99 });
    console.log("✓ Orders inserted\n");

    // Select all users
    console.log("Selecting all users:");
    const allUsers = await db.select("users");
    console.table(allUsers);

    // Get a single user
    console.log("\nGetting user with id = 1:");
    const user = await db.getRow("users", "id = ?", [1]);
    console.log(user);

    // Get a scalar value
    console.log("\nGetting count of users:");
    const count = await db.scalar("SELECT COUNT(*) as count FROM users");
    console.log("Count:", count);

    // Update a user
    console.log("\nUpdating Bob's age...");
    await db.update("users", { age: 26 }, "name = ?", ["Bob"]);
    const updatedBob = await db.getRow("users", "name = ?", ["Bob"]);
    console.log("Updated Bob:", updatedBob);

    // Test transaction
    console.log("\nTesting transaction...");
    await db.transaction([
      { sql: "INSERT INTO users (name, email, age) VALUES (?, ?, ?)", params: ["Dave", "dave@example.com", 40] },
      { sql: "INSERT INTO users (name, email, age) VALUES (?, ?, ?)", params: ["Eve", "eve@example.com", 28] }
    ]);
    const finalCount = await db.scalar("SELECT COUNT(*) as count FROM users");
    console.log("✓ Transaction completed. Final count:", finalCount);

    // Select with WHERE clause
    console.log("\nUsers older than 30:");
    const olderUsers = await db.select("users", "*", "age > ?", [30]);
    console.table(olderUsers);

    // Test upsert
    console.log("\nTesting upsert (inserting duplicate email)...");
    await db.upsert("users", 
      { name: "Alice Updated", email: "alice@example.com", age: 31 }, 
      ["email"], 
      true
    );
    const aliceUpdated = await db.getRow("users", "email = ?", ["alice@example.com"]);
    console.log("Alice after upsert:", aliceUpdated);

    // Delete a user
    console.log("\nDeleting Charlie...");
    await db.delete("users", "name = ?", ["Charlie"]);
    const afterDelete = await db.select("users");
    console.log("Users after delete:");
    console.table(afterDelete);

    // Test INNER JOIN using db.all()
    console.log("\nTesting INNER JOIN - Users with their orders:");
    const joinQuery = `
      SELECT 
        users.id, 
        users.name, 
        users.email, 
        orders.product, 
        orders.amount, 
        orders.order_date
      FROM users
      INNER JOIN orders ON users.id = orders.user_id
      ORDER BY users.name, orders.order_date
    `;
    const usersWithOrders = await db.all(joinQuery);
    console.table(usersWithOrders);

    // Test INNER JOIN with WHERE clause
    console.log("\nUsers with orders over $50:");
    const expensiveOrders = await db.all(
      `SELECT 
        users.name, 
        orders.product, 
        orders.amount
      FROM users
      INNER JOIN orders ON users.id = orders.user_id
      WHERE orders.amount > ?
      ORDER BY orders.amount DESC`,
      [50]
    );
    console.table(expensiveOrders);

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await db.close();
    console.log("\n✓ Database connection closed");
  }
}

// Run the test
testSQLiteWrapper().catch(console.error);

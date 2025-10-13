import { MySQLWrapper } from "../wrappers/mysqlwrapper";

/**
 * Test MySQL Wrapper
 * 
 * NOTE: This test uses MySQL environment variables:
 * - MYSQL_HOST (or defaults to localhost)
 * - MYSQL_USER or MYSQL_USERL
 * - MYSQL_PASSWORD
 * - MYSQL_DATABASE (or defaults to testdb)
 * - MYSQL_PORT (or defaults to 3306)
 */

async function testMySQLWrapper() {
  console.log("Testing MySQLWrapper with Bun SQL API...\n");

  // Read from environment variables
  const host = process.env.MYSQL_HOST || "localhost";
  const user = process.env.MYSQL_USER || process.env.MYSQL_USERL || "root";
  const password = process.env.MYSQL_PASSWORD || "";
  const database = process.env.MYSQL_DATABASE || "testdb";
  const port = parseInt(process.env.MYSQL_PORT || "3306");

  console.log(`Connecting to MySQL:`);
  console.log(`  Host: ${host}`);
  console.log(`  Port: ${port}`);
  console.log(`  User: ${user}`);
  console.log(`  Database: ${database}`);
  console.log();

  // Using connection options from environment variables
  const db = new MySQLWrapper("", {
    hostname: host,
    port: port,
    database: database,
    username: user,
    password: password,
    max: 10, // Connection pool size
    idleTimeout: 30,
  });
  
  try {
    // Test connection
    console.log("Testing connection...");
    const version = await db.scalar("SELECT VERSION() as version");
    console.log("✓ Connected to MySQL version:", version);
    console.log();

    // Drop table if exists (for clean test)
    await db.run("DROP TABLE IF EXISTS users");
    
    // Create a table
    console.log("Creating users table...");
    await db.createTable("users", {
      id: "INT AUTO_INCREMENT PRIMARY KEY",
      name: "VARCHAR(100) NOT NULL",
      email: "VARCHAR(255) UNIQUE NOT NULL",
      age: "INT",
      created_at: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
    });
    console.log("✓ Table created\n");

    // Check if table exists
    const exists = await db.tableExists("users");
    console.log("Table exists:", exists, "\n");

    // Insert single user using helper method
    console.log("Inserting users...");
    await db.insert("users", { 
      name: "Alice", 
      email: "alice@example.com", 
      age: 30 
    });
    
    // Get last insert ID
    const lastId = await db.lastInsertId();
    console.log("Last insert ID:", lastId);

    // Insert more users using traditional method
    await db.run(
      "INSERT INTO users (name, email, age) VALUES (?, ?, ?)",
      ["Bob", "bob@example.com", 25]
    );
    await db.run(
      "INSERT INTO users (name, email, age) VALUES (?, ?, ?)",
      ["Charlie", "charlie@example.com", 35]
    );
    console.log("✓ Users inserted\n");

    // Bulk insert
    console.log("Bulk inserting users...");
    await db.insertMany("users", [
      { name: "Dave", email: "dave@example.com", age: 40 },
      { name: "Eve", email: "eve@example.com", age: 28 }
    ]);
    console.log("✓ Bulk insert completed\n");

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
    try {
      await db.transaction([
        { 
          sql: "INSERT INTO users (name, email, age) VALUES (?, ?, ?)", 
          params: ["Frank", "frank@example.com", 45] 
        },
        { 
          sql: "UPDATE users SET age = age + 1 WHERE name = ?", 
          params: ["Alice"] 
        }
      ]);
      console.log("✓ Transaction completed successfully");
    } catch (error) {
      console.error("Transaction failed:", error);
    }

    // Verify transaction results
    const finalCount = await db.scalar("SELECT COUNT(*) as count FROM users");
    console.log("Final count:", finalCount);
    const aliceAfterTx = await db.getRow("users", "name = ?", ["Alice"]);
    console.log("Alice after transaction:", aliceAfterTx);

    // Select with WHERE clause
    console.log("\nUsers older than 30:");
    const olderUsers = await db.select("users", "*", "age > ?", [30]);
    console.table(olderUsers);

    // Test upsert (INSERT ... ON DUPLICATE KEY UPDATE)
    console.log("\nTesting upsert (inserting duplicate email)...");
    try {
      await db.upsert(
        "users",
        { name: "Alice Updated", email: "alice@example.com", age: 32 },
        ["name", "age"] // Columns to update on duplicate
      );
      const aliceUpdated = await db.getRow("users", "email = ?", ["alice@example.com"]);
      console.log("Alice after upsert:", aliceUpdated);
    } catch (error) {
      console.error("Upsert error:", error);
    }

    // Test INSERT IGNORE
    console.log("\nTesting INSERT IGNORE (duplicate email)...");
    await db.insertIgnore("users", {
      name: "Bob Duplicate",
      email: "bob@example.com", // Duplicate email
      age: 99
    });
    const bobCheck = await db.getRow("users", "email = ?", ["bob@example.com"]);
    console.log("Bob after INSERT IGNORE:", bobCheck);

    // Delete a user
    console.log("\nDeleting Charlie...");
    await db.delete("users", "name = ?", ["Charlie"]);
    const afterDelete = await db.select("users");
    console.log("Users after delete:");
    console.table(afterDelete);

    // Get table structure
    console.log("\nTable structure:");
    const tableStructure = await db.describeTable("users");
    console.table(tableStructure);

    // List all tables
    console.log("\nAll tables in database:");
    const tables = await db.getTables();
    console.log(tables);

    // Complex query using template literals
    console.log("\nComplex query - users with age between 25 and 35:");
    const midAgeUsers = await db.all(
      "SELECT name, email, age FROM users WHERE age BETWEEN ? AND ? ORDER BY age",
      [25, 35]
    );
    console.table(midAgeUsers);

    // INNER JOIN example
    console.log("\n=== INNER JOIN Example ===");
    
    // Create orders table
    console.log("\nCreating orders table...");
    await db.createTable("orders", {
      id: "INT AUTO_INCREMENT PRIMARY KEY",
      user_id: "INT NOT NULL",
      product: "VARCHAR(100) NOT NULL",
      amount: "DECIMAL(10, 2) NOT NULL",
      order_date: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
      "FOREIGN KEY (user_id)": "REFERENCES users(id)"
    });
    console.log("✓ Orders table created");

    // Insert sample orders
    console.log("\nInserting sample orders...");
    await db.insertMany("orders", [
      { user_id: 1, product: "Laptop", amount: 999.99 },
      { user_id: 1, product: "Mouse", amount: 29.99 },
      { user_id: 2, product: "Keyboard", amount: 79.99 },
      { user_id: 4, product: "Monitor", amount: 299.99 },
      { user_id: 5, product: "Headphones", amount: 149.99 }
    ]);
    console.log("✓ Orders inserted");

    // INNER JOIN - Get users with their orders
    console.log("\nINNER JOIN - Users with their orders:");
    const usersWithOrders = await db.all(`
      SELECT 
        users.id,
        users.name,
        users.email,
        users.age,
        orders.product,
        orders.amount,
        orders.order_date
      FROM users
      INNER JOIN orders ON users.id = orders.user_id
      ORDER BY users.name, orders.id
    `);
    console.table(usersWithOrders);

    // INNER JOIN with aggregation
    console.log("\nINNER JOIN with SUM - Total spending per user:");
    const userSpending = await db.all(`
      SELECT 
        users.name,
        users.email,
        COUNT(orders.id) as order_count,
        SUM(orders.amount) as total_spent
      FROM users
      INNER JOIN orders ON users.id = orders.user_id
      GROUP BY users.id, users.name, users.email
      ORDER BY total_spent DESC
    `);
    console.table(userSpending);

    // INNER JOIN with WHERE clause
    console.log("\nINNER JOIN with WHERE - Orders over $100:");
    const largeOrders = await db.all(`
      SELECT 
        users.name,
        orders.product,
        orders.amount
      FROM users
      INNER JOIN orders ON users.id = orders.user_id
      WHERE orders.amount > ?
      ORDER BY orders.amount DESC
    `, [100]);
    console.table(largeOrders);

    // Clean up orders table
    console.log("\nDropping orders table...");
    await db.run("DROP TABLE IF EXISTS orders");
    console.log("✓ Orders table dropped");

  } catch (error) {
    console.error("Error:", error);
  } finally {
    // Clean up
    console.log("\nCleaning up...");
    try {
      await db.run("DROP TABLE IF EXISTS users");
      console.log("✓ Table dropped");
    } catch (e) {
      console.error("Cleanup error:", e);
    }
    
    await db.close();
    console.log("✓ Database connection closed");
  }
}

// Run the test
testMySQLWrapper().catch(console.error);

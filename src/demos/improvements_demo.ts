/**
 * Demonstration of all improvements to the database wrappers
 * Run with: bun run src/demos/improvements_demo.ts
 */

import { createSQLite, createRedis, DBError, type QueryResult } from "../wrappers";

// ============================================================================
// Type-Safe Interfaces
// ============================================================================

interface User extends Record<string, unknown> {
  id?: number;
  name: string;
  email: string;
  age: number;
  created_at?: string;
}

interface Product extends Record<string, unknown> {
  id: number;
  name: string;
  price: number;
  stock: number;
}

interface SessionData extends Record<string, unknown> {
  userId: number;
  token: string;
  loginAt: number;
  expiresAt: number;
}

// ============================================================================
// 1. Type Safety Demonstration
// ============================================================================

async function demonstrateTypeSafety() {
  console.log("\n=== 1. Type Safety ===\n");

  await using db = createSQLite(":memory:");

  // Create table
  await db.createTable("users", {
    id: "INTEGER PRIMARY KEY AUTOINCREMENT",
    name: "TEXT NOT NULL",
    email: "TEXT UNIQUE NOT NULL",
    age: "INTEGER",
    created_at: "DATETIME DEFAULT CURRENT_TIMESTAMP"
  });

  // ✅ Type-safe insert
  const insertResult = await db.insert<User>("users", {
    name: "Alice",
    email: "alice@example.com",
    age: 30
  });
  console.log("✓ Inserted user:", insertResult[0]);

  // ✅ Type-safe select - TypeScript knows the shape
  const users = await db.select<User>("users");
  users.forEach(user => {
    console.log(`✓ User: ${user.name} (${user.email}), Age: ${user.age}`);
    // TypeScript autocomplete works perfectly here!
  });

  // ✅ Type-safe scalar query
  const avgAge = await db.scalar<number>("SELECT AVG(age) FROM users");
  console.log(`✓ Average age: ${avgAge}`);

  // ✅ Type-safe single row
  const alice = await db.get<User>("SELECT * FROM users WHERE name = ?", ["Alice"]);
  if (alice) {
    console.log(`✓ Found user: ${alice.name} with email ${alice.email}`);
  }
}

// ============================================================================
// 2. Security - Identifier Validation
// ============================================================================

async function demonstrateSecurity() {
  console.log("\n=== 2. Security - Identifier Validation ===\n");

  await using db = createSQLite(":memory:");

  await db.createTable("products", {
    id: "INTEGER PRIMARY KEY AUTOINCREMENT",
    name: "TEXT NOT NULL",
    price: "REAL NOT NULL"
  });

  // ✅ Valid identifiers work fine
  await db.insert("products", { name: "Widget", price: 19.99 });
  console.log("✓ Valid table name 'products' accepted");

  // ❌ Invalid identifiers are rejected
  try {
    await db.select("products; DROP TABLE products--", "*");
    console.log("✗ SECURITY FAILURE - SQL injection not blocked!");
  } catch (error) {
    if (error instanceof Error) {
      console.log("✓ SQL injection attempt blocked:", error.message);
    }
  }

  // ❌ Special characters rejected
  try {
    await db.select("products' OR '1'='1", "*");
  } catch (error) {
    if (error instanceof Error) {
      console.log("✓ Invalid identifier blocked:", error.message);
    }
  }
}

// ============================================================================
// 3. Enhanced Error Handling
// ============================================================================

async function demonstrateErrorHandling() {
  console.log("\n=== 3. Enhanced Error Handling ===\n");

  await using db = createSQLite(":memory:");

  await db.createTable("orders", {
    id: "INTEGER PRIMARY KEY AUTOINCREMENT",
    user_id: "INTEGER NOT NULL",
    total: "REAL NOT NULL"
  });

  // ❌ Intentional error - invalid column
  try {
    await db.select("orders", "invalid_column, user_id");
  } catch (error) {
    if (error instanceof DBError) {
      console.log("✓ DBError caught with context:");
      console.log("  Message:", error.message);
      console.log("  Query:", error.context.query);
      console.log("  Params:", error.context.params);
      console.log("  Has stack trace:", !!error.stack);
    }
  }

  // ❌ Another error - table doesn't exist
  try {
    await db.select("nonexistent_table", "*");
  } catch (error) {
    if (error instanceof DBError) {
      console.log("✓ Another DBError with context:");
      console.log("  Message:", error.message);
    }
  }
}

// ============================================================================
// 4. Async Dispose Pattern
// ============================================================================

async function demonstrateAsyncDispose() {
  console.log("\n=== 4. Async Dispose Pattern ===\n");

  console.log("✓ Creating database with 'using await' ...");
  {
    await using db = createSQLite(":memory:");
    
    await db.createTable("temp", {
      id: "INTEGER PRIMARY KEY",
      value: "TEXT"
    });
    
    await db.insert("temp", { id: 1, value: "test" });
    console.log("✓ Database operations completed");
    
    // No need to call db.close() - it's automatic!
  } // ← Connection automatically closed here
  
  console.log("✓ Database connection automatically closed when scope ended");
  console.log("  (No manual cleanup required!)");
}

// ============================================================================
// 5. Redis Type-Safe JSON
// ============================================================================

async function demonstrateRedisJSON() {
  console.log("\n=== 5. Redis Type-Safe JSON ===\n");

  try {
    await using redis = await createRedis();

    // ✅ Type-safe JSON storage
    const session: SessionData = {
      userId: 123,
      token: "abc123def456",
      loginAt: Date.now(),
      expiresAt: Date.now() + 3600000
    };

    await redis.setJSON<SessionData>("session:user:123", session, { EX: 3600 });
    console.log("✓ Stored typed session data in Redis");

    // ✅ Type-safe JSON retrieval
    const retrieved = await redis.getJSON<SessionData>("session:user:123");
    if (retrieved) {
      console.log("✓ Retrieved session data:");
      console.log("  User ID:", retrieved.userId); // TypeScript knows this is a number
      console.log("  Token:", retrieved.token.substring(0, 10) + "...");
      console.log("  Expires at:", new Date(retrieved.expiresAt).toISOString());
    }

    // ✅ Ergonomic TTL setting
    const ttlSet = await redis.setTTL("session:user:123", 7200);
    console.log("✓ TTL updated successfully:", ttlSet);

    // Cleanup
    await redis.del("session:user:123");
    
  } catch (error) {
    console.log("⚠ Redis not available (this is okay for demo):", 
      error instanceof Error ? error.message : "Unknown error");
  }
}

// ============================================================================
// 6. Redis Transaction Safety
// ============================================================================

async function demonstrateTransactionSafety() {
  console.log("\n=== 6. Redis Transaction Safety ===\n");

  try {
    await using redis = await createRedis();

    // ✅ Safe transaction with automatic DISCARD on error
    try {
      await redis.transaction([
        ["SET", "counter", "0"],
        ["INCR", "counter"],
        ["INCR", "counter"],
        ["GET", "counter"]
      ]);
      
      const value = await redis.get("counter");
      console.log("✓ Transaction completed successfully. Counter value:", value);
      
      // Cleanup
      await redis.del("counter");
    } catch (error) {
      console.log("✗ Transaction failed but was automatically DISCARDED");
    }

  } catch (error) {
    console.log("⚠ Redis not available (this is okay for demo)");
  }
}

// ============================================================================
// 7. Factory Functions
// ============================================================================

async function demonstrateFactoryFunctions() {
  console.log("\n=== 7. Factory Functions ===\n");

  // ✅ Clean, simple instantiation
  console.log("✓ Using factory functions for clean instantiation:");
  
  await using sqlite = createSQLite(":memory:");
  console.log("  - createSQLite() creates SQLite wrapper");
  
  try {
    await using redis = await createRedis();
    console.log("  - createRedis() creates and connects Redis wrapper");
  } catch {
    console.log("  - createRedis() would create Redis wrapper (if available)");
  }
  
  console.log("✓ All wrappers support async dispose pattern");
}

// ============================================================================
// 8. Comprehensive Example
// ============================================================================

async function comprehensiveExample() {
  console.log("\n=== 8. Comprehensive Real-World Example ===\n");

  await using db = createSQLite(":memory:");

  try {
    // Create schema
    await db.createTable("users", {
      id: "INTEGER PRIMARY KEY AUTOINCREMENT",
      name: "TEXT NOT NULL",
      email: "TEXT UNIQUE NOT NULL"
    });

    await db.createTable("orders", {
      id: "INTEGER PRIMARY KEY AUTOINCREMENT",
      user_id: "INTEGER NOT NULL",
      total: "REAL NOT NULL",
      status: "TEXT DEFAULT 'pending'"
    });

    // Insert users with type safety
    await db.insert<User>("users", { name: "Alice", email: "alice@example.com", age: 30 });
    await db.insert<User>("users", { name: "Bob", email: "bob@example.com", age: 25 });

    // Insert orders
    await db.run("INSERT INTO orders (user_id, total) VALUES (?, ?)", [1, 99.99]);
    await db.run("INSERT INTO orders (user_id, total) VALUES (?, ?)", [1, 49.50]);
    await db.run("INSERT INTO orders (user_id, total) VALUES (?, ?)", [2, 149.99]);

    // Type-safe complex query
    interface OrderSummary {
      user_name: string;
      user_email: string;
      order_count: number;
      total_spent: number;
    }

    const summary = await db.all<OrderSummary>(`
      SELECT 
        u.name as user_name,
        u.email as user_email,
        COUNT(o.id) as order_count,
        SUM(o.total) as total_spent
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
      GROUP BY u.id
    `);

    console.log("✓ Order summary:");
    summary.forEach(row => {
      console.log(`  ${row.user_name} (${row.user_email}):`);
      console.log(`    Orders: ${row.order_count}`);
      console.log(`    Total: $${row.total_spent?.toFixed(2) || '0.00'}`);
    });

    // Transaction with error handling
    try {
      await db.transaction([
        { sql: "UPDATE orders SET status = ? WHERE user_id = ?", params: ["shipped", 1] },
        { sql: "UPDATE orders SET status = ? WHERE user_id = ?", params: ["shipped", 2] }
      ]);
      console.log("✓ Transaction completed - all orders marked as shipped");
    } catch (error) {
      if (error instanceof DBError) {
        console.log("✗ Transaction failed:", error.message);
      }
    }

  } catch (error) {
    if (error instanceof DBError) {
      console.error("Database error:", error.message);
      console.error("Query:", error.context.query);
    }
  }
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║  Database Wrapper Improvements Demo                       ║");
  console.log("║  Showcasing type safety, security, and DX enhancements    ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  try {
    await demonstrateTypeSafety();
    await demonstrateSecurity();
    await demonstrateErrorHandling();
    await demonstrateAsyncDispose();
    await demonstrateRedisJSON();
    await demonstrateTransactionSafety();
    await demonstrateFactoryFunctions();
    await comprehensiveExample();

    console.log("\n╔════════════════════════════════════════════════════════════╗");
    console.log("║  ✅ All demonstrations completed successfully!            ║");
    console.log("╚════════════════════════════════════════════════════════════╝\n");

  } catch (error) {
    console.error("\n❌ Demonstration failed:", error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.main) {
  main();
}

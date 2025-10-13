# 🎯 Real-World Examples: See the Difference

This document shows side-by-side comparisons of common database tasks with and without these wrappers.

## Table of Contents

- [Basic CRUD Operations](#basic-crud-operations)
- [Transaction Handling](#transaction-handling)
- [Type Safety Benefits](#type-safety-benefits)
- [Error Handling](#error-handling)
- [Resource Management](#resource-management)
- [Complex Queries](#complex-queries)
- [Caching Patterns](#caching-patterns)

---

## Basic CRUD Operations

### ❌ Without Wrappers (Bun's Raw SQL API)

```typescript
import { Database } from "bun:sql";

const db = Database.open("./app.db");

// Create table - manual SQL
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    age INTEGER
  )
`);

// Insert - verbose and error-prone
const insertStmt = db.prepare("INSERT INTO users (name, email, age) VALUES (?, ?, ?)");
insertStmt.run("Alice", "alice@example.com", 30);
insertStmt.finalize();

// Select - no type safety
const selectStmt = db.prepare("SELECT * FROM users WHERE age > ?");
const users = selectStmt.all(18); // users: any[] ← No types!
selectStmt.finalize();

// Update - manual SQL construction
const updateStmt = db.prepare("UPDATE users SET age = ? WHERE name = ?");
updateStmt.run(31, "Alice");
updateStmt.finalize();

// Delete - manual SQL
const deleteStmt = db.prepare("DELETE FROM users WHERE name = ?");
deleteStmt.run("Alice");
deleteStmt.finalize();

// Manual cleanup
db.close();
```

**Problems:**
- 🔴 No type safety (everything is `any`)
- 🔴 Verbose and repetitive
- 🔴 Manual statement finalization
- 🔴 Easy to forget cleanup
- 🔴 No validation or protection

### ✅ With Wrappers

```typescript
import { createSQLite } from "./wrappers";

interface User extends Record<string, unknown> {
  id?: number;
  name: string;
  email: string;
  age: number;
}

// Automatic cleanup with 'await using'
await using db = createSQLite("./app.db");

// Create table - helper method
await db.createTable("users", {
  id: "INTEGER PRIMARY KEY AUTOINCREMENT",
  name: "TEXT NOT NULL",
  email: "TEXT UNIQUE NOT NULL",
  age: "INTEGER"
});

// Insert - clean and simple
await db.insert<User>("users", { 
  name: "Alice", 
  email: "alice@example.com", 
  age: 30 
});

// Select - fully typed!
const users = await db.select<User>("users", "*", "age > ?", [18]);
// users: User[] ← Full TypeScript support!
users.forEach(user => {
  console.log(user.name); // ← Autocomplete works!
});

// Update - simple method
await db.update("users", { age: 31 }, "name = ?", ["Alice"]);

// Delete - clean API
await db.delete("users", "name = ?", ["Alice"]);

// Automatic cleanup - no close() needed!
```

**Benefits:**
- ✅ Full type safety with autocomplete
- ✅ 70% less code
- ✅ Automatic resource management
- ✅ SQL injection protection
- ✅ Rich error context

---

## Transaction Handling

### ❌ Without Wrappers

```typescript
const db = Database.open("./shop.db");

// Manual transaction management
db.exec("BEGIN");

try {
  // Step 1: Check inventory
  const product = db.prepare("SELECT stock FROM products WHERE id = ?").get(123);
  if (!product || product.stock < 5) {
    throw new Error("Insufficient stock");
  }

  // Step 2: Update inventory
  db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?")
    .run(5, 123);

  // Step 3: Create order
  db.prepare("INSERT INTO orders (user_id, total) VALUES (?, ?)")
    .run(456, 99.99);

  const orderId = db.lastInsertRowId;

  // Step 4: Add order items
  db.prepare("INSERT INTO order_items (order_id, product_id, quantity) VALUES (?, ?, ?)")
    .run(orderId, 123, 5);

  // Commit if all succeeded
  db.exec("COMMIT");
  console.log("✓ Order processed");

} catch (error) {
  // Rollback on any error
  db.exec("ROLLBACK");
  console.error("✗ Order failed:", error);
  throw error;
}

db.close();
```

**Problems:**
- 🔴 Manual BEGIN/COMMIT/ROLLBACK
- 🔴 Easy to forget rollback
- 🔴 Verbose error handling
- 🔴 No automatic cleanup

### ✅ With Wrappers

```typescript
await using db = createSQLite("./shop.db");

try {
  await db.transaction([
    // All operations in one atomic block
    { sql: "SELECT stock FROM products WHERE id = ? AND stock >= ?", 
      params: [123, 5] },
    { sql: "UPDATE products SET stock = stock - ? WHERE id = ?", 
      params: [5, 123] },
    { sql: "INSERT INTO orders (user_id, total) VALUES (?, ?)", 
      params: [456, 99.99] },
    { sql: "INSERT INTO order_items (order_id, product_id, quantity) VALUES (?, ?, ?)",
      params: [1, 123, 5] }
  ]);
  
  console.log("✓ Order processed");
  
} catch (error) {
  console.error("✗ Order failed - automatically rolled back");
}

// Automatic cleanup
```

**Benefits:**
- ✅ Automatic BEGIN/COMMIT/ROLLBACK
- ✅ Simple array-based API
- ✅ Automatic rollback on error
- ✅ 60% less code
- ✅ Cleaner and safer

---

## Type Safety Benefits

### ❌ Without Wrappers

```typescript
// No type information
const user = db.prepare("SELECT * FROM users WHERE id = ?").get(1);

// TypeScript doesn't know what properties exist
console.log(user.name);     // No error, but might crash at runtime!
console.log(user.namee);    // Typo - no error caught!
console.log(user.age + 1);  // Might be string, not number!

// No autocomplete support
// No refactoring support
// Runtime errors waiting to happen
```

### ✅ With Wrappers

```typescript
interface User extends Record<string, unknown> {
  id: number;
  name: string;
  email: string;
  age: number;
}

const user = await db.get<User>("SELECT * FROM users WHERE id = ?", [1]);

if (user) {
  console.log(user.name);     // ✓ Type checked
  console.log(user.namee);    // ✗ TypeScript error caught!
  console.log(user.age + 1);  // ✓ Type safe - age is number
  
  // Full autocomplete support
  // Safe refactoring
  // Catch errors at compile time
}
```

**Benefits:**
- ✅ Catch errors before runtime
- ✅ Full IDE autocomplete
- ✅ Safe refactoring
- ✅ Better code documentation
- ✅ Fewer bugs in production

---

## Error Handling

### ❌ Without Wrappers

```typescript
try {
  const result = db.prepare("SELECT * FROM invalid_table").all();
} catch (error) {
  // Generic error - no context
  console.error(error);
  // Error: no such table: invalid_table
  
  // No information about:
  // - What query caused the error?
  // - What were the parameters?
  // - Where in the code did this happen?
}
```

### ✅ With Wrappers

```typescript
import { DBError } from "./wrappers";

try {
  const result = await db.select("invalid_table", "*");
} catch (error) {
  if (error instanceof DBError) {
    // Rich error context!
    console.error("Query:", error.context.query);
    console.error("Params:", error.context.params);
    console.error("Message:", error.message);
    console.error("Original error:", error.cause);
    console.error("Stack trace:", error.stack);
    
    // Full context for debugging and logging
  }
}
```

**Benefits:**
- ✅ Rich error context
- ✅ Query and parameters included
- ✅ Better debugging experience
- ✅ Better error logging
- ✅ Easier to diagnose production issues

---

## Resource Management

### ❌ Without Wrappers

```typescript
// Easy to forget cleanup
const db = Database.open("./app.db");

try {
  // Do work
  const data = db.prepare("SELECT * FROM users").all();
  
  // ... more operations ...
  
} catch (error) {
  console.error(error);
} finally {
  // MUST remember to close!
  db.close();
}

// What if you return early?
// What if there's an exception in the finally block?
// What if you nest multiple databases?
```

### ✅ With Wrappers

```typescript
// Automatic cleanup with 'await using'
await using db = createSQLite("./app.db");

// Do work
const data = await db.select("users");

// ... more operations ...

// Database automatically closes when scope ends
// Works with early returns
// Works with exceptions
// Perfect for nested databases
```

**Benefits:**
- ✅ Impossible to forget cleanup
- ✅ Works with early returns
- ✅ Exception safe
- ✅ Cleaner code
- ✅ No memory leaks

---

## Complex Queries

### ❌ Without Wrappers

```typescript
// Building complex queries manually
const sql = `
  SELECT 
    u.id,
    u.name,
    u.email,
    COUNT(o.id) as order_count,
    SUM(o.total) as total_spent,
    AVG(o.total) as avg_order
  FROM users u
  LEFT JOIN orders o ON u.id = o.user_id
  WHERE u.age > ?
  GROUP BY u.id, u.name, u.email
  HAVING total_spent > ?
  ORDER BY total_spent DESC
  LIMIT ?
`;

const stmt = db.prepare(sql);
const results = stmt.all(18, 100, 10); // results: any[]

// No type safety on results
results.forEach((row: any) => {
  console.log(row.name, row.order_count); // No autocomplete
});

stmt.finalize();
```

### ✅ With Wrappers

```typescript
interface UserStats extends Record<string, unknown> {
  id: number;
  name: string;
  email: string;
  order_count: number;
  total_spent: number;
  avg_order: number;
}

const results = await db.all<UserStats>(`
  SELECT 
    u.id,
    u.name,
    u.email,
    COUNT(o.id) as order_count,
    SUM(o.total) as total_spent,
    AVG(o.total) as avg_order
  FROM users u
  LEFT JOIN orders o ON u.id = o.user_id
  WHERE u.age > ?
  GROUP BY u.id, u.name, u.email
  HAVING total_spent > ?
  ORDER BY total_spent DESC
  LIMIT ?
`, [18, 100, 10]);

// Full type safety!
results.forEach(row => {
  console.log(row.name, row.order_count); // Full autocomplete!
  console.log(`$${row.total_spent.toFixed(2)}`); // Type safe!
});
```

**Benefits:**
- ✅ Type-safe complex queries
- ✅ Full autocomplete on results
- ✅ Cleaner code
- ✅ Better maintainability

---

## Caching Patterns

### ❌ Without Wrappers (Redis)

```typescript
import { RedisClient } from "bun:redis";

const redis = await RedisClient.connect("redis://localhost:6379");

// Manual JSON serialization
const user = { id: 123, name: "Alice", email: "alice@example.com" };
await redis.set("user:123", JSON.stringify(user));

// Manual JSON parsing
const cached = await redis.get("user:123");
if (cached) {
  const parsedUser = JSON.parse(cached); // parsedUser: any
  console.log(parsedUser.name); // No type safety
}

// Manual TTL setting
await redis.set("session:123", JSON.stringify(session));
await redis.expire("session:123", 3600); // Separate call

// Manual cleanup
redis.disconnect();
```

### ✅ With Wrappers

```typescript
await using redis = await createRedis();

interface User extends Record<string, unknown> {
  id: number;
  name: string;
  email: string;
}

// Automatic JSON handling with types
const user: User = { id: 123, name: "Alice", email: "alice@example.com" };
await redis.setJSON<User>("user:123", user);

// Type-safe retrieval
const cached = await redis.getJSON<User>("user:123");
if (cached) {
  console.log(cached.name); // Full type safety!
}

// TTL in one call
await redis.setJSON("session:123", session, { EX: 3600 });

// Automatic cleanup
```

**Benefits:**
- ✅ Automatic JSON serialization
- ✅ Type-safe JSON operations
- ✅ Cleaner TTL API
- ✅ 50% less code
- ✅ Automatic resource management

---

## Summary: Why Use These Wrappers?

| Feature | Without Wrappers | With Wrappers |
|---------|-----------------|---------------|
| **Type Safety** | ❌ Everything is `any` | ✅ Full TypeScript support |
| **Code Length** | 🔴 Verbose | ✅ 50-70% less code |
| **Error Handling** | 🔴 Basic errors | ✅ Rich context |
| **Resource Management** | 🔴 Manual cleanup | ✅ Automatic |
| **Security** | 🔴 Manual validation | ✅ Built-in protection |
| **Developer Experience** | 🔴 No autocomplete | ✅ Full IDE support |
| **Maintainability** | 🔴 Error-prone | ✅ Safe refactoring |
| **Learning Curve** | 🔴 Steep | ✅ Gentle |

## Try It Yourself!

Run the comprehensive demo to see all these benefits in action:

```bash
bun run demo:comprehensive
```

This shows real-world scenarios including:
- E-commerce order processing
- Session management
- Caching patterns
- Analytics queries
- Multi-database architectures

**You'll see the difference immediately!**

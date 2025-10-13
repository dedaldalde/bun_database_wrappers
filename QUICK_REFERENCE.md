# Quick Reference Guide

## Installation & Setup

```typescript
import { createMySQL, createRedis, createSQLite } from "./wrappers";

// With async dispose (recommended)
await using db = createSQLite(":memory:");
await using redis = await createRedis();
await using mysql = createMySQL("mysql://localhost/db");
```

## Type-Safe Queries

```typescript
interface User {
  id: number;
  name: string;
  email: string;
}

// SELECT with types
const users = await db.select<User>("users");
// users: User[]

// Single row
const user = await db.get<User>("SELECT * FROM users WHERE id = ?", [1]);
// user: User | undefined

// Scalar value
const count = await db.scalar<number>("SELECT COUNT(*) FROM users");
// count: number | undefined
```

## CRUD Operations

### Insert
```typescript
const result = await db.insert<User>("users", {
  name: "Alice",
  email: "alice@example.com"
});
```

### Update
```typescript
await db.update("users", 
  { name: "Bob" }, 
  "id = ?", 
  [123]
);
```

### Delete
```typescript
await db.delete("users", "id = ?", [123]);
```

### Select
```typescript
const users = await db.select<User>(
  "users",           // table
  "*",               // columns
  "age > ?",         // where clause
  [18]               // params
);
```

## Transactions

### SQL Databases
```typescript
await db.transaction([
  { sql: "INSERT INTO users (name) VALUES (?)", params: ["Alice"] },
  { sql: "UPDATE counter SET value = value + 1" }
]);
```

### Redis
```typescript
await redis.transaction([
  ["SET", "key1", "value1"],
  ["INCR", "counter"],
  ["GET", "key1"]
]);
```

## Redis JSON Operations

```typescript
interface Session {
  userId: number;
  token: string;
}

// Set JSON
await redis.setJSON<Session>("session:123", {
  userId: 456,
  token: "abc..."
});

// Get JSON
const session = await redis.getJSON<Session>("session:123");
if (session) {
  console.log(session.userId); // Type-safe!
}
```

## Error Handling

```typescript
import { DBError } from "./wrappers";

try {
  await db.select("users", "invalid_column");
} catch (error) {
  if (error instanceof DBError) {
    console.error("Query:", error.context.query);
    console.error("Params:", error.context.params);
    console.error("Cause:", error.cause);
  }
}
```

## Security

All table/column names are validated:

```typescript
// ✅ Valid
await db.select("users", "*");
await db.select("user_accounts", "*");

// ❌ Rejected (prevents SQL injection)
await db.select("users; DROP TABLE users--", "*");
// Error: Invalid SQL identifier
```

## Helper Methods

### MySQL
```typescript
// Get last insert ID
const id = await mysql.lastInsertId();

// Check if table exists
const exists = await mysql.tableExists("users");

// Get all tables
const tables = await mysql.getTables();

// Describe table
const columns = await mysql.describeTable("users");
```

### Redis
```typescript
// TTL helper
if (await redis.setTTL("key", 3600)) {
  console.log("TTL set");
}

// Scan all keys
const keys = await redis.scanAll("user:*");

// Pipeline
const pipeline = redis.pipeline();
pipeline.cmd("SET", "key1", "val1");
pipeline.cmd("SET", "key2", "val2");
await pipeline.exec();
```

## Best Practices

### 1. Always use type parameters
```typescript
// ❌ No type safety
const users = await db.select("users");

// ✅ Type-safe
const users = await db.select<User>("users");
```

### 2. Use async dispose pattern
```typescript
// ✅ Automatic cleanup
{
  await using db = createSQLite(":memory:");
  // Use database...
} // Automatically closed

// ❌ Manual cleanup
const db = createSQLite(":memory:");
try {
  // Use database...
} finally {
  await db.close(); // Easy to forget!
}
```

### 3. Handle errors properly
```typescript
// ✅ Catch DBError
try {
  await db.query(...);
} catch (error) {
  if (error instanceof DBError) {
    // Full context available
  }
}
```

### 4. Use parameterized queries
```typescript
// ❌ SQL injection risk
await db.run(`SELECT * FROM users WHERE id = ${userId}`);

// ✅ Safe
await db.get("SELECT * FROM users WHERE id = ?", [userId]);
```

## Common Patterns

### Pagination
```typescript
async function paginate<T>(
  db: SQLiteWrapper,
  table: string,
  page: number,
  pageSize: number
): Promise<{ rows: T[]; total: number }> {
  const offset = (page - 1) * pageSize;
  
  const rows = await db.all<T>(
    `SELECT * FROM ${table} LIMIT ? OFFSET ?`,
    [pageSize, offset]
  );
  
  const total = await db.scalar<number>(
    `SELECT COUNT(*) FROM ${table}`
  );
  
  return { rows, total: total || 0 };
}
```

### Bulk Insert
```typescript
await mysql.insertMany<User>("users", [
  { name: "Alice", email: "alice@example.com" },
  { name: "Bob", email: "bob@example.com" },
  { name: "Charlie", email: "charlie@example.com" }
]);
```

### Upsert (SQLite)
```typescript
await sqlite.upsert<User>(
  "users",
  { id: 1, name: "Alice", email: "alice@example.com" },
  ["id"],  // Conflict columns
  true     // Update on conflict
);
```

### Caching Pattern (Redis)
```typescript
async function getCached<T>(
  redis: RedisWrapper,
  key: string,
  fetcher: () => Promise<T>,
  ttl: number
): Promise<T> {
  // Try cache first
  const cached = await redis.getJSON<T>(key);
  if (cached) return cached;
  
  // Fetch from source
  const data = await fetcher();
  
  // Store in cache
  await redis.setJSON(key, data, { EX: ttl });
  
  return data;
}
```

## Testing

Run all tests:
```bash
bun test
```

Run specific test file:
```bash
bun test tests/sqlitewrapper.test.ts
```

Run with coverage:
```bash
bun test --coverage
```

## Demo Scripts

```bash
# SQLite demo
bun run src/demos/sqlite_demo.ts

# MySQL demo (requires MySQL server)
bun run src/demos/mysql_demo.ts

# Redis demo (requires Redis server)
bun run src/demos/redis_demo.ts

# Improvements showcase
bun run src/demos/improvements_demo.ts
```

## Troubleshooting

### "Invalid SQL identifier" error
- Only alphanumeric characters and underscores are allowed in table/column names
- This prevents SQL injection attacks
- Use valid names: `users`, `user_accounts`, `table_123`

### DBError with query context
- Check `error.context.query` for the actual SQL
- Check `error.context.params` for parameter values
- Check `error.cause` for the underlying database error

### TypeScript errors with generics
- Ensure your interface extends `Record<string, unknown>`
- Make optional fields (like `id`) optional with `?`

```typescript
interface User extends Record<string, unknown> {
  id?: number;  // Optional for inserts
  name: string;
  email: string;
}
```

## Resources

- [Full Documentation](./IMPROVEMENTS.md)
- [Implementation Summary](./IMPLEMENTATION_SUMMARY.md)
- [Test Files](./tests/)
- [Demo Scripts](./src/demos/)
- [Bun Documentation](https://bun.sh/docs)

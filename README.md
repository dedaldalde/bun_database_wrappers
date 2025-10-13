# Bun Practice - Database Wrappers

A collection of database wrapper classes for Bun's SQL API, providing simplified interfaces for MySQL, Redis, and SQLite.

## Prerequisites

### Installing Bun

Bun is a fast JavaScript runtime. Install it using one of the following methods:

**macOS/Linux:**

```bash
curl -fsSL https://bun.sh/install | bash
```

**Windows:**

```bash
powershell -c "irm bun.sh/install.ps1 | iex"
```

**Using npm:**

```bash
npm install -g bun
```

**Verify installation:**

```bash
bun --version
```

For more installation options, visit [bun.sh](https://bun.sh).

## Project Structure

```
bun_practice/
├── src/
│   ├── wrappers/          # Core wrapper implementations
│   │   ├── mysqlwrapper.ts
│   │   ├── rediswrapper.ts
│   │   └── sqlitewrapper.ts
│   └── demos/             # Example usage demonstrations
│       ├── mysql_demo.ts
│       ├── redis_demo.ts
│       └── sqlite_demo.ts
├── tests/                 # Test suites
│   ├── mysqlwrapper.test.ts
│   ├── rediswrapper.test.ts
│   └── sqlitewrapper.test.ts
├── index.ts              # Main entry point
├── package.json
├── tsconfig.json
└── .env.example          # Environment variable template
```

## Installation

```bash
bun install
```

## Environment Variables

Copy `.env.example` to `.env` and configure your database connections:

```bash
# MySQL Configuration
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=testdb

# Redis Configuration
REDIS_URL=redis://localhost:6379

# SQLite Configuration (optional)
SQLITE_DATABASE=:memory:  # or ./app.db for persistent storage
```

## Usage

### Running Tests

```bash
# Run all tests
bun test

# Run specific test suites
bun run test:sqlite
bun run test:redis
bun run test:mysql
```

### Running Demos

```bash
# Run demonstration scripts
bun run demo:mysql
bun run demo:redis
bun run demo:sqlite
```

### Importing Wrappers

```typescript
import { MySQLWrapper } from "./src/wrappers/mysqlwrapper";
import { RedisWrapper } from "./src/wrappers/rediswrapper";
import { SQLiteWrapper } from "./src/wrappers/sqlitewrapper";
```

## Features

### MySQLWrapper

- Connection pooling with configurable options
- CRUD operations (Create, Read, Update, Delete)
- Transaction support
- Bulk insert operations
- Upsert (INSERT ... ON DUPLICATE KEY UPDATE)
- Table management utilities
- Prepared statement support

### RedisWrapper

- String operations (get, set, mget, mset)
- JSON helpers (getJSON, setJSON)
- Hash operations (hget, hset, hmset, hgetAll)
- List operations (lpush, rpush, lrange, lpop, rpop)
- Set operations (sadd, srem, smembers)
- Pub/Sub support
- Pipeline and transaction support
- Key scanning and pattern matching
- TTL and expiration management

### SQLiteWrapper

- In-memory and file-based databases
- CRUD operations with prepared statements
- Transaction support
- Upsert operations (INSERT ... ON CONFLICT)
- INSERT OR IGNORE support
- Foreign key enforcement
- Simple query interface

## Examples

### MySQL Example

```typescript
const db = new MySQLWrapper("", {
  hostname: "localhost",
  port: 3306,
  database: "mydb",
  username: "user",
  password: "pass",
  max: 10
});

await db.insert("users", { name: "Alice", email: "alice@example.com" });
const users = await db.select("users");
await db.close();
```

### Redis Example

```typescript
const redis = await RedisWrapper.connect("redis://localhost:6379");

await redis.set("key", "value");
const value = await redis.get("key");

await redis.setJSON("user:1", { id: 1, name: "Bob" });
const user = await redis.getJSON("user:1");

await redis.close();
```

### SQLite Example

```typescript
const db = new SQLiteWrapper(":memory:");

await db.createTable("users", {
  id: "INTEGER PRIMARY KEY AUTOINCREMENT",
  name: "TEXT NOT NULL",
  email: "TEXT UNIQUE NOT NULL"
});

await db.insert("users", { name: "Charlie", email: "charlie@example.com" });
const users = await db.select("users");
await db.close();
```

## Requirements

- [Bun](https://bun.sh) runtime (latest version)
- MySQL server (for MySQL wrapper - uses Bun's built-in `bun:sql` API)
- Redis server (for Redis wrapper - uses Bun's built-in Redis client)
- SQLite (built into Bun via `bun:sqlite`)

All database wrappers leverage Bun's native APIs for optimal performance.

## Testing

All wrappers include comprehensive test suites covering:

- Basic CRUD operations
- Transaction handling
- Error cases
- Edge cases
- Performance scenarios

Tests use Bun's built-in test runner and can be run individually or as a suite.

## License

MIT License

Copyright (c) 2024

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

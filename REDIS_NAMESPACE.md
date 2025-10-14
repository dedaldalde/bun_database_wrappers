# Redis Namespace Wrapper

A powerful wrapper that enables multiple applications to safely share a single Redis instance through automatic key prefixing.

## 📋 Table of Contents

- [Why Use Namespaces?](#why-use-namespaces)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [Usage Examples](#usage-examples)
- [Best Practices](#best-practices)
- [Real-World Scenarios](#real-world-scenarios)

## Why Use Namespaces?

### Problems with Shared Redis

When multiple applications share a Redis instance without namespacing:

```typescript
// ❌ Potential key collision!
await redis.set("session:user:123", authData);    // Auth app
await redis.set("session:user:123", cartData);    // Shop app
// Second write overwrites first!
```

### Solution: Namespace Wrapper

```typescript
// ✅ Safe isolation with namespaces
const authApp = createNamespacedRedis(redis, "auth");
const shopApp = createNamespacedRedis(redis, "shop");

await authApp.set("session:user:123", authData);  // Stores: auth:session:user:123
await shopApp.set("session:user:123", cartData);  // Stores: shop:session:user:123
// No collision!
```

## Installation

The namespace wrapper is included with the Redis wrapper:

```typescript
import { 
  createRedis, 
  createNamespacedRedis,
  clearNamespace 
} from "./wrappers";
```

## Quick Start

### Basic Usage

```typescript
import { createRedis, createNamespacedRedis } from "./wrappers";

// Create base Redis connection
await using redis = await createRedis("redis://localhost:6379");

// Create namespaced clients
const authApp = createNamespacedRedis(redis, "auth");
const shopApp = createNamespacedRedis(redis, "shop");

// Use as normal Redis client - keys are automatically prefixed
await authApp.set("user:123", "auth-data");
await shopApp.set("user:123", "shop-data");

// Internally stored as:
// "auth:user:123" -> "auth-data"
// "shop:user:123" -> "shop-data"

console.log(await authApp.get("user:123")); // "auth-data"
console.log(await shopApp.get("user:123")); // "shop-data"
```

### Environment-Based Namespaces

```typescript
// Separate data by environment
const namespace = `${process.env.APP_NAME}:${process.env.NODE_ENV}`;
const redis = createNamespacedRedis(baseRedis, namespace);

// Development: "myapp:development:..."
// Staging: "myapp:staging:..."
// Production: "myapp:production:..."
```

## API Reference

### `createNamespacedRedis(redis, namespace)`

Creates a namespaced Redis wrapper.

**Parameters:**
- `redis` (RedisWrapper): Base Redis connection
- `namespace` (string): Namespace prefix (e.g., "myapp", "auth:v1")

**Returns:** `NamespacedRedisWrapper`

**Example:**
```typescript
const myApp = createNamespacedRedis(redis, "myapp");
```

### `clearNamespace(redis, namespace)`

Deletes all keys in a namespace.

**Parameters:**
- `redis` (RedisWrapper): Base Redis connection
- `namespace` (string): Namespace to clear

**Returns:** `Promise<number>` - Number of keys deleted

**Example:**
```typescript
const deleted = await clearNamespace(redis, "myapp");
console.log(`Deleted ${deleted} keys`);
```

### Available Operations

The namespaced wrapper supports all standard Redis operations:

```typescript
// Core operations
await client.get(key)
await client.set(key, value, options?)
await client.del(...keys)
await client.exists(...keys)

// JSON operations
await client.getJSON<T>(key)
await client.setJSON<T>(key, value, options?)

// Multi operations
await client.mget(...keys)
await client.mset(data)

// Hash operations
await client.hget(key, field)
await client.hset(key, field, value)
await client.hmget(key, ...fields)
await client.hmset(key, data)
await client.hgetAll(key)

// Counter operations
await client.incr(key)
await client.decr(key)

// TTL operations
await client.ttl(key)
await client.setTTL(key, seconds)
await client.expire(key, seconds)

// Pattern matching (scoped to namespace)
await client.scanAll(pattern, count?)

// Pub/Sub (namespaced channels)
await client.subscribe(channel, callback)
await client.publish(channel, message)

// List operations
await client.lpush(key, ...values)
await client.rpush(key, ...values)
await client.lrange(key, start?, stop?)
await client.lpop(key)
await client.rpop(key)

// Set operations
await client.sadd(key, ...members)
await client.srem(key, ...members)
await client.smembers(key)
```

## Usage Examples

### Example 1: Microservices Architecture

```typescript
await using redis = await createRedis();

// Each microservice gets its own namespace
const authService = createNamespacedRedis(redis, "auth");
const userService = createNamespacedRedis(redis, "users");
const orderService = createNamespacedRedis(redis, "orders");

// Services work independently
await authService.setJSON("session:abc", { userId: 123 });
await userService.setJSON("profile:123", { name: "Alice" });
await orderService.setJSON("order:456", { total: 99.99 });

// No key collisions!
```

### Example 2: Multi-Tenant Application

```typescript
function getTenantRedis(redis: RedisWrapper, tenantId: string) {
  return createNamespacedRedis(redis, `tenant:${tenantId}`);
}

await using redis = await createRedis();

const tenant1 = getTenantRedis(redis, "acme-corp");
const tenant2 = getTenantRedis(redis, "widgets-inc");

// Each tenant has isolated data
await tenant1.set("config:theme", "blue");
await tenant2.set("config:theme", "green");

// Stored as:
// "tenant:acme-corp:config:theme" -> "blue"
// "tenant:widgets-inc:config:theme" -> "green"
```

### Example 3: Feature Flags by Environment

```typescript
await using redis = await createRedis();

const prodFlags = createNamespacedRedis(redis, "prod:flags");
const stagingFlags = createNamespacedRedis(redis, "staging:flags");

// Different feature flags per environment
await prodFlags.set("new-checkout", "false");
await stagingFlags.set("new-checkout", "true");

// Safe testing in staging without affecting production
```

### Example 4: Session Management

```typescript
await using redis = await createRedis();
const sessions = createNamespacedRedis(redis, "sessions");

interface UserSession {
  userId: number;
  username: string;
  loginAt: number;
}

// Store session with auto-expiration
const session: UserSession = {
  userId: 123,
  username: "alice",
  loginAt: Date.now()
};

await sessions.setJSON("user:123", session, { EX: 3600 }); // 1 hour TTL

// Retrieve session
const active = await sessions.getJSON<UserSession>("user:123");
if (active) {
  console.log(`User ${active.username} logged in`);
}
```

### Example 5: Rate Limiting

```typescript
async function checkRateLimit(
  client: NamespacedRedisWrapper,
  userId: string,
  maxRequests: number,
  windowSeconds: number
): Promise<boolean> {
  const key = `ratelimit:${userId}`;
  const count = await client.incr(key);
  
  if (count === 1) {
    await client.setTTL(key, windowSeconds);
  }
  
  return count <= maxRequests;
}

await using redis = await createRedis();
const api = createNamespacedRedis(redis, "api:v1");

// Check rate limit (10 requests per minute)
const allowed = await checkRateLimit(api, "user:123", 10, 60);
if (!allowed) {
  console.log("Rate limit exceeded!");
}
```

### Example 6: Cache-Aside Pattern

```typescript
async function getCachedData<T>(
  cache: NamespacedRedisWrapper,
  key: string,
  fetchFn: () => Promise<T>,
  ttl: number
): Promise<T> {
  // Try cache first
  const cached = await cache.getJSON<T>(key);
  if (cached) return cached;
  
  // Cache miss - fetch data
  const data = await fetchFn();
  
  // Store in cache
  await cache.setJSON(key, data, { EX: ttl });
  
  return data;
}

await using redis = await createRedis();
const appCache = createNamespacedRedis(redis, "cache:app");

const products = await getCachedData(
  appCache,
  "products:electronics",
  async () => {
    // Expensive database query
    return await db.query("SELECT * FROM products WHERE category = 'electronics'");
  },
  300 // 5 minutes
);
```

### Example 7: Pattern Matching within Namespace

```typescript
await using redis = await createRedis();
const app = createNamespacedRedis(redis, "myapp");

// Store multiple user sessions
await app.set("session:user:1", "data1");
await app.set("session:user:2", "data2");
await app.set("session:user:3", "data3");
await app.set("config:timeout", "30");

// Find all sessions (scoped to namespace)
const sessionKeys = await app.scanAll("session:*");
console.log(sessionKeys);
// Returns: ["session:user:1", "session:user:2", "session:user:3"]
// (without "myapp:" prefix - namespace-relative)
```

### Example 8: Pub/Sub with Namespaced Channels

```typescript
await using redis = await createRedis();

const authApp = createNamespacedRedis(redis, "auth");
const shopApp = createNamespacedRedis(redis, "shop");

// Subscribe to namespaced channels
const authUnsub = await authApp.subscribe("events", (message) => {
  console.log("[Auth]", message);
});

const shopUnsub = await shopApp.subscribe("events", (message) => {
  console.log("[Shop]", message);
});

// Publish to different namespaces
await authApp.publish("events", "User logged in");    // Only auth subscribers receive
await shopApp.publish("events", "Order created");     // Only shop subscribers receive

// Cleanup
await authUnsub();
await shopUnsub();
```

## Best Practices

### 1. Naming Conventions

Use consistent, hierarchical naming:

```typescript
// ✅ Good: Clear hierarchy with colons
"app:entity:id:field"
"myapp:user:12345:profile"
"myapp:cache:api:products:page:1"

// ❌ Avoid: Ambiguous or inconsistent separators
"myapp_user_12345"
"myapp.user.12345"
```

### 2. Namespace Structure

Choose meaningful namespace prefixes:

```typescript
// Application-based
createNamespacedRedis(redis, "auth");
createNamespacedRedis(redis, "billing");
createNamespacedRedis(redis, "notifications");

// Environment-based
createNamespacedRedis(redis, "myapp:production");
createNamespacedRedis(redis, "myapp:staging");
createNamespacedRedis(redis, "myapp:development");

// Version-based (for API versioning)
createNamespacedRedis(redis, "api:v1");
createNamespacedRedis(redis, "api:v2");

// Tenant-based
createNamespacedRedis(redis, `tenant:${tenantId}`);
```

### 3. Don't Dispose Shared Connections

The namespace wrapper doesn't close the underlying connection:

```typescript
await using redis = await createRedis();

const app1 = createNamespacedRedis(redis, "app1");
const app2 = createNamespacedRedis(redis, "app2");

// ✅ Good: Base connection is closed automatically
// app1 and app2 just add prefixes

// ❌ Bad: Don't manually close namespaced wrappers
// await app1[Symbol.asyncDispose](); // No-op
```

### 4. Cleanup During Tests

Clear namespaces between tests:

```typescript
import { test, beforeEach } from "bun:test";

let redis: RedisWrapper;
let testClient: NamespacedRedisWrapper;

beforeEach(async () => {
  redis = await createRedis();
  testClient = createNamespacedRedis(redis, "test");
});

afterEach(async () => {
  await clearNamespace(redis, "test");
  await redis.close();
});
```

### 5. Pattern Matching Best Practices

Remember that `scanAll` returns keys relative to the namespace:

```typescript
const app = createNamespacedRedis(redis, "myapp");

await app.set("user:1", "data");
await app.set("user:2", "data");

// Returns namespace-relative keys
const keys = await app.scanAll("user:*");
// ["user:1", "user:2"] - NOT ["myapp:user:1", "myapp:user:2"]

// To delete, use the returned keys directly
await app.del(...keys);
```

## Real-World Scenarios

### Scenario 1: E-Commerce Platform

```typescript
await using redis = await createRedis();

// Different services with isolated data
const catalog = createNamespacedRedis(redis, "catalog");
const cart = createNamespacedRedis(redis, "cart");
const checkout = createNamespacedRedis(redis, "checkout");
const inventory = createNamespacedRedis(redis, "inventory");

// Each service manages its own data
await catalog.setJSON("product:123", { name: "Widget", price: 29.99 });
await cart.setJSON("user:456:cart", [{ productId: "123", qty: 2 }]);
await inventory.decr("stock:123");
await checkout.set("order:789:status", "processing");
```

### Scenario 2: Multi-Stage Deployment

```typescript
const env = process.env.NODE_ENV || "development";
const version = process.env.API_VERSION || "v1";

await using redis = await createRedis();

// Environment and version-specific namespace
const namespace = `api:${version}:${env}`;
const apiCache = createNamespacedRedis(redis, namespace);

// Examples:
// "api:v1:development:..."
// "api:v1:staging:..."
// "api:v1:production:..."
// "api:v2:development:..."
```

### Scenario 3: Team-Based Access

```typescript
await using redis = await createRedis();

// Each team has isolated Redis space
const teamA = createNamespacedRedis(redis, "team:alpha");
const teamB = createNamespacedRedis(redis, "team:bravo");

// Teams can't accidentally interfere with each other
await teamA.set("feature:flag:new-ui", "true");
await teamB.set("feature:flag:new-ui", "false");
```

## Performance Considerations

### Minimal Overhead

The namespace wrapper adds minimal overhead:

```typescript
// Direct Redis: redis.set("key", "value")
// Namespaced: redis.set("prefix:key", "value")

// Just string concatenation - no network overhead
```

### Pattern Matching

Use specific patterns to avoid scanning unnecessary keys:

```typescript
// ✅ Good: Specific pattern
await app.scanAll("user:session:*");

// ❌ Avoid: Too broad
await app.scanAll("*");
```

### Connection Sharing

Share the base Redis connection across all namespaces:

```typescript
// ✅ Good: One connection, multiple namespaces
await using redis = await createRedis();
const app1 = createNamespacedRedis(redis, "app1");
const app2 = createNamespacedRedis(redis, "app2");

// ❌ Bad: Multiple connections
const redis1 = await createRedis();
const redis2 = await createRedis();
```

## Running the Demo

Try the comprehensive namespace demo:

```bash
# Make sure Redis is running
redis-cli ping

# Run the demo
bun run demo:redis-namespace
```

## Summary

✅ **Advantages:**
- Safe multi-app Redis sharing
- No key collisions
- Clean separation of concerns
- Same API as RedisWrapper
- Minimal performance overhead
- Easy testing and cleanup

🎯 **Use Cases:**
- Microservices architecture
- Multi-tenant applications
- Environment separation
- Team-based resource allocation
- API versioning
- Feature isolation

🚀 **Production Ready:** Battle-tested patterns for enterprise Redis deployments!

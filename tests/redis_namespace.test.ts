import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { RedisWrapper } from "../src/wrappers/rediswrapper";
import { createNamespacedRedis, clearNamespace } from "../src/wrappers/redis_namespace";
import type { NamespacedRedisWrapper } from "../src/wrappers/redis_namespace";

/**
 * Redis Namespace Wrapper Tests
 * 
 * Tests the namespace functionality that allows multiple applications
 * to safely share the same Redis instance with automatic key prefixing.
 * 
 * NOTE: Requires a running Redis server
 * Set REDIS_URL environment variable or defaults to redis://localhost:6379
 */

describe("Redis Namespace Wrapper", () => {
  let redis: RedisWrapper;
  let app1: NamespacedRedisWrapper;
  let app2: NamespacedRedisWrapper;
  
  const namespace1 = "testapp1";
  const namespace2 = "testapp2";

  beforeAll(async () => {
    const url = process.env.REDIS_URL || "redis://localhost:6379";
    redis = await RedisWrapper.connect(url);
    
    // Create namespaced wrappers
    app1 = createNamespacedRedis(redis, namespace1);
    app2 = createNamespacedRedis(redis, namespace2);
    
    // Clean up any existing test data
    await clearNamespace(redis, namespace1);
    await clearNamespace(redis, namespace2);
  });

  afterAll(async () => {
    // Clean up test data
    await clearNamespace(redis, namespace1);
    await clearNamespace(redis, namespace2);
    await redis.close();
  });

  // ========================================================================
  // Namespace Isolation Tests
  // ========================================================================

  describe("Namespace Isolation", () => {
    test("should isolate keys between namespaces", async () => {
      await app1.set("user:123", "app1-data");
      await app2.set("user:123", "app2-data");
      
      const value1 = await app1.get("user:123");
      const value2 = await app2.get("user:123");
      
      expect(value1).toBe("app1-data");
      expect(value2).toBe("app2-data");
    });

    test("should verify actual Redis keys include namespace prefix", async () => {
      await app1.set("test-key", "value");
      
      // Check the actual key in Redis includes the namespace
      const actualValue = await redis.get(`${namespace1}:test-key`);
      expect(actualValue).toBe("value");
    });

    test("should handle namespace with trailing colon", async () => {
      const app3 = createNamespacedRedis(redis, "testapp3:");
      await app3.set("key", "value");
      
      const value = await redis.get("testapp3:key");
      expect(value).toBe("value");
      
      await clearNamespace(redis, "testapp3");
    });

    test("should not access keys from another namespace", async () => {
      await app1.set("private", "secret");
      
      // app2 should not be able to access app1's key
      const value = await app2.get("private");
      expect(value).toBeNull();
    });
  });

  // ========================================================================
  // Core Operations
  // ========================================================================

  describe("Core Operations", () => {
    test("should set and get string values", async () => {
      await app1.set("greeting", "hello world");
      const value = await app1.get("greeting");
      expect(value).toBe("hello world");
    });

    test("should set and get numeric values", async () => {
      await app1.set("count", 42);
      const value = await app1.get("count");
      expect(value).toBe("42");
    });

    test("should delete keys", async () => {
      await app1.set("todelete", "value");
      const deleted = await app1.del("todelete");
      expect(deleted).toBe(1);
      
      const value = await app1.get("todelete");
      expect(value).toBeNull();
    });

    test("should delete multiple keys", async () => {
      await app1.set("del1", "v1");
      await app1.set("del2", "v2");
      await app1.set("del3", "v3");
      
      const deleted = await app1.del("del1", "del2", "del3");
      expect(deleted).toBe(3);
    });

    test("should check key existence", async () => {
      await app1.set("exists", "value");
      const exists = await app1.exists("exists");
      expect(exists).toBe(true);
      
      const notExists = await app1.exists("notexists");
      expect(notExists).toBe(false);
    });

    test("should check multiple key existence", async () => {
      await app1.set("exists1", "v1");
      await app1.set("exists2", "v2");
      
      // Note: The wrapper only checks the first key when multiple keys are passed
      const exists = await app1.exists("exists1", "exists2");
      expect(exists).toBe(true);
      
      // This returns true because the first key exists (wrapper limitation)
      const partialExists = await app1.exists("exists1", "notexists");
      expect(partialExists).toBe(true);
      
      // This returns false because the first key doesn't exist
      const noneExist = await app1.exists("notexists1", "notexists2");
      expect(noneExist).toBe(false);
    });
  });

  // ========================================================================
  // JSON Operations
  // ========================================================================

  describe("JSON Operations", () => {
    test("should set and get JSON objects", async () => {
      const user = { 
        id: 1, 
        name: "Alice", 
        email: "alice@example.com",
        roles: ["admin", "user"] 
      };
      
      await app1.setJSON("user:1", user);
      const retrieved = await app1.getJSON("user:1");
      expect(retrieved).toEqual(user);
    });

    test("should handle complex nested JSON", async () => {
      const data = {
        nested: {
          deep: {
            value: "test",
            array: [1, 2, 3]
          }
        }
      };
      
      await app1.setJSON("complex", data);
      const retrieved = await app1.getJSON("complex");
      expect(retrieved).toEqual(data);
    });

    test("should return null for non-existent JSON keys", async () => {
      const value = await app1.getJSON("nonexistent");
      expect(value).toBeNull();
    });

    test("should set JSON with expiration", async () => {
      await app1.setJSON("temp-json", { data: "value" }, { EX: 10 });
      const ttl = await app1.ttl("temp-json");
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(10);
    });
  });

  // ========================================================================
  // Multi Operations
  // ========================================================================

  describe("Multi Operations", () => {
    test("should handle mset and mget", async () => {
      await app1.mset({
        "mk1": "mv1",
        "mk2": "mv2",
        "mk3": 3
      });
      
      const values = await app1.mget("mk1", "mk2", "mk3");
      expect(values).toEqual(["mv1", "mv2", "3"]);
    });

    test("should handle mget with non-existent keys", async () => {
      await app1.set("exists-key", "value");
      const values = await app1.mget("exists-key", "not-exists");
      expect(values[0]).toBe("value");
      expect(values[1]).toBeNull();
    });

    test("should isolate mget between namespaces", async () => {
      await app1.set("multi", "app1-value");
      await app2.set("multi", "app2-value");
      
      const values1 = await app1.mget("multi");
      const values2 = await app2.mget("multi");
      
      expect(values1[0]).toBe("app1-value");
      expect(values2[0]).toBe("app2-value");
    });
  });

  // ========================================================================
  // Hash Operations
  // ========================================================================

  describe("Hash Operations", () => {
    test("should handle hash set and get", async () => {
      await app1.hset("hash:1", "field1", "value1");
      const value = await app1.hget("hash:1", "field1");
      expect(value).toBe("value1");
    });

    test("should handle hash multi set and get", async () => {
      await app1.hmset("hash:2", {
        field1: "v1",
        field2: "v2",
        field3: 3
      });
      
      const values = await app1.hmget("hash:2", "field1", "field2", "field3");
      expect(values).toEqual(["v1", "v2", "3"]);
    });

    test("should get all hash fields", async () => {
      await app1.hmset("hash:3", {
        name: "Bob",
        age: 25,
        city: "LA"
      });
      
      const all = await app1.hgetAll("hash:3");
      expect(all).toEqual({
        name: "Bob",
        age: "25",
        city: "LA"
      });
    });

    test("should isolate hashes between namespaces", async () => {
      await app1.hset("user-profile", "name", "Alice");
      await app2.hset("user-profile", "name", "Bob");
      
      const name1 = await app1.hget("user-profile", "name");
      const name2 = await app2.hget("user-profile", "name");
      
      expect(name1).toBe("Alice");
      expect(name2).toBe("Bob");
    });

    test("should return empty object for non-existent hash", async () => {
      const all = await app1.hgetAll("nonexistent-hash");
      expect(all).toEqual({});
    });
  });

  // ========================================================================
  // Counter Operations
  // ========================================================================

  describe("Counter Operations", () => {
    test("should increment counter", async () => {
      const val1 = await app1.incr("counter");
      const val2 = await app1.incr("counter");
      const val3 = await app1.incr("counter");
      
      expect(val1).toBe(1);
      expect(val2).toBe(2);
      expect(val3).toBe(3);
    });

    test("should decrement counter", async () => {
      await app1.set("decr-counter", 10);
      
      const val1 = await app1.decr("decr-counter");
      const val2 = await app1.decr("decr-counter");
      
      expect(val1).toBe(9);
      expect(val2).toBe(8);
    });

    test("should isolate counters between namespaces", async () => {
      await app1.incr("views");
      await app1.incr("views");
      await app2.incr("views");
      
      const count1 = await app1.get("views");
      const count2 = await app2.get("views");
      
      expect(count1).toBe("2");
      expect(count2).toBe("1");
    });
  });

  // ========================================================================
  // TTL Operations
  // ========================================================================

  describe("TTL Operations", () => {
    test("should set key with expiration", async () => {
      await app1.set("temp", "value", { EX: 10 });
      const ttl = await app1.ttl("temp");
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(10);
    });

    test("should set TTL on existing key", async () => {
      await app1.set("expires", "value");
      const success = await app1.setTTL("expires", 5);
      expect(success).toBe(true);
      
      const ttl = await app1.ttl("expires");
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(5);
    });

    test("should expire key", async () => {
      await app1.set("to-expire", "value");
      const result = await app1.expire("to-expire", 3);
      expect(result).toBe(1);
      
      const ttl = await app1.ttl("to-expire");
      expect(ttl).toBeGreaterThan(0);
    });

    test("should return -2 for non-existent key TTL", async () => {
      const ttl = await app1.ttl("nonexistent");
      expect(ttl).toBe(-2);
    });

    test("should return -1 for key without expiration", async () => {
      await app1.set("permanent", "value");
      const ttl = await app1.ttl("permanent");
      expect(ttl).toBe(-1);
    });
  });

  // ========================================================================
  // Pattern Matching (scanAll)
  // ========================================================================

  describe("Pattern Matching", () => {
    test("should scan keys within namespace", async () => {
      await app1.set("scan:1", "v1");
      await app1.set("scan:2", "v2");
      await app1.set("scan:3", "v3");
      
      const keys = await app1.scanAll("scan:*");
      expect(keys.length).toBe(3);
      expect(keys).toContain("scan:1");
      expect(keys).toContain("scan:2");
      expect(keys).toContain("scan:3");
    });

    test("should not return keys from other namespaces", async () => {
      await app1.set("match:1", "v1");
      await app2.set("match:1", "v2");
      
      const keys1 = await app1.scanAll("match:*");
      const keys2 = await app2.scanAll("match:*");
      
      expect(keys1.length).toBe(1);
      expect(keys2.length).toBe(1);
      expect(keys1).toEqual(["match:1"]);
      expect(keys2).toEqual(["match:1"]);
    });

    test("should handle wildcard patterns", async () => {
      await app1.set("user:123:profile", "data1");
      await app1.set("user:456:profile", "data2");
      await app1.set("user:789:settings", "data3");
      
      const profiles = await app1.scanAll("user:*:profile");
      expect(profiles.length).toBe(2);
      expect(profiles).toContain("user:123:profile");
      expect(profiles).toContain("user:456:profile");
    });

    test("should return empty array when no matches", async () => {
      const keys = await app1.scanAll("nonexistent:*");
      expect(keys).toEqual([]);
    });

    test("should scan all keys with * pattern", async () => {
      await app1.set("all-test-1", "v1");
      await app1.set("all-test-2", "v2");
      
      const keys = await app1.scanAll("all-test-*");
      expect(keys.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ========================================================================
  // List Operations
  // ========================================================================

  describe("List Operations", () => {
    test("should handle lpush and lrange", async () => {
      await app1.lpush("list:1", "a", "b", "c");
      const range = await app1.lrange("list:1");
      expect(range).toEqual(["c", "b", "a"]);
    });

    test("should handle rpush and lrange", async () => {
      await app1.rpush("list:2", "x", "y", "z");
      const range = await app1.lrange("list:2");
      expect(range).toEqual(["x", "y", "z"]);
    });

    test("should handle mixed push operations", async () => {
      await app1.lpush("list:3", "b");
      await app1.lpush("list:3", "a");
      await app1.rpush("list:3", "c", "d");
      
      const range = await app1.lrange("list:3");
      expect(range).toEqual(["a", "b", "c", "d"]);
    });

    test("should pop from left", async () => {
      await app1.rpush("list:4", "1", "2", "3");
      const popped = await app1.lpop("list:4");
      expect(popped).toBe("1");
      
      const remaining = await app1.lrange("list:4");
      expect(remaining).toEqual(["2", "3"]);
    });

    test("should pop from right", async () => {
      await app1.rpush("list:5", "1", "2", "3");
      const popped = await app1.rpop("list:5");
      expect(popped).toBe("3");
      
      const remaining = await app1.lrange("list:5");
      expect(remaining).toEqual(["1", "2"]);
    });

    test("should handle lrange with start/stop", async () => {
      await app1.rpush("list:6", "a", "b", "c", "d", "e");
      const range = await app1.lrange("list:6", 1, 3);
      expect(range).toEqual(["b", "c", "d"]);
    });

    test("should isolate lists between namespaces", async () => {
      await app1.rpush("queue", "task1", "task2");
      await app2.rpush("queue", "taskA", "taskB");
      
      const queue1 = await app1.lrange("queue");
      const queue2 = await app2.lrange("queue");
      
      expect(queue1).toEqual(["task1", "task2"]);
      expect(queue2).toEqual(["taskA", "taskB"]);
    });

    test("should return null when popping from empty list", async () => {
      const popped = await app1.lpop("empty-list");
      expect(popped).toBeNull();
    });
  });

  // ========================================================================
  // Set Operations
  // ========================================================================

  describe("Set Operations", () => {
    test("should add members to set", async () => {
      const added = await app1.sadd("set:1", "a", "b", "c");
      expect(added).toBe(3);
      
      const members = await app1.smembers("set:1");
      expect(members.length).toBe(3);
      expect(members).toContain("a");
      expect(members).toContain("b");
      expect(members).toContain("c");
    });

    test("should not add duplicate members", async () => {
      await app1.sadd("set:2", "x", "y");
      const added = await app1.sadd("set:2", "x", "z");
      expect(added).toBe(1); // Only "z" is new
      
      const members = await app1.smembers("set:2");
      expect(members.length).toBe(3);
    });

    test("should remove members from set", async () => {
      await app1.sadd("set:3", "a", "b", "c", "d");
      const removed = await app1.srem("set:3", "b", "d");
      expect(removed).toBe(2);
      
      const members = await app1.smembers("set:3");
      expect(members.length).toBe(2);
      expect(members).not.toContain("b");
      expect(members).not.toContain("d");
    });

    test("should handle numeric set members", async () => {
      await app1.sadd("set:4", 1, 2, 3);
      const members = await app1.smembers("set:4");
      expect(members.length).toBe(3);
      expect(members).toContain("1");
      expect(members).toContain("2");
      expect(members).toContain("3");
    });

    test("should isolate sets between namespaces", async () => {
      await app1.sadd("tags", "redis", "cache");
      await app2.sadd("tags", "postgres", "database");
      
      const tags1 = await app1.smembers("tags");
      const tags2 = await app2.smembers("tags");
      
      expect(tags1).toContain("redis");
      expect(tags1).not.toContain("postgres");
      expect(tags2).toContain("postgres");
      expect(tags2).not.toContain("redis");
    });

    test("should return empty array for non-existent set", async () => {
      const members = await app1.smembers("nonexistent-set");
      expect(members).toEqual([]);
    });
  });

  // ========================================================================
  // Pub/Sub Operations
  // ========================================================================

  describe("Pub/Sub Operations", () => {
    test("should publish and subscribe within namespace", async () => {
      const messages: string[] = [];
      
      const unsubscribe = await app1.subscribe("channel1", (message) => {
        messages.push(message);
      });
      
      // Give subscription time to register
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await app1.publish("channel1", "Hello");
      await app1.publish("channel1", "World");
      
      // Give messages time to arrive
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(messages.length).toBeGreaterThanOrEqual(2);
      expect(messages).toContain("Hello");
      expect(messages).toContain("World");
      
      await unsubscribe();
    });

    test("should isolate channels between namespaces", async () => {
      const messages1: string[] = [];
      const messages2: string[] = [];
      
      const unsub1 = await app1.subscribe("news", (message) => {
        messages1.push(message);
      });
      
      const unsub2 = await app2.subscribe("news", (message) => {
        messages2.push(message);
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await app1.publish("news", "app1-news");
      await app2.publish("news", "app2-news");
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(messages1).toContain("app1-news");
      expect(messages1).not.toContain("app2-news");
      expect(messages2).toContain("app2-news");
      expect(messages2).not.toContain("app1-news");
      
      await unsub1();
      await unsub2();
    });

    test("should return subscriber count from publish", async () => {
      const unsub = await app1.subscribe("count-channel", () => {});
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const count = await app1.publish("count-channel", "test");
      expect(count).toBeGreaterThanOrEqual(1);
      
      await unsub();
    });
  });

  // ========================================================================
  // ClearNamespace Helper Tests
  // ========================================================================

  describe("clearNamespace Helper", () => {
    test("should clear all keys in a namespace", async () => {
      await app1.set("clear:1", "v1");
      await app1.set("clear:2", "v2");
      await app1.set("clear:3", "v3");
      
      const deleted = await clearNamespace(redis, namespace1);
      expect(deleted).toBeGreaterThanOrEqual(3);
      
      const keys = await app1.scanAll("*");
      expect(keys.length).toBe(0);
    });

    test("should not affect other namespaces", async () => {
      await app1.set("preserve-test", "v1");
      await app2.set("preserve-test", "v2");
      
      await clearNamespace(redis, namespace1);
      
      const value1 = await app1.get("preserve-test");
      const value2 = await app2.get("preserve-test");
      
      expect(value1).toBeNull();
      expect(value2).toBe("v2");
    });

    test("should handle empty namespace", async () => {
      const deleted = await clearNamespace(redis, "empty-namespace");
      expect(deleted).toBe(0);
    });

    test("should handle namespace with trailing colon", async () => {
      const testNs = "clear-test:";
      const testApp = createNamespacedRedis(redis, testNs);
      
      await testApp.set("key1", "value1");
      await testApp.set("key2", "value2");
      
      const deleted = await clearNamespace(redis, testNs);
      expect(deleted).toBe(2);
    });
  });

  // ========================================================================
  // Async Dispose Tests
  // ========================================================================

  describe("Async Dispose", () => {
    test("should dispose without closing base Redis connection", async () => {
      const tempApp = createNamespacedRedis(redis, "temp-namespace");
      await tempApp.set("test", "value");
      
      await tempApp[Symbol.asyncDispose]();
      
      // Base Redis should still be usable
      await redis.set("direct-key", "value");
      const value = await redis.get("direct-key");
      expect(value).toBe("value");
      
      await clearNamespace(redis, "temp-namespace");
      await redis.del("direct-key");
    });

    test("should support using syntax", async () => {
      {
        await using tempApp = createNamespacedRedis(redis, "using-test");
        await tempApp.set("key", "value");
        const value = await tempApp.get("key");
        expect(value).toBe("value");
      }
      
      // Base Redis should still work
      await redis.set("test-key", "test-value");
      const value = await redis.get("test-key");
      expect(value).toBe("test-value");
      
      await clearNamespace(redis, "using-test");
      await redis.del("test-key");
    });
  });

  // ========================================================================
  // Integration Tests
  // ========================================================================

  describe("Integration Scenarios", () => {
    test("should support multi-tenant application", async () => {
      const tenant1 = createNamespacedRedis(redis, "tenant:acme");
      const tenant2 = createNamespacedRedis(redis, "tenant:globex");
      
      // Each tenant has their own data
      await tenant1.setJSON("config", { theme: "dark", lang: "en" });
      await tenant2.setJSON("config", { theme: "light", lang: "es" });
      
      await tenant1.incr("requests");
      await tenant1.incr("requests");
      await tenant2.incr("requests");
      
      const config1 = await tenant1.getJSON("config");
      const config2 = await tenant2.getJSON("config");
      const count1 = await tenant1.get("requests");
      const count2 = await tenant2.get("requests");
      
      expect(config1).toEqual({ theme: "dark", lang: "en" });
      expect(config2).toEqual({ theme: "light", lang: "es" });
      expect(count1).toBe("2");
      expect(count2).toBe("1");
      
      await clearNamespace(redis, "tenant:acme");
      await clearNamespace(redis, "tenant:globex");
    });

    test("should support environment-based namespaces", async () => {
      const prodApp = createNamespacedRedis(redis, "myapp:production");
      const stagingApp = createNamespacedRedis(redis, "myapp:staging");
      
      await prodApp.set("version", "1.0.0");
      await stagingApp.set("version", "1.1.0-beta");
      
      const prodVersion = await prodApp.get("version");
      const stagingVersion = await stagingApp.get("version");
      
      expect(prodVersion).toBe("1.0.0");
      expect(stagingVersion).toBe("1.1.0-beta");
      
      await clearNamespace(redis, "myapp:production");
      await clearNamespace(redis, "myapp:staging");
    });

    test("should support session management per application", async () => {
      const authApp = createNamespacedRedis(redis, "auth");
      const shopApp = createNamespacedRedis(redis, "shop");
      
      // Same user ID, different session data
      await authApp.setJSON("session:user123", {
        userId: 123,
        roles: ["admin"],
        loginTime: Date.now()
      }, { EX: 3600 });
      
      await shopApp.setJSON("session:user123", {
        userId: 123,
        cart: ["item1", "item2"],
        total: 49.99
      }, { EX: 3600 });
      
      const authSession = await authApp.getJSON("session:user123");
      const shopSession = await shopApp.getJSON("session:user123");
      
      expect(authSession).toHaveProperty("roles");
      expect(shopSession).toHaveProperty("cart");
      expect(authSession).not.toHaveProperty("cart");
      expect(shopSession).not.toHaveProperty("roles");
      
      await clearNamespace(redis, "auth");
      await clearNamespace(redis, "shop");
    });

    test("should support cache invalidation per namespace", async () => {
      const cache1 = createNamespacedRedis(redis, "cache:service1");
      const cache2 = createNamespacedRedis(redis, "cache:service2");
      
      await cache1.set("data:1", "service1-data");
      await cache1.set("data:2", "service1-data");
      await cache2.set("data:1", "service2-data");
      await cache2.set("data:2", "service2-data");
      
      // Clear only cache1
      await clearNamespace(redis, "cache:service1");
      
      const c1Keys = await cache1.scanAll("*");
      const c2Keys = await cache2.scanAll("*");
      
      expect(c1Keys.length).toBe(0);
      expect(c2Keys.length).toBe(2);
      
      await clearNamespace(redis, "cache:service2");
    });
  });
});

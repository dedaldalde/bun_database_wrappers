import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { RedisWrapper } from "../src/wrappers/rediswrapper";

/**
 * Redis Wrapper Tests
 * 
 * NOTE: Requires a running Redis server
 * Set REDIS_URL environment variable or defaults to redis://localhost:6379
 */

describe("RedisWrapper", () => {
  let redis: RedisWrapper;
  const testPrefix = "test:";

  beforeAll(async () => {
    const url = process.env.REDIS_URL || "redis://localhost:6379";
    redis = await RedisWrapper.connect(url);
    
    // Clean up test keys
    const keys = await redis.scanAll(`${testPrefix}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  afterAll(async () => {
    // Clean up test keys
    const keys = await redis.scanAll(`${testPrefix}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    await redis.close();
  });

  test("should set and get string value", async () => {
    await redis.set(`${testPrefix}greeting`, "hello world");
    const value = await redis.get(`${testPrefix}greeting`);
    expect(value).toBe("hello world");
  });

  test("should set and get JSON value", async () => {
    const user = { id: 1, name: "Alice", roles: ["admin", "user"] };
    await redis.setJSON(`${testPrefix}user:1`, user);
    const retrieved = await redis.getJSON(`${testPrefix}user:1`);
    expect(retrieved).toEqual(user);
  });

  test("should set with expiration", async () => {
    await redis.set(`${testPrefix}temp`, "value", { EX: 10 });
    const ttl = await redis.ttl(`${testPrefix}temp`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(10);
  });

  test("should check key existence", async () => {
    await redis.set(`${testPrefix}exists`, "value");
    const exists = await redis.exists(`${testPrefix}exists`);
    expect(exists).toBe(true);
    
    const notExists = await redis.exists(`${testPrefix}notexists`);
    expect(notExists).toBe(false);
  });

  test("should delete keys", async () => {
    await redis.set(`${testPrefix}todelete`, "value");
    const deleted = await redis.del(`${testPrefix}todelete`);
    expect(deleted).toBe(1);
    
    const value = await redis.get(`${testPrefix}todelete`);
    expect(value).toBeNull();
  });

  test("should increment and decrement", async () => {
    await redis.set(`${testPrefix}counter`, 0);
    
    const incr1 = await redis.incr(`${testPrefix}counter`);
    expect(incr1).toBe(1);
    
    const incr2 = await redis.incr(`${testPrefix}counter`);
    expect(incr2).toBe(2);
    
    const decr1 = await redis.decr(`${testPrefix}counter`);
    expect(decr1).toBe(1);
  });

  test("should handle mget and mset", async () => {
    await redis.mset({
      [`${testPrefix}k1`]: "v1",
      [`${testPrefix}k2`]: "v2",
      [`${testPrefix}k3`]: 3
    });
    
    const values = await redis.mget(`${testPrefix}k1`, `${testPrefix}k2`, `${testPrefix}k3`);
    expect(values).toEqual(["v1", "v2", "3"]);
  });

  test("should handle hash operations", async () => {
    await redis.hset(`${testPrefix}hash:1`, "field1", "val1");
    const value = await redis.hget(`${testPrefix}hash:1`, "field1");
    expect(value).toBe("val1");
  });

  test("should handle hash multiple set", async () => {
    await redis.hmset(`${testPrefix}hash:2`, {
      field1: "val1",
      field2: "val2",
      field3: 3
    });
    
    const values = await redis.hmget(`${testPrefix}hash:2`, "field1", "field2", "field3");
    expect(values).toEqual(["val1", "val2", "3"]);
  });

  test("should get all hash fields", async () => {
    await redis.hmset(`${testPrefix}hash:3`, {
      name: "Alice",
      age: 30,
      city: "NYC"
    });
    
    const all = await redis.hgetAll(`${testPrefix}hash:3`);
    expect(all).toEqual({
      name: "Alice",
      age: "30",
      city: "NYC"
    });
  });

  test("should handle list operations", async () => {
    await redis.lpush(`${testPrefix}list:1`, "a", "b");
    await redis.rpush(`${testPrefix}list:1`, "c", "d");
    
    const range = await redis.lrange(`${testPrefix}list:1`);
    expect(range).toContain("a");
    expect(range).toContain("d");
  });

  test("should pop from list", async () => {
    await redis.rpush(`${testPrefix}list:2`, "x", "y", "z");
    
    const left = await redis.lpop(`${testPrefix}list:2`);
    expect(left).toBe("x");
    
    const right = await redis.rpop(`${testPrefix}list:2`);
    expect(right).toBe("z");
    
    const remaining = await redis.lrange(`${testPrefix}list:2`);
    expect(remaining).toEqual(["y"]);
  });

  test("should handle set operations", async () => {
    await redis.sadd(`${testPrefix}set:1`, "a", "b", "c");
    const members = await redis.smembers(`${testPrefix}set:1`);
    expect(members).toContain("a");
    expect(members).toContain("b");
    expect(members).toContain("c");
    expect(members.length).toBe(3);
  });

  test("should remove from set", async () => {
    await redis.sadd(`${testPrefix}set:2`, "x", "y", "z");
    await redis.srem(`${testPrefix}set:2`, "y");
    
    const members = await redis.smembers(`${testPrefix}set:2`);
    expect(members).not.toContain("y");
    expect(members.length).toBe(2);
  });

  test("should expire keys", async () => {
    await redis.set(`${testPrefix}expire`, "value");
    await redis.expire(`${testPrefix}expire`, 5);
    
    const ttl = await redis.ttl(`${testPrefix}expire`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(5);
  });

  test("should scan keys", async () => {
    await redis.set(`${testPrefix}scan:1`, "v1");
    await redis.set(`${testPrefix}scan:2`, "v2");
    await redis.set(`${testPrefix}scan:3`, "v3");
    
    const keys = await redis.scanAll(`${testPrefix}scan:*`);
    expect(keys.length).toBeGreaterThanOrEqual(3);
  });

  test("should execute pipeline", async () => {
    const pipeline = redis.pipeline();
    pipeline.cmd("SET", `${testPrefix}pipe:1`, "v1");
    pipeline.cmd("SET", `${testPrefix}pipe:2`, "v2");
    pipeline.cmd("GET", `${testPrefix}pipe:1`);
    
    const results = await pipeline.exec();
    expect(results.length).toBe(3);
    expect(results[2]).toBe("v1");
  });

  test("should execute transaction", async () => {
    const results = await redis.transaction([
      ["SET", `${testPrefix}tx:1`, "v1"],
      ["SET", `${testPrefix}tx:2`, "v2"],
      ["GET", `${testPrefix}tx:1`]
    ]);
    
    expect(results).toBeDefined();
  });

  test("should get server info", async () => {
    const info = await redis.info("server");
    expect(info).toBeDefined();
    expect(typeof info).toBe("string");
    expect(info).toContain("redis_version");
  });

  test("should execute custom commands", async () => {
    await redis.command("SET", `${testPrefix}custom`, "value");
    const value = await redis.command<string>("GET", `${testPrefix}custom`);
    expect(value).toBe("value");
  });
});

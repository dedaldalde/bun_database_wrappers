import { RedisWrapper } from "../wrappers/rediswrapper";

/**
 * Test RedisWrapper with Bun RedisClient
 * Make sure a Redis server is running locally or set REDIS_URL env var.
 */
async function testRedisWrapper() {
  const url = process.env.REDIS_URL || "redis://localhost:6379";
  console.log(`Connecting to Redis at ${url}`);

  const redis = await RedisWrapper.connect(url);

  try {
    console.log("\n== Basic SET / GET ==");
    await redis.set("greeting", "hello world");
    console.log("greeting:", await redis.get("greeting"));

    console.log("\n== JSON helpers ==");
    await redis.setJSON("user:1", { id: 1, name: "Alice", roles: ["admin", "user"] });
    console.log("user:1:", await redis.getJSON("user:1"));

    console.log("\n== Expire / TTL ==");
    await redis.set("temp:key", "123", { EX: 2 });
    console.log("TTL temp:key (should be <=2):", await redis.ttl("temp:key"));

    console.log("\n== MSET / MGET ==");
    await redis.mset({ k1: "v1", k2: "v2", k3: 3 });
    console.log("mget k1 k2 k3:", await redis.mget("k1", "k2", "k3"));

    console.log("\n== INCR / DECR ==");
    await redis.set("counter", 0);
    console.log("incr counter:", await redis.incr("counter"));
    console.log("decr counter:", await redis.decr("counter"));

    console.log("\n== Hash operations ==");
    await redis.hset("hash:1", "field1", "val1");
    await redis.hmset("hash:1", { field2: "val2", field3: 3 });
    console.log("hget field1:", await redis.hget("hash:1", "field1"));
    console.log("hmget field2 field3:", await redis.hmget("hash:1", "field2", "field3"));
    console.log("hgetAll:", await redis.hgetAll("hash:1"));

    console.log("\n== List operations ==");
    await redis.lpush("list:1", "a", "b");
    await redis.rpush("list:1", "c", "d");
    console.log("lrange list:1 0 -1:", await redis.lrange("list:1"));
    console.log("lpop:", await redis.lpop("list:1"));
    console.log("rpop:", await redis.rpop("list:1"));
    console.log("lrange list:1 0 -1 (after pops):", await redis.lrange("list:1"));

    console.log("\n== Set operations ==");
    await redis.sadd("set:1", "x", "y", "z");
    await redis.srem("set:1", "y");
    console.log("smembers set:1:", await redis.smembers("set:1"));

    console.log("\n== Pipeline ==");
    const pipe = redis.pipeline();
    pipe.cmd("SET", "pipe:1", "one");
    pipe.cmd("SET", "pipe:2", "two");
    pipe.cmd("MGET", "pipe:1", "pipe:2");
    const pipelineResults = await pipe.exec();
    console.log("pipeline results:", pipelineResults);

    console.log("\n== Transaction (MULTI/EXEC) ==");
    const txResults = await redis.transaction([
      "SET tx:1 one",
      ["SET", "tx:2", "two"],
      "MGET tx:1 tx:2"
    ]);
    console.log("transaction results:", txResults);

    console.log("\n== Pub/Sub ==");
    const channel = "test:channel";
    const received: string[] = [];
    const unsubscribe = await redis.subscribe(channel, (msg) => {
      console.log("(subscriber) received:", msg);
      received.push(msg);
    });
    await redis.publish(channel, "hello");
    await redis.publish(channel, "world");
    // wait a moment for messages to arrive
    await new Promise(r => setTimeout(r, 300));
    await unsubscribe();
    console.log("Messages received:", received);

    console.log("\n== scanAll ==");
    const keys = await redis.scanAll("*");
    console.log("All keys (subset shown):", keys.slice(0, 25));

    console.log("\n== exists / del ==");
    console.log("exists greeting:", await redis.exists("greeting"));
    console.log("del greeting:", await redis.del("greeting"));
    console.log("exists greeting after delete:", await redis.exists("greeting"));

  } catch (err) {
    console.error("Test error:", err);
  } finally {
    console.log("\nCleaning up test keys...");
    try {
      const cleanupKeys = [
        "greeting","temp:key","k1","k2","k3","counter",
        "hash:1","list:1","set:1","pipe:1","pipe:2","tx:1","tx:2","user:1"
      ];
      if (cleanupKeys.length) await redis.del(...cleanupKeys);
    } catch {}
    await redis.close();
    console.log("\n✓ Redis connection closed");
  }
}

// Run
if (import.meta.main) {
  testRedisWrapper().catch(e => { console.error(e); process.exit(1); });
}

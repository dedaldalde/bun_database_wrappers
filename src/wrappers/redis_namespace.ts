/**
 * Redis Namespace Wrapper
 * 
 * Provides automatic key prefixing for Redis operations to enable multiple
 * applications to safely share the same Redis instance.
 * 
 * @example
 * ```typescript
 * import { createRedis } from "./wrappers";
 * import { createNamespacedRedis } from "./wrappers/redis_namespace";
 * 
 * await using redis = await createRedis("redis://localhost:6379");
 * 
 * // Create separate namespaced clients for different apps
 * const authApp = createNamespacedRedis(redis, "auth");
 * const shopApp = createNamespacedRedis(redis, "shop");
 * 
 * // Each app works with its own namespace
 * await authApp.set("session:user123", "auth-data");
 * await shopApp.set("session:user123", "shop-data");
 * 
 * // Internally stored as:
 * // "auth:session:user123"
 * // "shop:session:user123"
 * ```
 */

import type { RedisWrapper } from "./rediswrapper";

import type { SetOptions } from "./rediswrapper";

/**
 * Namespaced Redis wrapper interface
 * Provides the same API as RedisWrapper but with automatic key prefixing
 */
export interface NamespacedRedisWrapper {
  // Core operations
  get(key: string): Promise<string | null>;
  set(key: string, value: string | number, options?: SetOptions): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
  exists(...keys: string[]): Promise<boolean>;
  
  // JSON operations
  getJSON<T = unknown>(key: string): Promise<T | null>;
  setJSON<T = unknown>(key: string, value: T, options?: SetOptions): Promise<unknown>;
  
  // Multi operations
  mget(...keys: string[]): Promise<(string | null)[]>;
  mset(data: Record<string, string | number>): Promise<"OK">;
  
  // Hash operations
  hget(key: string, field: string): Promise<string | null>;
  hset(key: string, field: string, value: string | number): Promise<number>;
  hmget(key: string, ...fields: string[]): Promise<(string | null)[] | null>;
  hmset(key: string, data: Record<string, string | number>): Promise<"OK">;
  hgetAll(key: string): Promise<Record<string, string> | Record<string, never>>;
  
  // Counter operations
  incr(key: string): Promise<number>;
  decr(key: string): Promise<number>;
  
  // TTL operations
  ttl(key: string): Promise<number>;
  setTTL(key: string, seconds: number): Promise<boolean>;
  expire(key: string, seconds: number): Promise<number>;
  
  // Pattern matching
  scanAll(pattern: string, count?: number): Promise<string[]>;
  
  // Pub/Sub
  subscribe(channel: string, callback: (message: string, channel: string) => void): Promise<() => Promise<void>>;
  publish(channel: string, message: string): Promise<number>;
  
  // List operations
  lpush(key: string, ...values: (string | number)[]): Promise<number>;
  rpush(key: string, ...values: (string | number)[]): Promise<number>;
  lrange(key: string, start?: number, stop?: number): Promise<string[]>;
  lpop(key: string): Promise<string | null>;
  rpop(key: string): Promise<string | null>;
  
  // Set operations
  sadd(key: string, ...members: (string | number)[]): Promise<number>;
  srem(key: string, ...members: (string | number)[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  
  // Cleanup
  [Symbol.asyncDispose](): Promise<void>;
}

/**
 * Creates a namespaced Redis wrapper that automatically prefixes all keys
 * 
 * This allows multiple applications to safely share the same Redis instance
 * by ensuring keys from different apps never collide.
 * 
 * @param redis - The base Redis wrapper instance
 * @param namespace - The namespace prefix (e.g., "myapp", "auth", "cache")
 * @returns A namespaced Redis wrapper
 * 
 * @example
 * ```typescript
 * const redis = await createRedis("redis://localhost:6379");
 * const myAppRedis = createNamespacedRedis(redis, "myapp");
 * 
 * // Internally stores as "myapp:user:123"
 * await myAppRedis.set("user:123", "data");
 * 
 * // Pattern matching works within namespace
 * const keys = await myAppRedis.scanAll("user:*");
 * ```
 * 
 * @example Environment-based namespaces
 * ```typescript
 * const namespace = `${process.env.APP_NAME}:${process.env.NODE_ENV}`;
 * const redis = createNamespacedRedis(baseRedis, namespace);
 * // Results in: "myapp:production:" or "myapp:staging:"
 * ```
 */
export function createNamespacedRedis(
  redis: RedisWrapper,
  namespace: string
): NamespacedRedisWrapper {
  // Ensure namespace ends with colon
  const prefix = namespace.endsWith(":") ? namespace : `${namespace}:`;

  /**
   * Add namespace prefix to key
   */
  const addPrefix = (key: string): string => `${prefix}${key}`;
  
  /**
   * Remove namespace prefix from key (for results)
   */
  const removePrefix = (key: string): string => 
    key.startsWith(prefix) ? key.slice(prefix.length) : key;

  return {
    // ========================================================================
    // Core Operations
    // ========================================================================
    
    async get(key: string) {
      return redis.get(addPrefix(key));
    },

    async set(key: string, value: string, options?) {
      return redis.set(addPrefix(key), value, options);
    },

    async del(...keys: string[]) {
      return redis.del(...keys.map(addPrefix));
    },

    async exists(...keys: string[]) {
      return redis.exists(...keys.map(addPrefix));
    },

    // ========================================================================
    // JSON Operations
    // ========================================================================
    
    async getJSON<T = unknown>(key: string) {
      return redis.getJSON<T>(addPrefix(key));
    },

    async setJSON<T = unknown>(key: string, value: T, options?: SetOptions) {
      return redis.setJSON(addPrefix(key), value, options);
    },

    // ========================================================================
    // Multi Operations
    // ========================================================================
    
    async mget(...keys: string[]) {
      return redis.mget(...keys.map(addPrefix));
    },

    async mset(data: Record<string, string>) {
      const prefixedData: Record<string, string> = {};
      for (const [key, value] of Object.entries(data)) {
        prefixedData[addPrefix(key)] = value;
      }
      return redis.mset(prefixedData);
    },

    // ========================================================================
    // Hash Operations
    // ========================================================================
    
    async hget(key: string, field: string) {
      return redis.hget(addPrefix(key), field);
    },

    async hset(key: string, field: string, value: string) {
      return redis.hset(addPrefix(key), field, value);
    },

    async hmget(key: string, ...fields: string[]) {
      return redis.hmget(addPrefix(key), ...fields);
    },

    async hmset(key: string, data: Record<string, string>) {
      return redis.hmset(addPrefix(key), data);
    },

    async hgetAll(key: string) {
      return redis.hgetAll(addPrefix(key));
    },

    // ========================================================================
    // Counter Operations
    // ========================================================================
    
    async incr(key: string) {
      return redis.incr(addPrefix(key));
    },

    async decr(key: string) {
      return redis.decr(addPrefix(key));
    },

    // ========================================================================
    // TTL Operations
    // ========================================================================
    
    async ttl(key: string) {
      return redis.ttl(addPrefix(key));
    },

    async setTTL(key: string, seconds: number) {
      return redis.setTTL(addPrefix(key), seconds);
    },

    async expire(key: string, seconds: number) {
      return redis.expire(addPrefix(key), seconds);
    },

    // ========================================================================
    // Pattern Matching (within namespace)
    // ========================================================================
    
    async scanAll(pattern: string, count?) {
      const prefixedPattern = addPrefix(pattern);
      const keys = await redis.scanAll(prefixedPattern, count);
      // Remove prefix from returned keys so they appear namespace-relative
      return keys.map(removePrefix);
    },

    // ========================================================================
    // Pub/Sub (with namespaced channels)
    // ========================================================================
    
    async subscribe(channel: string, callback: (message: string, channel: string) => void) {
      return redis.subscribe(addPrefix(channel), callback);
    },

    async publish(channel: string, message: string) {
      return redis.publish(addPrefix(channel), message);
    },

    // ========================================================================
    // List Operations
    // ========================================================================
    
    async lpush(key: string, ...values: (string | number)[]) {
      return redis.lpush(addPrefix(key), ...values);
    },

    async rpush(key: string, ...values: (string | number)[]) {
      return redis.rpush(addPrefix(key), ...values);
    },

    async lrange(key: string, start = 0, stop = -1) {
      return redis.lrange(addPrefix(key), start, stop);
    },

    async lpop(key: string) {
      return redis.lpop(addPrefix(key));
    },

    async rpop(key: string) {
      return redis.rpop(addPrefix(key));
    },

    // ========================================================================
    // Set Operations
    // ========================================================================
    
    async sadd(key: string, ...members: (string | number)[]) {
      return redis.sadd(addPrefix(key), ...members);
    },

    async srem(key: string, ...members: (string | number)[]) {
      return redis.srem(addPrefix(key), ...members);
    },

    async smembers(key: string) {
      return redis.smembers(addPrefix(key));
    },

    // ========================================================================
    // Cleanup
    // ========================================================================
    
    async [Symbol.asyncDispose]() {
      // Don't dispose the underlying Redis connection
      // as it might be shared across multiple namespaces
      // The base Redis wrapper will handle cleanup
    }
  };
}

/**
 * Helper function to clear all keys in a namespace
 * 
 * @param redis - The base Redis wrapper instance
 * @param namespace - The namespace to clear
 * @returns Number of keys deleted
 * 
 * @example
 * ```typescript
 * const redis = await createRedis("redis://localhost:6379");
 * 
 * // Clear all keys in the "myapp" namespace
 * const deleted = await clearNamespace(redis, "myapp");
 * console.log(`Deleted ${deleted} keys from myapp namespace`);
 * ```
 */
export async function clearNamespace(
  redis: RedisWrapper,
  namespace: string
): Promise<number> {
  const prefix = namespace.endsWith(":") ? namespace : `${namespace}:`;
  const pattern = `${prefix}*`;
  const keys = await redis.scanAll(pattern);
  
  if (keys.length > 0) {
    return await redis.del(...keys);
  }
  
  return 0;
}

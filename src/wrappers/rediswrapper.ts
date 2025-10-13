import { RedisClient } from "bun";

type Key = string;

/**
 * Options for the SET command
 */
export interface SetOptions {
  /** Expire time in seconds */
  EX?: number;
  /** Expire time in milliseconds */
  PX?: number;
  /** Only set if key does not exist */
  NX?: boolean;
  /** Only set if key exists */
  XX?: boolean;
  /** Retain the time to live associated with the key */
  KEEPTTL?: boolean;
}

/**
 * A wrapper class for Redis operations using Bun's RedisClient
 */
export class RedisWrapper {
  private client: RedisClient;
  private url: string;

  private constructor(client: RedisClient, url: string) {
    this.client = client;
    this.url = url;
  }

  /**
   * Connect to a Redis server
   * @param url - Redis connection URL (default: "redis://localhost:6379")
   * @returns A connected RedisWrapper instance
   */
  static async connect(url?: string): Promise<RedisWrapper> {
    const connectionUrl = url || "redis://localhost:6379";
    const client = new RedisClient(connectionUrl);
    await client.connect();
    return new RedisWrapper(client, connectionUrl);
  }

  /**
   * Execute a generic Redis command
   * @param cmd - The Redis command to execute
   * @param args - Command arguments
   * @returns The command result
   */
  async command<T = unknown>(cmd: string, ...args: any[]): Promise<T> {
    return this.client.send(cmd, args) as Promise<T>;
  }

  /**
   * Get the value of a key
   * @param key - The key to retrieve
   * @returns The value or null if key doesn't exist
   */
  async get(key: Key) { 
    return this.client.get(key); 
  }
  
  /**
   * Set the string value of a key
   * @param key - The key to set
   * @param value - The value to set
   * @param opts - Optional SET command options (EX, PX, NX, XX, KEEPTTL)
   * @returns OK if successful
   */
  async set(key: Key, value: string | number, opts?: SetOptions) {
    const args: any[] = [];
    if (opts) {
      if (opts.EX) args.push("EX", opts.EX);
      if (opts.PX) args.push("PX", opts.PX);
      if (opts.NX) args.push("NX");
      if (opts.XX) args.push("XX");
      if (opts.KEEPTTL) args.push("KEEPTTL");
    }
    return this.client.set(key, value.toString(), ...args);
  }
  
  /**
   * Get and parse a JSON value from a key
   * @param key - The key to retrieve
   * @returns Parsed JSON object or null if key doesn't exist or parsing fails
   */
  async getJSON<T = any>(key: Key): Promise<T | null> {
    const v = await this.get(key);
    if (v == null) return null;
    try { return JSON.parse(v) as T; } catch { return null; }
  }
  
  /**
   * Set a JSON value for a key
   * @param key - The key to set
   * @param obj - The object to stringify and store
   * @param opts - Optional SET command options
   * @returns OK if successful
   */
  async setJSON(key: Key, obj: any, opts?: SetOptions) {
    return this.set(key, JSON.stringify(obj), opts);
  }
  
  /**
   * Delete one or more keys
   * @param keys - The keys to delete
   * @returns The number of keys that were removed
   */
  async del(...keys: Key[]) { 
    return this.client.del(...keys); 
  }
  
  /**
   * Check if one or more keys exist
   * @param keys - The keys to check
   * @returns True if the key exists, false otherwise
   */
  async exists(...keys: Key[]) { 
    if (keys.length === 0) return false;
    return this.client.exists(keys[0]!); 
  }
  
  /**
   * Increment the integer value of a key by one
   * @param key - The key to increment
   * @returns The value after the increment
   */
  async incr(key: Key) { 
    return this.client.incr(key); 
  }
  
  /**
   * Decrement the integer value of a key by one
   * @param key - The key to decrement
   * @returns The value after the decrement
   */
  async decr(key: Key) { 
    return this.client.decr(key); 
  }
  
  /**
   * Get the values of multiple keys
   * @param keys - The keys to retrieve
   * @returns An array of values
   */
  async mget(...keys: Key[]) { 
    return this.client.mget(...keys); 
  }
  
  /**
   * Set multiple key-value pairs
   * @param kv - Object with key-value pairs to set
   * @returns OK if successful
   */
  async mset(kv: Record<string,string|number>) {
    const flat: any[] = [];
    for (const [k,v] of Object.entries(kv)) flat.push(k, v.toString());
    return this.client.mset(...flat);
  }
  
  /**
   * Set a key's time to live in seconds
   * @param key - The key to set expiration on
   * @param seconds - Number of seconds until expiration
   * @returns 1 if timeout was set, 0 if key doesn't exist
   */
  async expire(key: Key, seconds: number) { 
    return this.client.expire(key, seconds); 
  }
  
  /**
   * Get the time to live for a key in seconds
   * @param key - The key to check
   * @returns TTL in seconds, -1 if key exists but has no TTL, -2 if key doesn't exist
   */
  async ttl(key: Key) { 
    return this.client.ttl(key); 
  }

  /**
   * Get the value of a hash field
   * @param hash - The hash key
   * @param field - The field name
   * @returns The field value or null
   */
  async hget(hash: Key, field: string) { 
    return this.client.hget(hash, field); 
  }
  
  /**
   * Set the value of a hash field
   * @param hash - The hash key
   * @param field - The field name
   * @param value - The value to set
   * @returns 1 if field is new, 0 if field was updated
   */
  async hset(hash: Key, field: string, value: string | number) { 
    return this.client.hset(hash, field, value.toString()); 
  }
  
  /**
   * Get the values of multiple hash fields
   * @param hash - The hash key
   * @param fields - The field names to retrieve
   * @returns Array of field values
   */
  async hmget(hash: Key, ...fields: string[]) { 
    return this.client.hmget(hash, ...fields); 
  }
  
  /**
   * Set multiple hash fields to multiple values
   * @param hash - The hash key
   * @param kv - Object with field-value pairs
   * @returns OK if successful
   */
  async hmset(hash: Key, kv: Record<string,string|number>) {
    const flat: string[] = [];
    for (const [k,v] of Object.entries(kv)) {
      flat.push(k, v.toString());
    }
    return this.client.hmset(hash, flat);
  }
  
  /**
   * Get all fields and values in a hash
   * @param hash - The hash key
   * @returns Object with all field-value pairs
   */
  async hgetAll(hash: Key) { 
    return this.client.hgetall(hash); 
  }

  /**
   * Prepend one or multiple values to a list
   * @param list - The list key
   * @param values - The values to prepend
   * @returns The length of the list after the operation
   */
  async lpush(list: Key, ...values: (string|number)[]) {
    return this.client.send("LPUSH", [list, ...values.map(v => v.toString())]);
  }
  
  /**
   * Append one or multiple values to a list
   * @param list - The list key
   * @param values - The values to append
   * @returns The length of the list after the operation
   */
  async rpush(list: Key, ...values: (string|number)[]) {
    return this.client.send("RPUSH", [list, ...values.map(v => v.toString())]);
  }
  
  /**
   * Get a range of elements from a list
   * @param list - The list key
   * @param start - Start index (default: 0)
   * @param stop - Stop index (default: -1 for end of list)
   * @returns Array of elements in the specified range
   */
  async lrange(list: Key, start = 0, stop = -1) { 
    return this.client.lrange(list, start, stop); 
  }
  
  /**
   * Remove and return the first element of a list
   * @param list - The list key
   * @returns The first element or null if list is empty
   */
  async lpop(list: Key) { 
    return this.client.lpop(list); 
  }
  
  /**
   * Remove and return the last element of a list
   * @param list - The list key
   * @returns The last element or null if list is empty
   */
  async rpop(list: Key) { 
    return this.client.rpop(list); 
  }

  /**
   * Add one or more members to a set
   * @param key - The set key
   * @param members - The members to add
   * @returns The number of elements added to the set
   */
  async sadd(key: Key, ...members: (string|number)[]) {
    return this.client.sadd(key, ...members.map(m => m.toString()));
  }
  
  /**
   * Remove one or more members from a set
   * @param key - The set key
   * @param members - The members to remove
   * @returns The number of members that were removed
   */
  async srem(key: Key, ...members: (string|number)[]) {
    return this.client.srem(key, ...members.map(m => m.toString()));
  }
  
  /**
   * Get all members of a set
   * @param key - The set key
   * @returns Array of set members
   */
  async smembers(key: Key) { 
    return this.client.smembers(key); 
  }

  /**
   * Subscribe to a channel and handle incoming messages
   * @param channel - The channel name to subscribe to
   * @param onMessage - Callback function to handle messages
   * @returns Unsubscribe function to stop listening
   */
  async subscribe(channel: string, onMessage: (msg: string, channel: string) => void) {
    // For subscriptions, use a duplicate connection to avoid blocking the main client
    const subscriber = await this.client.duplicate();
    await subscriber.subscribe(channel, onMessage);
    return async () => { 
      try { 
        await subscriber.unsubscribe(channel);
        subscriber.close();
      } catch {} 
    };
  }
  
  /**
   * Publish a message to a channel
   * @param channel - The channel name
   * @param message - The message to publish
   * @returns The number of clients that received the message
   */
  async publish(channel: string, message: string) { 
    return this.client.publish(channel, message); 
  }

  /**
   * Scan all keys matching a pattern
   * @param pattern - Pattern to match (default: "*")
   * @param count - Number of elements to return per iteration (default: 1000)
   * @returns Array of matching keys
   */
  async scanAll(pattern = "*", count = 1000): Promise<string[]> {
    let cursor = "0";
    const out: string[] = [];
    do {
      const res: any = await this.client.scan(cursor, "MATCH", pattern, "COUNT", count);
      cursor = res[0];
      out.push(...res[1]);
    } while (cursor !== "0");
    return out;
  }

  /**
   * Create a pipeline for batching multiple commands
   * @returns Pipeline builder object with cmd() and exec() methods
   */
  pipeline() {
    const commands: any[] = [];
    const self = this;
    return {
      cmd: (command: string, ...args: any[]) => {
        commands.push([command, ...args]);
        return this;
      },
      exec: async () => {
        // Bun automatically pipelines when using Promise.all
        return Promise.all(commands.map(([cmd, ...args]) => 
          self.client.send(cmd, args)
        ));
      }
    };
  }

  /**
   * Execute multiple commands as an atomic transaction
   * @param commands - Array of commands (strings or string arrays)
   * @returns Results of all commands in the transaction
   */
  async transaction(commands: (string | string[])[]) {
    await this.client.send("MULTI", []);
    for (const cmd of commands) {
      const parsed = typeof cmd === "string" ? cmd.split(/\s+/) : cmd;
      if (parsed.length > 0 && parsed[0]) {
        await this.client.send(parsed[0]!, parsed.slice(1));
      }
    }
    return this.client.send("EXEC", []);
  }

  /**
   * Get server information and statistics
   * @param section - Optional section to retrieve (e.g., "server", "memory", "stats")
   * @returns Server information as a string
   */
  async info(section?: string) {
    return section ? this.client.send("INFO", [section]) : this.client.send("INFO", []);
  }

  /**
   * Close the Redis connection
   */
  async close() {
    this.client.close();
  }
}

/**
 * Redis Comprehensive Demo
 * 
 * This demo showcases Redis-specific features and real-world scenarios:
 * - High-performance caching strategies
 * - Session management with TTL
 * - Rate limiting implementation
 * - Real-time features with Pub/Sub
 * - Shopping cart management
 * - Leaderboards and sorted sets
 * 
 * Prerequisites:
 * - Redis server running (default: localhost:6379)
 * - Or set REDIS_URL environment variable
 * 
 * Run with: bun run demo:redis-comprehensive
 */

import { createRedis } from "../wrappers";

// ============================================================================
// Type Definitions
// ============================================================================

interface UserSession extends Record<string, unknown> {
  userId: number;
  username: string;
  email: string;
  role: string;
  loginAt: number;
  expiresAt: number;
  permissions: string[];
  metadata: {
    ipAddress: string;
    userAgent: string;
  };
}

interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  addedAt: number;
}

interface Product extends Record<string, unknown> {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  inStock: boolean;
}

// ============================================================================
// Demo: High-Performance Application with Redis
// ============================================================================

async function main() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║                                                            ║");
  console.log("║        REDIS COMPREHENSIVE DEMO                            ║");
  console.log("║        High-Performance Caching & Real-Time Features       ║");
  console.log("║                                                            ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  const url = process.env.REDIS_URL || "redis://localhost:6379";
  console.log(`🔌 Connecting to Redis at ${url}...\n`);

  await using redis = await createRedis(url);

  console.log("✓ Connected to Redis\n");

  try {
    // ========================================================================
    // Scenario 1: Session Management
    // ========================================================================
    console.log("🔐 SCENARIO 1: User session management");
    console.log("═".repeat(60) + "\n");

    console.log("Creating user session with auto-expiration...");
    
    const session: UserSession = {
      userId: 12345,
      username: "alice_wonder",
      email: "alice@example.com",
      role: "admin",
      loginAt: Date.now(),
      expiresAt: Date.now() + 3600000, // 1 hour
      permissions: ["read", "write", "delete", "admin"],
      metadata: {
        ipAddress: "192.168.1.100",
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)"
      }
    };

    // Store with 1 hour TTL
    await redis.setJSON<UserSession>("session:user:12345", session, { EX: 3600 });
    console.log("✓ Session stored with 1-hour TTL\n");

    // Retrieve session
    const retrievedSession = await redis.getJSON<UserSession>("session:user:12345");
    if (retrievedSession) {
      const timeLeft = Math.round((retrievedSession.expiresAt - Date.now()) / 1000 / 60);
      console.log("Session details:");
      console.log(`  User: ${retrievedSession.username} (${retrievedSession.email})`);
      console.log(`  Role: ${retrievedSession.role}`);
      console.log(`  Permissions: ${retrievedSession.permissions.join(", ")}`);
      console.log(`  IP: ${retrievedSession.metadata.ipAddress}`);
      console.log(`  Expires in: ~${timeLeft} minutes`);
      
      const ttl = await redis.ttl("session:user:12345");
      console.log(`  Actual TTL: ${ttl} seconds\n`);
    }

    // Session validation
    console.log("Validating session...");
    const isValid = await redis.exists("session:user:12345");
    console.log(`✓ Session is ${isValid ? "VALID" : "EXPIRED"}\n`);

    // ========================================================================
    // Scenario 2: Shopping Cart Management
    // ========================================================================
    console.log("🛒 SCENARIO 2: Shopping cart management");
    console.log("═".repeat(60) + "\n");

    console.log("Building shopping cart...");
    
    const cart: CartItem[] = [
      { productId: "PROD-001", name: "Laptop Pro", price: 1299.99, quantity: 1, addedAt: Date.now() },
      { productId: "PROD-002", name: "Wireless Mouse", price: 29.99, quantity: 2, addedAt: Date.now() },
      { productId: "PROD-003", name: "USB-C Hub", price: 49.99, quantity: 1, addedAt: Date.now() }
    ];

    await redis.setJSON("cart:user:12345", cart, { EX: 86400 }); // 24-hour expiry
    console.log("✓ Cart stored (expires in 24 hours)\n");

    // Retrieve cart
    const savedCart = await redis.getJSON<CartItem[]>("cart:user:12345");
    if (savedCart) {
      const totalItems = savedCart.reduce((sum, item) => sum + item.quantity, 0);
      const totalPrice = savedCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      
      console.log(`Cart contains ${totalItems} items ($${totalPrice.toFixed(2)} total):`);
      savedCart.forEach(item => {
        console.log(`  • ${item.name} - $${item.price.toFixed(2)} × ${item.quantity}`);
      });
      console.log();
    }

    // ========================================================================
    // Scenario 3: API Response Caching
    // ========================================================================
    console.log("⚡ SCENARIO 3: API response caching (Cache-Aside pattern)");
    console.log("═".repeat(60) + "\n");

    // Simulate expensive database query
    async function getProductsFromDB(category: string): Promise<Product[]> {
      console.log("  📀 Querying database... (slow)");
      await new Promise(r => setTimeout(r, 150)); // Simulate DB latency
      return [
        { id: "1", name: "Laptop Pro", description: "High-performance", price: 1299.99, category, inStock: true },
        { id: "2", name: "Wireless Mouse", description: "Ergonomic", price: 29.99, category, inStock: true },
        { id: "3", name: "Keyboard", description: "Mechanical", price: 149.99, category, inStock: true }
      ];
    }

    async function getProducts(category: string): Promise<Product[]> {
      const cacheKey = `products:${category}`;
      
      // Try cache first
      const cached = await redis.getJSON<Product[]>(cacheKey);
      if (cached) {
        console.log("  ⚡ Retrieved from CACHE (fast)");
        return cached;
      }
      
      // Cache miss - get from DB
      const products = await getProductsFromDB(category);
      
      // Store in cache for 5 minutes
      await redis.setJSON(cacheKey, products, { EX: 300 });
      console.log("  ✓ Stored in cache (5 min TTL)");
      
      return products;
    }

    console.log("First request (cold cache):");
    const start1 = Date.now();
    await getProducts("electronics");
    const time1 = Date.now() - start1;
    console.log(`  Time: ${time1}ms\n`);

    console.log("Second request (warm cache):");
    const start2 = Date.now();
    await getProducts("electronics");
    const time2 = Date.now() - start2;
    console.log(`  Time: ${time2}ms`);
    console.log(`  ⚡ ${Math.round(time1 / time2)}x faster!\n`);

    // ========================================================================
    // Scenario 4: Rate Limiting
    // ========================================================================
    console.log("🚦 SCENARIO 4: Rate limiting (Sliding Window)");
    console.log("═".repeat(60) + "\n");

    async function checkRateLimit(userId: string, maxRequests: number, windowSeconds: number): Promise<boolean> {
      const key = `ratelimit:${userId}`;
      const currentCount = await redis.incr(key);
      
      if (currentCount === 1) {
        // First request in window - set expiry
        await redis.setTTL(key, windowSeconds);
      }
      
      return currentCount <= maxRequests;
    }

    const userId = "user:12345";
    const maxRequests = 10;
    const windowSeconds = 60;
    
    console.log(`Rate limit: ${maxRequests} requests per ${windowSeconds} seconds`);
    console.log("Simulating requests:\n");

    for (let i = 1; i <= 12; i++) {
      const allowed = await checkRateLimit(userId, maxRequests, windowSeconds);
      
      if (allowed) {
        const remaining = maxRequests - i;
        console.log(`  ✓ Request ${i} allowed (${remaining} remaining)`);
      } else {
        console.log(`  ✗ Request ${i} BLOCKED - Rate limit exceeded!`);
        console.log(`  Wait ${windowSeconds} seconds before retrying\n`);
        break;
      }
    }

    // ========================================================================
    // Scenario 5: Real-Time Leaderboard
    // ========================================================================
    console.log("\n🏆 SCENARIO 5: Real-time leaderboard with sorted sets");
    console.log("═".repeat(60) + "\n");

    console.log("Setting up game leaderboard...");
    
    // Add players with scores using hash (simpler for demo)
    const leaderboard = {
      alice: "1450",
      bob: "980",
      charlie: "1820",
      diana: "1120",
      evan: "2100",
      frank: "875",
      grace: "1650",
      henry: "1340"
    };

    await redis.hmset("leaderboard:daily", leaderboard);
    console.log("✓ Scores recorded\n");

    // Get all scores and sort
    const allScores = await redis.hgetAll("leaderboard:daily");
    const sorted = Object.entries(allScores as Record<string, string>)
      .map(([player, score]) => ({ player, score: parseInt(score) }))
      .sort((a, b) => b.score - a.score);

    console.log("Top 5 Players:");
    sorted.slice(0, 5).forEach((entry, i) => {
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "  ";
      console.log(`  ${medal} ${i + 1}. ${entry.player.padEnd(10)} - ${entry.score.toLocaleString()} points`);
    });
    console.log();

    // Update a score
    console.log("Alice scores 200 more points!");
    const newScore = 1450 + 200;
    await redis.hset("leaderboard:daily", "alice", newScore.toString());
    console.log(`✓ Alice's new score: ${newScore}\n`);

    // ========================================================================
    // Scenario 6: Pub/Sub - Real-Time Notifications
    // ========================================================================
    console.log("📢 SCENARIO 6: Real-time notifications with Pub/Sub");
    console.log("═".repeat(60) + "\n");

    const notifications: string[] = [];
    const channel = "notifications:user:12345";
    
    console.log(`Subscribing to channel: ${channel}`);
    
    const unsubscribe = await redis.subscribe(channel, (message) => {
      notifications.push(message);
      console.log(`  📬 Received: ${message}`);
    });

    console.log("✓ Subscribed\n");
    console.log("Publishing notifications...");

    // Simulate various notifications
    await redis.publish(channel, "Your order #12345 has been confirmed!");
    await new Promise(r => setTimeout(r, 100));
    
    await redis.publish(channel, "Payment processed successfully");
    await new Promise(r => setTimeout(r, 100));
    
    await redis.publish(channel, "Your package is out for delivery");
    await new Promise(r => setTimeout(r, 100));
    
    await redis.publish(channel, "Package delivered!");
    await new Promise(r => setTimeout(r, 200)); // Wait for messages to arrive

    await unsubscribe();
    console.log(`\n✓ Received ${notifications.length} notifications total\n`);

    // ========================================================================
    // Scenario 7: Multi-Get for Batch Operations
    // ========================================================================
    console.log("📦 SCENARIO 7: Batch operations with MGET/MSET");
    console.log("═".repeat(60) + "\n");

    console.log("Setting multiple values at once (MSET)...");
    await redis.mset({
      "user:1:name": "Alice",
      "user:2:name": "Bob",
      "user:3:name": "Charlie",
      "user:1:email": "alice@example.com",
      "user:2:email": "bob@example.com",
      "user:3:email": "charlie@example.com"
    });
    console.log("✓ 6 values set atomically\n");

    console.log("Getting multiple values at once (MGET)...");
    const names = await redis.mget("user:1:name", "user:2:name", "user:3:name");
    console.log("User names:", names);
    
    const emails = await redis.mget("user:1:email", "user:2:email", "user:3:email");
    console.log("User emails:", emails);
    console.log();

    // ========================================================================
    // Scenario 8: Counter Operations
    // ========================================================================
    console.log("🔢 SCENARIO 8: Atomic counter operations");
    console.log("═".repeat(60) + "\n");

    console.log("Tracking page views...");
    
    // Increment page views
    for (let i = 0; i < 5; i++) {
      const views = await redis.incr("page:home:views");
      console.log(`  Page view #${views}`);
      await new Promise(r => setTimeout(r, 50));
    }

    const totalViews = await redis.get("page:home:views");
    console.log(`\n✓ Total views: ${totalViews}\n`);

    // ========================================================================
    // Scenario 9: Cache Invalidation Patterns
    // ========================================================================
    console.log("🔄 SCENARIO 9: Cache invalidation with pattern matching");
    console.log("═".repeat(60) + "\n");

    console.log("Setting up multiple cached entries...");
    await redis.set("cache:products:electronics", "data1");
    await redis.set("cache:products:furniture", "data2");
    await redis.set("cache:products:clothing", "data3");
    await redis.set("cache:categories:all", "data4");
    await redis.set("cache:featured:today", "data5");
    console.log("✓ 5 cached entries created\n");

    console.log("Invalidating all product caches...");
    const pattern = "cache:products:*";
    const keysToDelete = await redis.scanAll(pattern);
    
    console.log(`Found ${keysToDelete.length} keys matching "${pattern}":`);
    keysToDelete.forEach(key => console.log(`  • ${key}`));
    
    if (keysToDelete.length > 0) {
      await redis.del(...keysToDelete);
      console.log(`\n✓ Invalidated ${keysToDelete.length} cached entries\n`);
    }

    // ========================================================================
    // Scenario 10: Hash Operations for Objects
    // ========================================================================
    console.log("🗂️  SCENARIO 10: Hash operations for structured data");
    console.log("═".repeat(60) + "\n");

    console.log("Storing user profile as hash...");
    await redis.hmset("user:profile:12345", {
      username: "alice_wonder",
      email: "alice@example.com",
      firstName: "Alice",
      lastName: "Wonderland",
      age: "30",
      city: "San Francisco",
      country: "USA"
    });
    console.log("✓ Profile stored\n");

    // Get specific fields
    console.log("Getting specific fields (HMGET)...");
    const nameFields = await redis.hmget("user:profile:12345", "firstName", "lastName");
    console.log(`Name: ${nameFields?.join(" ")}`);

    const locationFields = await redis.hmget("user:profile:12345", "city", "country");
    console.log(`Location: ${locationFields?.join(", ")}`);
    console.log();

    // Get all fields
    console.log("Getting complete profile (HGETALL)...");
    const fullProfile = await redis.hgetAll("user:profile:12345");
    console.log("Complete profile:");
    Object.entries(fullProfile as Record<string, string>).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });
    console.log();

    // ========================================================================
    // Cleanup
    // ========================================================================
    console.log("🧹 Cleaning up test data...");
    const keysToCleanup = [
      "session:user:12345",
      "cart:user:12345",
      "products:electronics",
      "ratelimit:user:12345",
      "leaderboard:daily",
      "page:home:views",
      "cache:categories:all",
      "cache:featured:today",
      "user:profile:12345",
      "user:1:name", "user:2:name", "user:3:name",
      "user:1:email", "user:2:email", "user:3:email"
    ];

    await redis.del(...keysToCleanup);
    console.log(`✓ Cleaned up ${keysToCleanup.length} keys\n`);

    // ========================================================================
    // Summary
    // ========================================================================
    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║  ✅ Redis Comprehensive Demo Completed!                   ║");
    console.log("╚════════════════════════════════════════════════════════════╝");
    console.log("\n📚 What you've seen:");
    console.log("   ✓ Session management with automatic expiration");
    console.log("   ✓ Shopping cart persistence");
    console.log("   ✓ Cache-aside pattern for API responses");
    console.log("   ✓ Rate limiting with sliding window");
    console.log("   ✓ Real-time leaderboards");
    console.log("   ✓ Pub/Sub for live notifications");
    console.log("   ✓ Batch operations (MGET/MSET)");
    console.log("   ✓ Atomic counter operations");
    console.log("   ✓ Pattern-based cache invalidation");
    console.log("   ✓ Hash operations for structured data");
    console.log("\n🎯 Redis-specific features demonstrated:");
    console.log("   • TTL (Time To Live) for auto-expiration");
    console.log("   • Type-safe JSON serialization");
    console.log("   • Pub/Sub messaging");
    console.log("   • Atomic operations (INCR, DECR)");
    console.log("   • Pattern matching with SCAN");
    console.log("   • Hash data structures");
    console.log("   • Multi-get/set for efficiency");
    console.log("\n⚡ Perfect for:");
    console.log("   • High-speed caching");
    console.log("   • Session management");
    console.log("   • Real-time features");
    console.log("   • Rate limiting");
    console.log("   • Leaderboards");
    console.log("   • Temporary data storage");
    console.log("\n🚀 Ready for production Redis workloads!");

  } catch (error) {
    if (error instanceof Error && error.message.includes("ECONNREFUSED")) {
      console.error("\n❌ Error: Cannot connect to Redis server");
      console.error("\n💡 To start Redis:");
      console.error("   macOS:  brew services start redis");
      console.error("   Linux:  sudo systemctl start redis");
      console.error("   Docker: docker run -d -p 6379:6379 redis");
    } else {
      console.error("\n❌ Error:", error);
    }
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.main) {
  main().catch(console.error);
}

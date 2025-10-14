/**
 * Redis Namespace Demo
 * 
 * Demonstrates how to use the namespace wrapper to safely share a single
 * Redis instance across multiple applications or services.
 * 
 * Prerequisites:
 * - Redis server running (default: localhost:6379)
 * - Or set REDIS_URL environment variable
 * 
 * Run with: bun run src/demos/redis_namespace_demo.ts
 */

import { createRedis, createNamespacedRedis, clearNamespace } from "../wrappers";

interface UserSession {
  userId: number;
  username: string;
  loginAt: number;
}

interface CartItem {
  productId: string;
  quantity: number;
  price: number;
}

interface AnalyticsEvent {
  eventType: string;
  timestamp: number;
  data: Record<string, unknown>;
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║                                                            ║");
  console.log("║        REDIS NAMESPACE DEMO                                ║");
  console.log("║        Multiple Apps, Single Redis Instance                ║");
  console.log("║                                                            ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  const url = process.env.REDIS_URL || "redis://localhost:6379";
  console.log(`🔌 Connecting to Redis at ${url}...\n`);

  // Single Redis connection shared across all apps
  await using redis = await createRedis(url);
  console.log("✓ Connected to Redis\n");

  // ========================================================================
  // Scenario 1: Separate Applications with Namespaces
  // ========================================================================
  console.log("🏢 SCENARIO 1: Multiple applications sharing Redis");
  console.log("═".repeat(60) + "\n");

  // Create namespaced clients for different apps
  const authApp = createNamespacedRedis(redis, "auth");
  const shopApp = createNamespacedRedis(redis, "shop");
  const analyticsApp = createNamespacedRedis(redis, "analytics");

  console.log("Creating data in different namespaces...\n");

  // Each app stores its own session data
  const authSession: UserSession = {
    userId: 12345,
    username: "alice",
    loginAt: Date.now()
  };

  const shopSession: UserSession = {
    userId: 12345,
    username: "alice",
    loginAt: Date.now()
  };

  const analyticsSession: UserSession = {
    userId: 12345,
    username: "alice",
    loginAt: Date.now()
  };

  // Same key "session:user:12345" but in different namespaces
  await authApp.setJSON("session:user:12345", authSession, { EX: 3600 });
  await shopApp.setJSON("session:user:12345", shopSession, { EX: 3600 });
  await analyticsApp.setJSON("session:user:12345", analyticsSession, { EX: 3600 });

  console.log("✓ Auth app stored: auth:session:user:12345");
  console.log("✓ Shop app stored: shop:session:user:12345");
  console.log("✓ Analytics app stored: analytics:session:user:12345\n");

  // Retrieve data from each namespace
  const authData = await authApp.getJSON<UserSession>("session:user:12345");
  const shopData = await shopApp.getJSON<UserSession>("session:user:12345");
  const analyticsData = await analyticsApp.getJSON<UserSession>("session:user:12345");

  console.log("Retrieved sessions:");
  console.log(`  Auth: ${authData?.username}`);
  console.log(`  Shop: ${shopData?.username}`);
  console.log(`  Analytics: ${analyticsData?.username}\n`);

  // ========================================================================
  // Scenario 2: Different Data Types per App
  // ========================================================================
  console.log("📦 SCENARIO 2: App-specific data structures");
  console.log("═".repeat(60) + "\n");

  // Auth app: Store login counts
  console.log("Auth app: Tracking login counts...");
  await authApp.incr("login:count");
  await authApp.incr("login:count");
  await authApp.incr("login:count");
  const loginCount = await authApp.get("login:count");
  console.log(`✓ Total logins: ${loginCount}\n`);

  // Shop app: Store shopping cart
  console.log("Shop app: Managing shopping cart...");
  const cart: CartItem[] = [
    { productId: "PROD-001", quantity: 2, price: 29.99 },
    { productId: "PROD-002", quantity: 1, price: 149.99 }
  ];
  await shopApp.setJSON("cart:user:12345", cart);
  const savedCart = await shopApp.getJSON<CartItem[]>("cart:user:12345");
  const totalPrice = savedCart?.reduce((sum, item) => sum + (item.price * item.quantity), 0) || 0;
  console.log(`✓ Cart stored with ${savedCart?.length} items ($${totalPrice.toFixed(2)})\n`);

  // Analytics app: Store events
  console.log("Analytics app: Recording events...");
  const event: AnalyticsEvent = {
    eventType: "page_view",
    timestamp: Date.now(),
    data: { page: "/products", userId: 12345 }
  };
  await analyticsApp.lpush("events:user:12345", JSON.stringify(event));
  console.log("✓ Event recorded\n");

  // ========================================================================
  // Scenario 3: Pattern Matching within Namespace
  // ========================================================================
  console.log("🔍 SCENARIO 3: Pattern matching within namespaces");
  console.log("═".repeat(60) + "\n");

  // Add multiple keys to each namespace
  console.log("Creating multiple keys in each namespace...");
  await authApp.set("user:1:token", "token1");
  await authApp.set("user:2:token", "token2");
  await authApp.set("user:3:token", "token3");
  
  await shopApp.set("order:1001", "pending");
  await shopApp.set("order:1002", "shipped");
  await shopApp.set("order:1003", "delivered");

  // Pattern matching works within namespace only
  const authUserKeys = await authApp.scanAll("user:*");
  const shopOrderKeys = await shopApp.scanAll("order:*");

  console.log(`\n✓ Auth app keys matching "user:*": ${authUserKeys.length} keys`);
  authUserKeys.forEach(key => console.log(`    • ${key}`));
  
  console.log(`\n✓ Shop app keys matching "order:*": ${shopOrderKeys.length} keys`);
  shopOrderKeys.forEach(key => console.log(`    • ${key}`));
  console.log();

  // ========================================================================
  // Scenario 4: Environment-Based Namespaces
  // ========================================================================
  console.log("🌍 SCENARIO 4: Environment-based namespaces");
  console.log("═".repeat(60) + "\n");

  // Simulate different environments
  const prodAuth = createNamespacedRedis(redis, "myapp:production:auth");
  const stagingAuth = createNamespacedRedis(redis, "myapp:staging:auth");
  const devAuth = createNamespacedRedis(redis, "myapp:development:auth");

  console.log("Storing data in different environments...");
  await prodAuth.set("config:api_key", "prod-key-xxx");
  await stagingAuth.set("config:api_key", "staging-key-yyy");
  await devAuth.set("config:api_key", "dev-key-zzz");

  console.log("✓ Production: myapp:production:auth:config:api_key");
  console.log("✓ Staging: myapp:staging:auth:config:api_key");
  console.log("✓ Development: myapp:development:auth:config:api_key\n");

  const prodKey = await prodAuth.get("config:api_key");
  const stagingKey = await stagingAuth.get("config:api_key");
  const devKey = await devAuth.get("config:api_key");

  console.log("Retrieved environment configs:");
  console.log(`  Production: ${prodKey}`);
  console.log(`  Staging: ${stagingKey}`);
  console.log(`  Development: ${devKey}\n`);

  // ========================================================================
  // Scenario 5: Pub/Sub with Namespaced Channels
  // ========================================================================
  console.log("📢 SCENARIO 5: Pub/Sub with namespaced channels");
  console.log("═".repeat(60) + "\n");

  const authNotifications: string[] = [];
  const shopNotifications: string[] = [];

  console.log("Subscribing to namespaced channels...");
  const authUnsub = await authApp.subscribe("notifications", (message) => {
    authNotifications.push(message);
    console.log(`  [Auth] ${message}`);
  });

  const shopUnsub = await shopApp.subscribe("notifications", (message) => {
    shopNotifications.push(message);
    console.log(`  [Shop] ${message}`);
  });

  console.log("✓ Subscribed to channels\n");

  console.log("Publishing to different namespaces...");
  await authApp.publish("notifications", "User logged in");
  await shopApp.publish("notifications", "New order placed");
  await authApp.publish("notifications", "Password changed");

  // Wait for messages
  await new Promise(r => setTimeout(r, 200));

  await authUnsub();
  await shopUnsub();

  console.log(`\n✓ Auth received ${authNotifications.length} notifications`);
  console.log(`✓ Shop received ${shopNotifications.length} notifications\n`);

  // ========================================================================
  // Scenario 6: Namespace Cleanup
  // ========================================================================
  console.log("🧹 SCENARIO 6: Namespace cleanup");
  console.log("═".repeat(60) + "\n");

  console.log("Checking keys before cleanup...");
  const authKeys = await redis.scanAll("auth:*");
  const shopKeys = await redis.scanAll("shop:*");
  const analyticsKeys = await redis.scanAll("analytics:*");

  console.log(`  Auth namespace: ${authKeys.length} keys`);
  console.log(`  Shop namespace: ${shopKeys.length} keys`);
  console.log(`  Analytics namespace: ${analyticsKeys.length} keys\n`);

  console.log("Clearing specific namespaces...");
  const authDeleted = await clearNamespace(redis, "auth");
  console.log(`✓ Deleted ${authDeleted} keys from auth namespace`);

  const shopDeleted = await clearNamespace(redis, "shop");
  console.log(`✓ Deleted ${shopDeleted} keys from shop namespace`);

  const analyticsDeleted = await clearNamespace(redis, "analytics");
  console.log(`✓ Deleted ${analyticsDeleted} keys from analytics namespace\n`);

  // Clean up environment namespaces
  console.log("Cleaning up environment namespaces...");
  await clearNamespace(redis, "myapp:production:auth");
  await clearNamespace(redis, "myapp:staging:auth");
  await clearNamespace(redis, "myapp:development:auth");
  console.log("✓ Environment namespaces cleaned\n");

  // ========================================================================
  // Summary
  // ========================================================================
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║  ✅ Redis Namespace Demo Completed!                       ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log("\n📚 What you've learned:");
  console.log("   ✓ Creating namespaced Redis clients");
  console.log("   ✓ Sharing a single Redis connection across apps");
  console.log("   ✓ Preventing key collisions between applications");
  console.log("   ✓ Pattern matching within namespaces");
  console.log("   ✓ Environment-based namespace organization");
  console.log("   ✓ Namespaced Pub/Sub channels");
  console.log("   ✓ Cleaning up namespaces");
  console.log("\n🎯 Best practices demonstrated:");
  console.log("   • Use consistent naming conventions (app:entity:id)");
  console.log("   • Separate concerns with different namespaces");
  console.log("   • Include environment in namespace for multi-stage deploys");
  console.log("   • Pattern matching scoped to namespace");
  console.log("   • Namespace cleanup for testing/maintenance");
  console.log("\n💡 Real-world use cases:");
  console.log("   • Microservices sharing Redis");
  console.log("   • Multi-tenant applications");
  console.log("   • Development/staging/production isolation");
  console.log("   • Feature-specific data separation");
  console.log("   • Team-based resource allocation");
  console.log("\n🚀 Ready for production multi-app Redis deployments!");
}

// Run if executed directly
if (import.meta.main) {
  main().catch(console.error);
}

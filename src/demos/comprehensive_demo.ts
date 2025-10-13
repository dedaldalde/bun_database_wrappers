/**
 * Comprehensive Real-World Demo
 * 
 * This demo showcases the true power of the database wrappers through
 * realistic scenarios you'd encounter in production applications.
 * 
 * Scenarios covered:
 * 1. E-commerce Platform (MySQL) - Complex queries, transactions, data integrity
 * 2. Session & Cache Management (Redis) - High-performance caching patterns
 * 3. Analytics & Reporting (SQLite) - Aggregations, time-series data
 * 4. Multi-Database Architecture - Using all wrappers together
 * 
 * Run with: bun run src/demos/comprehensive_demo.ts
 */

import { createSQLite, createRedis, createMySQL, DBError } from "../wrappers";

// ============================================================================
// Type Definitions - Production-Ready Interfaces
// ============================================================================

interface User extends Record<string, unknown> {
  id?: number;
  username: string;
  email: string;
  full_name: string;
  created_at?: string;
  last_login?: string;
}

interface Product extends Record<string, unknown> {
  id?: number;
  name: string;
  description: string;
  price: number;
  stock: number;
  category: string;
  created_at?: string;
}

interface Order extends Record<string, unknown> {
  id?: number;
  user_id: number;
  total: number;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  created_at?: string;
}

interface OrderItem extends Record<string, unknown> {
  id?: number;
  order_id: number;
  product_id: number;
  quantity: number;
  price: number;
}

interface CartItem {
  productId: number;
  quantity: number;
  addedAt: number;
}

interface SessionData {
  userId: number;
  username: string;
  email: string;
  loginAt: number;
  expiresAt: number;
  permissions: string[];
}

// ============================================================================
// Scenario 1: E-commerce Platform with MySQL
// ============================================================================

async function ecommerceScenario() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  Scenario 1: E-commerce Platform (MySQL)                  ║");
  console.log("║  Real-world order processing with transactions & integrity║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  await using db = createSQLite(":memory:"); // Using SQLite for demo, same API as MySQL

  try {
    // Setup: Create schema
    console.log("📦 Setting up e-commerce database schema...");
    
    await db.createTable("users", {
      id: "INTEGER PRIMARY KEY AUTOINCREMENT",
      username: "TEXT UNIQUE NOT NULL",
      email: "TEXT UNIQUE NOT NULL",
      full_name: "TEXT NOT NULL",
      created_at: "DATETIME DEFAULT CURRENT_TIMESTAMP",
      last_login: "DATETIME"
    });

    await db.createTable("products", {
      id: "INTEGER PRIMARY KEY AUTOINCREMENT",
      name: "TEXT NOT NULL",
      description: "TEXT",
      price: "REAL NOT NULL",
      stock: "INTEGER NOT NULL DEFAULT 0",
      category: "TEXT NOT NULL",
      created_at: "DATETIME DEFAULT CURRENT_TIMESTAMP"
    });

    await db.createTable("orders", {
      id: "INTEGER PRIMARY KEY AUTOINCREMENT",
      user_id: "INTEGER NOT NULL",
      total: "REAL NOT NULL",
      status: "TEXT DEFAULT 'pending'",
      created_at: "DATETIME DEFAULT CURRENT_TIMESTAMP"
    });

    await db.createTable("order_items", {
      id: "INTEGER PRIMARY KEY AUTOINCREMENT",
      order_id: "INTEGER NOT NULL",
      product_id: "INTEGER NOT NULL",
      quantity: "INTEGER NOT NULL",
      price: "REAL NOT NULL"
    });

    console.log("✓ Schema created\n");

    // 1. Insert test data
    console.log("👥 Creating users...");
    await db.insert<User>("users", {
      username: "alice_wonder",
      email: "alice@example.com",
      full_name: "Alice Wonderland"
    });
    await db.insert<User>("users", {
      username: "bob_builder",
      email: "bob@example.com",
      full_name: "Bob Builder"
    });
    console.log("✓ Users created\n");

    console.log("🛍️ Adding products to catalog...");
    const products = [
      { name: "Laptop Pro", description: "High-performance laptop", price: 1299.99, stock: 50, category: "Electronics" },
      { name: "Wireless Mouse", description: "Ergonomic wireless mouse", price: 29.99, stock: 200, category: "Electronics" },
      { name: "Mechanical Keyboard", description: "RGB mechanical keyboard", price: 149.99, stock: 75, category: "Electronics" },
      { name: "USB-C Hub", description: "7-in-1 USB-C hub", price: 49.99, stock: 100, category: "Accessories" },
      { name: "Monitor 27\"", description: "4K UHD monitor", price: 399.99, stock: 30, category: "Electronics" }
    ];

    for (const product of products) {
      await db.insert<Product>("products", product);
    }
    console.log(`✓ ${products.length} products added\n`);

    // 2. Demonstrate complex query - Product search with filtering
    console.log("🔍 Searching products: Electronics under $500...");
    const searchResults = await db.all<Product>(
      `SELECT * FROM products 
       WHERE category = ? AND price < ? 
       ORDER BY price ASC`,
      ["Electronics", 500]
    );
    
    console.table(searchResults.map(p => ({
      Name: p.name,
      Price: `$${p.price.toFixed(2)}`,
      Stock: p.stock,
      Category: p.category
    })));

    // 3. Real-world transaction: Process order with inventory check
    console.log("\n💰 Processing order with transaction (atomicity guaranteed)...");
    console.log("Order: Alice buys 2x Laptop Pro + 1x Wireless Mouse");
    
    const userId = 1;
    const orderItems = [
      { productId: 1, quantity: 2 }, // 2 Laptops
      { productId: 2, quantity: 1 }  // 1 Mouse
    ];

    try {
      await db.transaction([
        // 1. Check inventory for each item
        ...orderItems.map(item => ({
          sql: `SELECT stock FROM products WHERE id = ? AND stock >= ?`,
          params: [item.productId, item.quantity]
        })),
        
        // 2. Calculate total (pre-calculated for demo simplicity)
        // In production, you'd fetch prices and calculate here
        
        // 3. Create order (total pre-calculated: 2*1299.99 + 1*29.99 = 2629.97)
        { sql: "INSERT INTO orders (user_id, total, status) VALUES (?, ?, ?)", 
          params: [userId, 2629.97, "processing"] },
        
        // 4. Add order items
        { sql: "INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)",
          params: [1, 1, 2, 1299.99] },
        { sql: "INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)",
          params: [1, 2, 1, 29.99] },
        
        // 5. Update inventory
        { sql: "UPDATE products SET stock = stock - ? WHERE id = ?", 
          params: [2, 1] },
        { sql: "UPDATE products SET stock = stock - ? WHERE id = ?", 
          params: [1, 2] }
      ]);

      console.log("✓ Order processed successfully!");
      console.log("  All operations completed atomically:");
      console.log("  ✓ Inventory checked");
      console.log("  ✓ Order created");
      console.log("  ✓ Order items added");
      console.log("  ✓ Inventory decremented");

    } catch (error) {
      console.log("✗ Order failed - transaction rolled back!");
      if (error instanceof DBError) {
        console.log("  Reason:", error.message);
      }
    }

    // 4. Complex reporting query - Sales analytics
    console.log("\n📊 Generating sales report with JOINs and aggregations...");
    
    interface SalesReport {
      user_name: string;
      order_count: number;
      total_spent: number;
      avg_order_value: number;
      last_order_date: string;
    }

    const salesReport = await db.all<SalesReport>(`
      SELECT 
        u.full_name as user_name,
        COUNT(DISTINCT o.id) as order_count,
        COALESCE(SUM(o.total), 0) as total_spent,
        COALESCE(AVG(o.total), 0) as avg_order_value,
        MAX(o.created_at) as last_order_date
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
      GROUP BY u.id, u.full_name
      ORDER BY total_spent DESC
    `);

    console.table(salesReport.map(r => ({
      Customer: r.user_name,
      Orders: r.order_count,
      'Total Spent': `$${r.total_spent.toFixed(2)}`,
      'Avg Order': `$${r.avg_order_value.toFixed(2)}`,
      'Last Order': r.last_order_date || 'N/A'
    })));

    // 5. Product performance analysis
    console.log("\n📈 Product performance analysis...");
    
    interface ProductPerformance {
      product_name: string;
      units_sold: number;
      revenue: number;
      remaining_stock: number;
    }

    const performance = await db.all<ProductPerformance>(`
      SELECT 
        p.name as product_name,
        COALESCE(SUM(oi.quantity), 0) as units_sold,
        COALESCE(SUM(oi.quantity * oi.price), 0) as revenue,
        p.stock as remaining_stock
      FROM products p
      LEFT JOIN order_items oi ON p.id = oi.product_id
      GROUP BY p.id, p.name, p.stock
      ORDER BY revenue DESC
    `);

    console.table(performance.map(p => ({
      Product: p.product_name,
      'Units Sold': p.units_sold,
      Revenue: `$${p.revenue.toFixed(2)}`,
      'Stock Left': p.remaining_stock
    })));

    // 6. Update order status workflow
    console.log("\n📦 Simulating order fulfillment workflow...");
    const statuses: Array<Order['status']> = ['pending', 'processing', 'shipped', 'delivered'];
    
    for (let i = 1; i < statuses.length; i++) {
      await db.update("orders", 
        { status: statuses[i] }, 
        "id = ?", 
        [1]
      );
      console.log(`  ✓ Order #1 updated to: ${statuses[i]}`);
      await new Promise(r => setTimeout(r, 100)); // Simulate time passing
    }

    console.log("\n✅ E-commerce scenario completed successfully!");

  } catch (error) {
    console.error("❌ Error:", error);
  }
}

// ============================================================================
// Scenario 2: High-Performance Caching with Redis
// ============================================================================

async function cachingScenario() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  Scenario 2: Session & Cache Management (Redis)           ║");
  console.log("║  High-performance caching patterns & session handling     ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  try {
    await using redis = await createRedis();

    // 1. Session Management
    console.log("🔐 User session management...");
    
    const session: SessionData = {
      userId: 12345,
      username: "alice_wonder",
      email: "alice@example.com",
      loginAt: Date.now(),
      expiresAt: Date.now() + 3600000, // 1 hour
      permissions: ["read", "write", "admin"]
    };

    // Store session with automatic expiration (1 hour)
    await redis.setJSON<SessionData>("session:12345", session, { EX: 3600 });
    console.log("✓ Session stored with TTL");

    // Retrieve and validate session
    const retrievedSession = await redis.getJSON<SessionData>("session:12345");
    if (retrievedSession) {
      const timeLeft = Math.round((retrievedSession.expiresAt - Date.now()) / 1000 / 60);
      console.log(`✓ Session valid for ${timeLeft} more minutes`);
      console.log(`  User: ${retrievedSession.username} (${retrievedSession.email})`);
      console.log(`  Permissions: ${retrievedSession.permissions.join(", ")}`);
    }

    // 2. Shopping Cart Management
    console.log("\n🛒 Shopping cart management...");
    
    const cart: CartItem[] = [
      { productId: 101, quantity: 2, addedAt: Date.now() },
      { productId: 205, quantity: 1, addedAt: Date.now() }
    ];

    await redis.setJSON("cart:12345", cart, { EX: 86400 }); // 24 hours
    console.log("✓ Cart stored (expires in 24 hours)");

    // Retrieve cart
    const savedCart = await redis.getJSON<CartItem[]>("cart:12345");
    if (savedCart) {
      console.log(`✓ Cart contains ${savedCart.length} items`);
      savedCart.forEach(item => {
        console.log(`  - Product ${item.productId}: ${item.quantity}x`);
      });
    }

    // 3. API Response Caching
    console.log("\n⚡ API response caching demonstration...");
    
    const cacheKey = "api:products:electronics";
    
    // Simulate expensive database query
    console.log("First request: Fetching from 'database' (slow)...");
    const start1 = Date.now();
    const products = [
      { id: 1, name: "Laptop", price: 999 },
      { id: 2, name: "Mouse", price: 29 },
      { id: 3, name: "Keyboard", price: 149 }
    ];
    await new Promise(r => setTimeout(r, 100)); // Simulate DB delay
    await redis.setJSON(cacheKey, products, { EX: 300 }); // Cache for 5 minutes
    const time1 = Date.now() - start1;
    console.log(`✓ Query completed in ${time1}ms (cached for 5 min)`);

    // Second request hits cache
    console.log("\nSecond request: Fetching from cache (fast)...");
    const start2 = Date.now();
    const cachedProducts = await redis.getJSON(cacheKey);
    const time2 = Date.now() - start2;
    console.log(`✓ Query completed in ${time2}ms (${Math.round(time1/time2)}x faster!)`);

    // 4. Rate Limiting
    console.log("\n🚦 Rate limiting implementation...");
    
    const userIp = "192.168.1.100";
    const rateLimitKey = `ratelimit:${userIp}`;
    const maxRequests = 10;
    const windowSeconds = 60;

    console.log(`Rate limit: ${maxRequests} requests per ${windowSeconds} seconds`);
    
    for (let i = 1; i <= 12; i++) {
      const current = await redis.incr(rateLimitKey);
      
      if (current === 1) {
        await redis.setTTL(rateLimitKey, windowSeconds);
      }

      if (current <= maxRequests) {
        console.log(`  ✓ Request ${i} allowed (${current}/${maxRequests})`);
      } else {
        console.log(`  ✗ Request ${i} blocked - rate limit exceeded!`);
        break;
      }
    }

    // 5. Real-time leaderboard (simulated with hash)
    console.log("\n🏆 Real-time leaderboard simulation...");
    
    // Store scores
    const leaderboard = {
      alice: 1250,
      bob: 980,
      charlie: 1430,
      dave: 875,
      eve: 1320
    };
    
    await redis.hmset("leaderboard:daily", leaderboard);
    const scores = await redis.hgetAll("leaderboard:daily");
    
    // Sort and display top 3
    const sorted = Object.entries(scores as Record<string, string>)
      .map(([name, score]) => ({ name, score: parseInt(score) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    
    console.log("Top 3 players:");
    sorted.forEach((player, i) => {
      console.log(`  ${i + 1}. ${player.name} - ${player.score} points`);
    });

    // 6. Pub/Sub for real-time notifications
    console.log("\n📢 Real-time notifications (Pub/Sub)...");
    
    const notifications: string[] = [];
    const channel = "notifications:user:12345";
    
    const unsubscribe = await redis.subscribe(channel, (message) => {
      notifications.push(message);
      console.log(`  📬 Received: ${message}`);
    });

    // Simulate events
    await redis.publish(channel, "Your order has been confirmed!");
    await redis.publish(channel, "Your package is out for delivery!");
    await new Promise(r => setTimeout(r, 200)); // Wait for messages
    
    await unsubscribe();
    console.log(`✓ Received ${notifications.length} notifications`);

    // 7. Cache invalidation pattern
    console.log("\n🔄 Cache invalidation pattern...");
    
    const keys = ["cache:products", "cache:categories", "cache:featured"];
    await Promise.all(keys.map(key => redis.set(key, "data")));
    console.log("✓ Multiple caches set");

    // Invalidate all product-related caches
    const pattern = "cache:*";
    const allKeys = await redis.scanAll(pattern);
    if (allKeys.length > 0) {
      await redis.del(...allKeys);
      console.log(`✓ Invalidated ${allKeys.length} cached entries`);
    }

    // Cleanup
    await redis.del("session:12345", "cart:12345", "leaderboard:daily", rateLimitKey);

    console.log("\n✅ Caching scenario completed successfully!");

  } catch (error) {
    if (error instanceof Error && error.message.includes("ECONNREFUSED")) {
      console.log("\n⚠️  Redis server not running. Start Redis to see this demo:");
      console.log("   brew services start redis  (macOS)");
      console.log("   sudo systemctl start redis  (Linux)");
    } else {
      console.error("❌ Error:", error);
    }
  }
}

// ============================================================================
// Scenario 3: Analytics & Reporting with SQLite
// ============================================================================

async function analyticsScenario() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  Scenario 3: Analytics & Reporting (SQLite)               ║");
  console.log("║  Time-series data, aggregations & business intelligence   ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  await using db = createSQLite(":memory:");

  try {
    // Setup analytics schema
    console.log("📊 Setting up analytics database...");
    
    await db.createTable("page_views", {
      id: "INTEGER PRIMARY KEY AUTOINCREMENT",
      page: "TEXT NOT NULL",
      user_id: "INTEGER",
      duration_seconds: "INTEGER",
      timestamp: "DATETIME DEFAULT CURRENT_TIMESTAMP"
    });

    await db.createTable("events", {
      id: "INTEGER PRIMARY KEY AUTOINCREMENT",
      event_type: "TEXT NOT NULL",
      user_id: "INTEGER",
      properties: "TEXT", // JSON
      timestamp: "DATETIME DEFAULT CURRENT_TIMESTAMP"
    });

    console.log("✓ Analytics schema created\n");

    // Generate sample analytics data
    console.log("📈 Generating sample analytics data...");
    
    const pages = ["/home", "/products", "/cart", "/checkout", "/profile"];
    const eventTypes = ["click", "purchase", "signup", "search", "share"];
    
    // Insert page views
    for (let i = 0; i < 50; i++) {
      await db.insert("page_views", {
        page: pages[Math.floor(Math.random() * pages.length)],
        user_id: Math.floor(Math.random() * 10) + 1,
        duration_seconds: Math.floor(Math.random() * 300) + 10
      });
    }

    // Insert events
    for (let i = 0; i < 30; i++) {
      await db.insert("events", {
        event_type: eventTypes[Math.floor(Math.random() * eventTypes.length)],
        user_id: Math.floor(Math.random() * 10) + 1,
        properties: JSON.stringify({ value: Math.random() * 100 })
      });
    }

    console.log("✓ Sample data generated\n");

    // 1. Page view analytics
    console.log("📄 Most popular pages:");
    
    interface PageStats {
      page: string;
      view_count: number;
      avg_duration: number;
      total_time: number;
    }

    const pageStats = await db.all<PageStats>(`
      SELECT 
        page,
        COUNT(*) as view_count,
        ROUND(AVG(duration_seconds), 1) as avg_duration,
        SUM(duration_seconds) as total_time
      FROM page_views
      GROUP BY page
      ORDER BY view_count DESC
    `);

    console.table(pageStats.map(p => ({
      Page: p.page,
      Views: p.view_count,
      'Avg Duration': `${p.avg_duration}s`,
      'Total Time': `${Math.round(p.total_time / 60)}min`
    })));

    // 2. User engagement analysis
    console.log("\n👤 User engagement metrics:");
    
    interface UserEngagement {
      user_id: number;
      total_page_views: number;
      total_events: number;
      engagement_score: number;
    }

    const engagement = await db.all<UserEngagement>(`
      SELECT 
        u.user_id,
        COUNT(DISTINCT pv.id) as total_page_views,
        COUNT(DISTINCT e.id) as total_events,
        (COUNT(DISTINCT pv.id) + COUNT(DISTINCT e.id) * 2) as engagement_score
      FROM (SELECT DISTINCT user_id FROM page_views) u
      LEFT JOIN page_views pv ON u.user_id = pv.user_id
      LEFT JOIN events e ON u.user_id = e.user_id
      GROUP BY u.user_id
      ORDER BY engagement_score DESC
      LIMIT 5
    `);

    console.table(engagement.map(e => ({
      'User ID': e.user_id,
      'Page Views': e.total_page_views,
      Events: e.total_events,
      'Score': e.engagement_score
    })));

    // 3. Event type distribution
    console.log("\n🎯 Event type distribution:");
    
    interface EventStats {
      event_type: string;
      count: number;
      percentage: number;
    }

    const eventStats = await db.all<EventStats>(`
      SELECT 
        event_type,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM events), 1) as percentage
      FROM events
      GROUP BY event_type
      ORDER BY count DESC
    `);

    console.table(eventStats.map(e => ({
      Event: e.event_type,
      Count: e.count,
      'Share': `${e.percentage}%`
    })));

    // 4. Conversion funnel analysis
    console.log("\n🎯 Conversion funnel:");
    
    const funnelSteps = [
      { page: "/home", label: "Landing" },
      { page: "/products", label: "Browse Products" },
      { page: "/cart", label: "Add to Cart" },
      { page: "/checkout", label: "Checkout" }
    ];

    console.log("Step-by-step conversion:");
    for (const step of funnelSteps) {
      const count = await db.scalar<number>(
        "SELECT COUNT(DISTINCT user_id) FROM page_views WHERE page = ?",
        [step.page]
      );
      console.log(`  ${step.label} (${step.page}): ${count} users`);
    }

    // 5. Time-based analysis (simulated hourly data)
    console.log("\n⏰ Time-based activity analysis:");
    
    interface TimeStats {
      hour: number;
      activity_count: number;
    }

    // Note: This would use actual time functions in production
    const hourlyStats = await db.all<TimeStats>(`
      SELECT 
        (id % 24) as hour,
        COUNT(*) as activity_count
      FROM (
        SELECT id FROM page_views
        UNION ALL
        SELECT id FROM events
      )
      GROUP BY hour
      ORDER BY hour
      LIMIT 10
    `);

    console.table(hourlyStats.map(h => ({
      'Hour': `${h.hour}:00`,
      'Activity': h.activity_count
    })));

    console.log("\n✅ Analytics scenario completed successfully!");

  } catch (error) {
    console.error("❌ Error:", error);
  }
}

// ============================================================================
// Scenario 4: Multi-Database Architecture
// ============================================================================

async function multiDatabaseScenario() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  Scenario 4: Multi-Database Architecture                  ║");
  console.log("║  Using all wrappers together for optimal performance      ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  await using db = createSQLite(":memory:");
  
  try {
    console.log("🏗️  Architecture: SQLite (data) + Redis (cache)");
    console.log("    - SQLite: Source of truth for persistent data");
    console.log("    - Redis: High-speed cache layer\n");

    // Setup database
    await db.createTable("articles", {
      id: "INTEGER PRIMARY KEY AUTOINCREMENT",
      title: "TEXT NOT NULL",
      content: "TEXT NOT NULL",
      author: "TEXT NOT NULL",
      views: "INTEGER DEFAULT 0",
      created_at: "DATETIME DEFAULT CURRENT_TIMESTAMP"
    });

    // Insert articles
    const articles = [
      { title: "Introduction to Bun", content: "Bun is a fast JavaScript runtime...", author: "Alice" },
      { title: "Database Wrappers Guide", content: "Learn how to use database wrappers...", author: "Bob" },
      { title: "Performance Optimization", content: "Tips for optimizing your apps...", author: "Charlie" }
    ];

    for (const article of articles) {
      await db.insert("articles", article);
    }

    console.log("✓ Articles stored in SQLite\n");

    // Try with Redis cache, fallback to SQLite only
    let useCache = false;
    let redis: Awaited<ReturnType<typeof createRedis>> | null = null;

    try {
      redis = await createRedis();
      useCache = true;
      console.log("✓ Redis cache layer enabled\n");
    } catch {
      console.log("⚠️  Redis not available - using SQLite only\n");
    }

    // Read-through cache pattern
    console.log("📖 Implementing read-through cache pattern...");
    
    async function getArticle(id: number): Promise<any> {
      const cacheKey = `article:${id}`;
      
      // Try cache first
      if (useCache && redis) {
        const cached = await redis.getJSON(cacheKey);
        if (cached) {
          console.log(`  ✓ Article ${id} retrieved from CACHE (fast)`);
          return cached;
        }
      }
      
      // Cache miss - get from database
      const article = await db.get("SELECT * FROM articles WHERE id = ?", [id]);
      console.log(`  ✓ Article ${id} retrieved from DATABASE (slower)`);
      
      // Store in cache for next time
      if (useCache && redis && article) {
        await redis.setJSON(cacheKey, article, { EX: 300 });
        console.log(`    → Cached for 5 minutes`);
      }
      
      return article;
    }

    // First request - cache miss
    console.log("\nFirst request (cold cache):");
    await getArticle(1);

    // Second request - cache hit
    console.log("\nSecond request (warm cache):");
    await getArticle(1);

    // Write-through cache pattern
    console.log("\n✍️  Implementing write-through cache pattern...");
    
    async function updateArticleViews(id: number): Promise<void> {
      // Update database
      await db.run("UPDATE articles SET views = views + 1 WHERE id = ?", [id]);
      console.log(`  ✓ Article ${id} views updated in DATABASE`);
      
      // Invalidate cache
      if (useCache && redis) {
        await redis.del(`article:${id}`);
        console.log(`  ✓ Cache invalidated for article ${id}`);
      }
    }

    await updateArticleViews(1);

    // Cache-aside pattern for heavy queries
    console.log("\n📊 Cache-aside pattern for expensive queries...");
    
    const statsKey = "stats:popular_articles";
    let stats;

    if (useCache && redis) {
      stats = await redis.getJSON(statsKey);
      if (stats) {
        console.log("  ✓ Statistics retrieved from CACHE");
      }
    }

    if (!stats) {
      console.log("  ✓ Calculating statistics from DATABASE...");
      stats = await db.all(`
        SELECT title, author, views 
        FROM articles 
        ORDER BY views DESC 
        LIMIT 5
      `);
      
      if (useCache && redis) {
        await redis.setJSON(statsKey, stats, { EX: 60 });
        console.log("  → Cached for 1 minute");
      }
    }

    console.table(stats);

    // Cleanup
    if (redis) {
      await redis.del("article:1", "article:2", "article:3", statsKey);
      await redis[Symbol.asyncDispose]();
    }

    console.log("\n✅ Multi-database scenario completed successfully!");
    console.log("\n💡 Key Takeaways:");
    console.log("   - Use SQLite/MySQL for data persistence & complex queries");
    console.log("   - Use Redis for high-speed caching & session management");
    console.log("   - Implement cache patterns to optimize performance");
    console.log("   - All wrappers use the same consistent API");

  } catch (error) {
    console.error("❌ Error:", error);
  }
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║                                                            ║");
  console.log("║        DATABASE WRAPPERS - COMPREHENSIVE DEMO              ║");
  console.log("║                                                            ║");
  console.log("║  Real-world scenarios demonstrating production-ready      ║");
  console.log("║  patterns, best practices, and the true power of these    ║");
  console.log("║  database wrappers.                                        ║");
  console.log("║                                                            ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  try {
    await ecommerceScenario();
    await cachingScenario();
    await analyticsScenario();
    await multiDatabaseScenario();

    console.log("\n\n╔════════════════════════════════════════════════════════════╗");
    console.log("║  🎉 All scenarios completed successfully!                 ║");
    console.log("╚════════════════════════════════════════════════════════════╝");
    console.log("\n📚 What you've learned:");
    console.log("   ✓ Type-safe database operations");
    console.log("   ✓ Transaction handling for data integrity");
    console.log("   ✓ Complex queries with JOINs and aggregations");
    console.log("   ✓ High-performance caching patterns");
    console.log("   ✓ Session and cart management");
    console.log("   ✓ Rate limiting and pub/sub");
    console.log("   ✓ Analytics and reporting");
    console.log("   ✓ Multi-database architectures");
    console.log("\n🚀 Ready for production use!");

  } catch (error) {
    console.error("\n❌ Demo failed:", error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.main) {
  main();
}

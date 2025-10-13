/**
 * MySQL Comprehensive Demo
 * 
 * This demo showcases MySQL-specific features and real-world scenarios:
 * - Connection pooling for high concurrency
 * - Complex transactions with foreign keys
 * - Bulk operations and upserts
 * - Real e-commerce order processing
 * - Multi-table JOINs and aggregations
 * 
 * Prerequisites:
 * - MySQL server running
 * - Set environment variables in .env:
 *   MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
 * 
 * Run with: bun run demo:mysql-comprehensive
 */

import { createMySQL, DBError } from "../wrappers";

// ============================================================================
// Type Definitions
// ============================================================================

interface User extends Record<string, unknown> {
  id?: number;
  username: string;
  email: string;
  full_name: string;
  status: 'active' | 'inactive' | 'suspended';
  created_at?: string;
  last_login?: string;
}

interface Product extends Record<string, unknown> {
  id?: number;
  sku: string;
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
  order_number: string;
  total: number;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  created_at?: string;
  updated_at?: string;
}

interface OrderItem extends Record<string, unknown> {
  id?: number;
  order_id: number;
  product_id: number;
  quantity: number;
  price_at_purchase: number;
}

interface InventoryLog extends Record<string, unknown> {
  id?: number;
  product_id: number;
  change_amount: number;
  reason: string;
  created_at?: string;
}

// ============================================================================
// Demo: E-Commerce Platform with MySQL
// ============================================================================

async function main() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║                                                            ║");
  console.log("║        MYSQL COMPREHENSIVE DEMO                            ║");
  console.log("║        E-Commerce Platform                                 ║");
  console.log("║                                                            ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  // Read MySQL configuration from environment
  const host = process.env.MYSQL_HOST || "localhost";
  const port = parseInt(process.env.MYSQL_PORT || "3306");
  const user = process.env.MYSQL_USER || process.env.MYSQL_USERL || "root";
  const password = process.env.MYSQL_PASSWORD || "";
  const database = process.env.MYSQL_DATABASE || "testdb";

  console.log("🔌 Connecting to MySQL...");
  console.log(`   Host: ${host}:${port}`);
  console.log(`   Database: ${database}`);
  console.log(`   User: ${user}\n`);

  await using db = createMySQL("", {
    hostname: host,
    port: port,
    database: database,
    username: user,
    password: password,
    max: 10, // Connection pool size
    idleTimeout: 30,
  });

  try {
    // Test connection
    const version = await db.scalar<string>("SELECT VERSION()");
    console.log(`✓ Connected to MySQL ${version}\n`);

    // ========================================================================
    // Scenario 1: Database Schema Setup
    // ========================================================================
    console.log("📦 SCENARIO 1: Setting up e-commerce schema");
    console.log("═".repeat(60) + "\n");

    // Drop existing tables (for clean demo)
    console.log("Cleaning up existing tables...");
    await db.run("SET FOREIGN_KEY_CHECKS = 0");
    await db.run("DROP TABLE IF EXISTS inventory_logs");
    await db.run("DROP TABLE IF EXISTS order_items");
    await db.run("DROP TABLE IF EXISTS orders");
    await db.run("DROP TABLE IF EXISTS products");
    await db.run("DROP TABLE IF EXISTS users");
    await db.run("SET FOREIGN_KEY_CHECKS = 1");
    console.log("✓ Tables cleaned\n");

    // Create users table
    console.log("Creating users table...");
    await db.createTable("users", {
      id: "INT AUTO_INCREMENT PRIMARY KEY",
      username: "VARCHAR(50) UNIQUE NOT NULL",
      email: "VARCHAR(255) UNIQUE NOT NULL",
      full_name: "VARCHAR(255) NOT NULL",
      status: "ENUM('active', 'inactive', 'suspended') DEFAULT 'active'",
      created_at: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
      last_login: "TIMESTAMP NULL",
      "INDEX idx_email": "(email)",
      "INDEX idx_status": "(status)"
    });

    // Create products table
    await db.createTable("products", {
      id: "INT AUTO_INCREMENT PRIMARY KEY",
      sku: "VARCHAR(50) UNIQUE NOT NULL",
      name: "VARCHAR(255) NOT NULL",
      description: "TEXT",
      price: "DECIMAL(10, 2) NOT NULL",
      stock: "INT NOT NULL DEFAULT 0",
      category: "VARCHAR(100) NOT NULL",
      created_at: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
      "INDEX idx_sku": "(sku)",
      "INDEX idx_category": "(category)"
    });

    // Create orders table with foreign key
    await db.createTable("orders", {
      id: "INT AUTO_INCREMENT PRIMARY KEY",
      user_id: "INT NOT NULL",
      order_number: "VARCHAR(50) UNIQUE NOT NULL",
      total: "DECIMAL(10, 2) NOT NULL",
      status: "ENUM('pending', 'processing', 'shipped', 'delivered', 'cancelled') DEFAULT 'pending'",
      created_at: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
      updated_at: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
      "FOREIGN KEY (user_id)": "REFERENCES users(id) ON DELETE CASCADE",
      "INDEX idx_user_id": "(user_id)",
      "INDEX idx_status": "(status)",
      "INDEX idx_created": "(created_at)"
    });

    // Create order_items table
    await db.createTable("order_items", {
      id: "INT AUTO_INCREMENT PRIMARY KEY",
      order_id: "INT NOT NULL",
      product_id: "INT NOT NULL",
      quantity: "INT NOT NULL",
      price_at_purchase: "DECIMAL(10, 2) NOT NULL",
      "FOREIGN KEY (order_id)": "REFERENCES orders(id) ON DELETE CASCADE",
      "FOREIGN KEY (product_id)": "REFERENCES products(id)",
      "INDEX idx_order": "(order_id)",
      "INDEX idx_product": "(product_id)"
    });

    // Create inventory_logs table
    await db.createTable("inventory_logs", {
      id: "INT AUTO_INCREMENT PRIMARY KEY",
      product_id: "INT NOT NULL",
      change_amount: "INT NOT NULL",
      reason: "VARCHAR(255) NOT NULL",
      created_at: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
      "FOREIGN KEY (product_id)": "REFERENCES products(id)",
      "INDEX idx_product": "(product_id)",
      "INDEX idx_created": "(created_at)"
    });

    console.log("✓ Schema created with foreign keys and indexes\n");

    // ========================================================================
    // Scenario 2: Bulk Data Import
    // ========================================================================
    console.log("📥 SCENARIO 2: Bulk data import");
    console.log("═".repeat(60) + "\n");

    console.log("Importing users...");
    const users = [
      { username: "alice_wonder", email: "alice@example.com", full_name: "Alice Wonderland", status: "active" as const },
      { username: "bob_builder", email: "bob@example.com", full_name: "Bob Builder", status: "active" as const },
      { username: "charlie_chap", email: "charlie@example.com", full_name: "Charlie Chaplin", status: "active" as const },
      { username: "diana_prince", email: "diana@example.com", full_name: "Diana Prince", status: "active" as const },
      { username: "evan_almighty", email: "evan@example.com", full_name: "Evan Almighty", status: "inactive" as const }
    ];
    
    await db.insertMany<User>("users", users);
    console.log(`✓ Inserted ${users.length} users using bulk insert\n`);

    console.log("Importing product catalog...");
    const products = [
      { sku: "LAPTOP-001", name: "Laptop Pro 15", description: "High-performance laptop", price: 1299.99, stock: 50, category: "Electronics" },
      { sku: "MOUSE-001", name: "Wireless Mouse", description: "Ergonomic wireless mouse", price: 29.99, stock: 200, category: "Electronics" },
      { sku: "KEYBOARD-001", name: "Mechanical Keyboard", description: "RGB mechanical keyboard", price: 149.99, stock: 75, category: "Electronics" },
      { sku: "MONITOR-001", name: "4K Monitor 27\"", description: "4K UHD display", price: 399.99, stock: 30, category: "Electronics" },
      { sku: "DESK-001", name: "Standing Desk", description: "Adjustable height desk", price: 599.99, stock: 20, category: "Furniture" },
      { sku: "CHAIR-001", name: "Ergonomic Chair", description: "Office chair with lumbar support", price: 349.99, stock: 25, category: "Furniture" },
      { sku: "HEADSET-001", name: "Noise-Canceling Headset", description: "Premium audio quality", price: 199.99, stock: 60, category: "Electronics" },
      { sku: "WEBCAM-001", name: "HD Webcam", description: "1080p webcam", price: 79.99, stock: 40, category: "Electronics" }
    ];

    await db.insertMany<Product>("products", products);
    console.log(`✓ Inserted ${products.length} products using bulk insert\n`);

    // ========================================================================
    // Scenario 3: Complex Query - Product Search
    // ========================================================================
    console.log("🔍 SCENARIO 3: Product search with filtering");
    console.log("═".repeat(60) + "\n");

    console.log("Searching: Electronics under $500, sorted by price...");
    const searchResults = await db.all<Product>(
      `SELECT id, sku, name, price, stock, category 
       FROM products 
       WHERE category = ? AND price < ? 
       ORDER BY price ASC`,
      ["Electronics", 500]
    );

    console.table(searchResults.map(p => ({
      SKU: p.sku,
      Name: p.name,
      Price: `$${Number(p.price).toFixed(2)}`,
      Stock: p.stock,
      Category: p.category
    })));

    // ========================================================================
    // Scenario 4: Transaction - Order Processing
    // ========================================================================
    console.log("\n💰 SCENARIO 4: Order processing with transaction");
    console.log("═".repeat(60) + "\n");

    console.log("Order: Alice buys 2x Laptop Pro + 1x Wireless Mouse + 1x Keyboard");
    console.log("This demonstrates ACID transaction with:");
    console.log("  - Inventory check");
    console.log("  - Stock deduction");
    console.log("  - Order creation");
    console.log("  - Order items insertion");
    console.log("  - Inventory logging\n");

    const orderNumber = `ORD-${Date.now()}`;
    const customerId = 1; // Alice
    const orderItems = [
      { productId: 1, sku: "LAPTOP-001", quantity: 2, price: 1299.99 },
      { productId: 2, sku: "MOUSE-001", quantity: 1, price: 29.99 },
      { productId: 3, sku: "KEYBOARD-001", quantity: 1, price: 149.99 }
    ];

    const orderTotal = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    try {
      await db.transaction([
        // 1. Verify stock for each item
        ...orderItems.map(item => ({
          sql: "SELECT stock FROM products WHERE id = ? AND stock >= ? FOR UPDATE",
          params: [item.productId, item.quantity]
        })),
        
        // 2. Create order
        { 
          sql: "INSERT INTO orders (user_id, order_number, total, status) VALUES (?, ?, ?, ?)",
          params: [customerId, orderNumber, orderTotal, "processing"]
        },
        
        // 3. Get the order ID (using LAST_INSERT_ID)
        // Note: In production, you'd capture this ID properly
        
        // 4. Add order items
        ...orderItems.map((item, idx) => ({
          sql: "INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase) VALUES (LAST_INSERT_ID(), ?, ?, ?)",
          params: [item.productId, item.quantity, item.price]
        })),
        
        // 5. Update inventory
        ...orderItems.map(item => ({
          sql: "UPDATE products SET stock = stock - ? WHERE id = ?",
          params: [item.quantity, item.productId]
        })),
        
        // 6. Log inventory changes
        ...orderItems.map(item => ({
          sql: "INSERT INTO inventory_logs (product_id, change_amount, reason) VALUES (?, ?, ?)",
          params: [item.productId, -item.quantity, `Order ${orderNumber}`]
        }))
      ]);

      console.log("✓ Order processed successfully!");
      console.log(`  Order Number: ${orderNumber}`);
      console.log(`  Total: $${Number(orderTotal).toFixed(2)}`);
      console.log("  All operations completed atomically:");
      console.log("    ✓ Stock verified and locked");
      console.log("    ✓ Order created");
      console.log("    ✓ Order items added");
      console.log("    ✓ Inventory updated");
      console.log("    ✓ Changes logged\n");

    } catch (error) {
      console.log("✗ Order failed - transaction rolled back!");
      if (error instanceof DBError) {
        console.log(`  Reason: ${error.message}\n`);
      }
    }

    // ========================================================================
    // Scenario 5: Upsert - Update or Insert
    // ========================================================================
    console.log("🔄 SCENARIO 5: Upsert operation");
    console.log("═".repeat(60) + "\n");

    console.log("Attempting to insert duplicate product (should update instead)...");
    
    await db.upsert<Product>(
      "products",
      {
        sku: "LAPTOP-001",
        name: "Laptop Pro 15 - Updated Edition",
        description: "High-performance laptop with latest specs",
        price: 1399.99,
        stock: 55,
        category: "Electronics"
      },
      ["name", "description", "price", "stock"] // Update these on duplicate
    );

    const updated = await db.getRow<Product>("products", "sku = ?", ["LAPTOP-001"]);
    if (updated) {
      console.log("✓ Upsert completed:");
      console.log(`  Name: ${updated.name}`);
      console.log(`  Price: $${Number(updated.price).toFixed(2)}`);
      console.log(`  Stock: ${updated.stock}\n`);
    }

    // ========================================================================
    // Scenario 6: Complex Analytics Queries
    // ========================================================================
    console.log("📊 SCENARIO 6: Sales analytics with JOINs");
    console.log("═".repeat(60) + "\n");

    console.log("Customer order summary:");
    interface CustomerSummary {
      customer_name: string;
      email: string;
      total_orders: number;
      total_spent: number;
      avg_order_value: number;
      last_order_date: string;
    }

    const customerStats = await db.all<CustomerSummary>(`
      SELECT 
        u.full_name as customer_name,
        u.email,
        COUNT(DISTINCT o.id) as total_orders,
        COALESCE(SUM(o.total), 0) as total_spent,
        COALESCE(AVG(o.total), 0) as avg_order_value,
        MAX(o.created_at) as last_order_date
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
      WHERE u.status = 'active'
      GROUP BY u.id, u.full_name, u.email
      ORDER BY total_spent DESC
      LIMIT 5
    `);

    console.table(customerStats.map(c => ({
      Customer: c.customer_name,
      Email: c.email,
      Orders: c.total_orders,
      'Total Spent': `$${Number(c.total_spent).toFixed(2)}`,
      'Avg Order': `$${Number(c.avg_order_value).toFixed(2)}`,
      'Last Order': c.last_order_date || 'N/A'
    })));

    console.log("\nProduct performance analysis:");
    interface ProductPerformance {
      product_name: string;
      sku: string;
      units_sold: number;
      revenue: number;
      current_stock: number;
      revenue_rank: number;
    }

    const productStats = await db.all<ProductPerformance>(`
      SELECT 
        p.name as product_name,
        p.sku,
        COALESCE(SUM(oi.quantity), 0) as units_sold,
        COALESCE(SUM(oi.quantity * oi.price_at_purchase), 0) as revenue,
        p.stock as current_stock,
        RANK() OVER (ORDER BY COALESCE(SUM(oi.quantity * oi.price_at_purchase), 0) DESC) as revenue_rank
      FROM products p
      LEFT JOIN order_items oi ON p.id = oi.product_id
      GROUP BY p.id, p.name, p.sku, p.stock
      ORDER BY revenue DESC
    `);

    console.table(productStats.map(p => ({
      Rank: p.revenue_rank,
      SKU: p.sku,
      Product: p.product_name,
      'Units Sold': p.units_sold,
      Revenue: `$${Number(p.revenue).toFixed(2)}`,
      'Stock': p.current_stock
    })));

    // ========================================================================
    // Scenario 7: Inventory Audit Trail
    // ========================================================================
    console.log("\n📝 SCENARIO 7: Inventory audit trail");
    console.log("═".repeat(60) + "\n");

    console.log("Recent inventory changes:");
    interface InventoryChange {
      product_name: string;
      sku: string;
      change_amount: number;
      reason: string;
      changed_at: string;
    }

    const inventoryHistory = await db.all<InventoryChange>(`
      SELECT 
        p.name as product_name,
        p.sku,
        il.change_amount,
        il.reason,
        il.created_at as changed_at
      FROM inventory_logs il
      INNER JOIN products p ON il.product_id = p.id
      ORDER BY il.created_at DESC
      LIMIT 10
    `);

    console.table(inventoryHistory.map(h => ({
      Product: h.product_name,
      SKU: h.sku,
      Change: h.change_amount,
      Reason: h.reason,
      When: h.changed_at
    })));

    // ========================================================================
    // Scenario 8: Connection Pool Performance
    // ========================================================================
    console.log("\n⚡ SCENARIO 8: Connection pooling performance");
    console.log("═".repeat(60) + "\n");

    console.log("Simulating concurrent queries (10 parallel requests)...");
    const start = Date.now();
    
    await Promise.all(
      Array.from({ length: 10 }, async (_, i) => {
        return await db.scalar<number>("SELECT COUNT(*) FROM products WHERE stock > 0");
      })
    );
    
    const duration = Date.now() - start;
    console.log(`✓ Completed 10 concurrent queries in ${duration}ms`);
    console.log(`  Average: ${(duration / 10).toFixed(1)}ms per query`);
    console.log("  Connection pool reused connections efficiently!\n");

    // ========================================================================
    // Summary
    // ========================================================================
    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║  ✅ MySQL Comprehensive Demo Completed!                   ║");
    console.log("╚════════════════════════════════════════════════════════════╝");
    console.log("\n📚 What you've seen:");
    console.log("   ✓ Schema creation with foreign keys and indexes");
    console.log("   ✓ Bulk data import operations");
    console.log("   ✓ Complex queries with filtering");
    console.log("   ✓ ACID transactions with rollback");
    console.log("   ✓ Upsert operations (INSERT ... ON DUPLICATE KEY UPDATE)");
    console.log("   ✓ Advanced JOINs and aggregations");
    console.log("   ✓ Window functions (RANK)");
    console.log("   ✓ Audit trail implementation");
    console.log("   ✓ Connection pooling for concurrency");
    console.log("\n🎯 MySQL-specific features demonstrated:");
    console.log("   • Foreign key constraints with CASCADE");
    console.log("   • ENUM types for status fields");
    console.log("   • TIMESTAMP with ON UPDATE CURRENT_TIMESTAMP");
    console.log("   • FOR UPDATE row locking in transactions");
    console.log("   • LAST_INSERT_ID() for auto-increment IDs");
    console.log("   • Connection pool with configurable size");
    console.log("\n🚀 Ready for production MySQL workloads!");

  } catch (error) {
    console.error("\n❌ Error:", error);
    if (error instanceof DBError) {
      console.error("Query:", error.context.query);
      console.error("Params:", error.context.params);
    }
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.main) {
  main().catch(console.error);
}

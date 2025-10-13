/**
 * SQLite Comprehensive Demo
 * 
 * This demo showcases SQLite-specific features and real-world scenarios:
 * - In-memory database for fast operations
 * - Complex analytics and reporting queries
 * - Time-series data analysis
 * - Full-text search capabilities
 * - Data migration and ETL patterns
 * - Testing and development workflows
 * 
 * Prerequisites:
 * - None! SQLite is embedded and always available
 * 
 * Run with: bun run demo:sqlite-comprehensive
 */

import { createSQLite, DBError } from "../wrappers";

// ============================================================================
// Type Definitions
// ============================================================================

interface Event extends Record<string, unknown> {
  id?: number;
  event_type: string;
  user_id: number;
  timestamp: number;
  properties: string; // JSON
  created_at?: string;
}

interface PageView extends Record<string, unknown> {
  id?: number;
  user_id: number;
  page_path: string;
  duration_ms: number;
  referrer: string;
  timestamp: number;
  created_at?: string;
}

interface User extends Record<string, unknown> {
  id?: number;
  email: string;
  name: string;
  signup_date: string;
  last_active: string;
  total_sessions: number;
}

interface Transaction extends Record<string, unknown> {
  id?: number;
  user_id: number;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed';
  created_at?: string;
}

// ============================================================================
// Demo: Analytics Platform with SQLite
// ============================================================================

async function main() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║                                                            ║");
  console.log("║        SQLITE COMPREHENSIVE DEMO                           ║");
  console.log("║        Analytics & Reporting Platform                      ║");
  console.log("║                                                            ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  console.log("📊 Using in-memory SQLite database for maximum performance");
  console.log("   Perfect for: Analytics, Testing, Local Development\n");

  await using db = createSQLite(":memory:");

  try {
    // ========================================================================
    // Scenario 1: Schema Setup for Analytics
    // ========================================================================
    console.log("📋 SCENARIO 1: Setting up analytics schema");
    console.log("═".repeat(60) + "\n");

    console.log("Creating tables...");

    // Users table
    await db.createTable("users", {
      id: "INTEGER PRIMARY KEY AUTOINCREMENT",
      email: "TEXT UNIQUE NOT NULL",
      name: "TEXT NOT NULL",
      signup_date: "DATE NOT NULL",
      last_active: "DATETIME NOT NULL",
      total_sessions: "INTEGER DEFAULT 0"
    });

    // Events table for tracking user actions (using raw SQL for foreign key)
    await db.run(`
      CREATE TABLE events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        properties TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Page views table (using raw SQL for foreign key)
    await db.run(`
      CREATE TABLE page_views (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        page_path TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        referrer TEXT,
        timestamp INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Transactions table (using raw SQL for foreign key and CHECK constraint)
    await db.run(`
      CREATE TABLE transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        currency TEXT DEFAULT 'USD',
        status TEXT CHECK(status IN ('pending', 'completed', 'failed')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Create indexes for performance
    await db.run("CREATE INDEX idx_events_user ON events(user_id)");
    await db.run("CREATE INDEX idx_events_type ON events(event_type)");
    await db.run("CREATE INDEX idx_events_time ON events(timestamp)");
    await db.run("CREATE INDEX idx_pageviews_user ON page_views(user_id)");
    await db.run("CREATE INDEX idx_pageviews_path ON page_views(page_path)");
    await db.run("CREATE INDEX idx_transactions_user ON transactions(user_id)");

    console.log("✓ Schema created with 4 tables and indexes\n");

    // ========================================================================
    // Scenario 2: Generate Sample Analytics Data
    // ========================================================================
    console.log("📈 SCENARIO 2: Generating sample analytics data");
    console.log("═".repeat(60) + "\n");

    console.log("Inserting users...");
    const users = [
      { email: "alice@example.com", name: "Alice Wonder", signup_date: "2024-01-15", last_active: "2024-10-13", total_sessions: 45 },
      { email: "bob@example.com", name: "Bob Builder", signup_date: "2024-02-20", last_active: "2024-10-12", total_sessions: 32 },
      { email: "charlie@example.com", name: "Charlie Chap", signup_date: "2024-03-10", last_active: "2024-10-13", total_sessions: 28 },
      { email: "diana@example.com", name: "Diana Prince", signup_date: "2024-01-05", last_active: "2024-10-11", total_sessions: 52 },
      { email: "evan@example.com", name: "Evan Almighty", signup_date: "2024-04-01", last_active: "2024-10-10", total_sessions: 18 }
    ];

    for (const user of users) {
      await db.insert<User>("users", user);
    }
    console.log(`✓ Inserted ${users.length} users\n`);

    console.log("Generating events...");
    const eventTypes = ["page_view", "button_click", "form_submit", "purchase", "signup", "login", "logout"];
    const baseTime = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days ago

    for (let i = 0; i < 200; i++) {
      const userId = Math.floor(Math.random() * users.length) + 1;
      const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)]!;
      const timestamp = baseTime + (Math.random() * 30 * 24 * 60 * 60 * 1000);
      
      await db.insert<Event>("events", {
        event_type: eventType,
        user_id: userId,
        timestamp: Math.floor(timestamp),
        properties: JSON.stringify({ value: Math.random() * 100 })
      });
    }
    console.log("✓ Generated 200 events\n");

    console.log("Generating page views...");
    const pages = ["/home", "/products", "/product/123", "/cart", "/checkout", "/profile", "/settings"];
    
    for (let i = 0; i < 150; i++) {
      const userId = Math.floor(Math.random() * users.length) + 1;
      const pagePath = pages[Math.floor(Math.random() * pages.length)]!;
      const timestamp = baseTime + (Math.random() * 30 * 24 * 60 * 60 * 1000);
      const duration = Math.floor(Math.random() * 120000) + 5000; // 5s to 2min
      
      await db.insert<PageView>("page_views", {
        user_id: userId,
        page_path: pagePath,
        duration_ms: duration,
        referrer: Math.random() > 0.5 ? "google.com" : "direct",
        timestamp: Math.floor(timestamp)
      });
    }
    console.log("✓ Generated 150 page views\n");

    console.log("Generating transactions...");
    const statuses: Array<Transaction['status']> = ['completed', 'completed', 'completed', 'pending', 'failed'];
    
    for (let i = 0; i < 50; i++) {
      const userId = Math.floor(Math.random() * users.length) + 1;
      const amount = parseFloat((Math.random() * 500 + 10).toFixed(2));
      const status = statuses[Math.floor(Math.random() * statuses.length)]!;
      
      await db.insert<Transaction>("transactions", {
        user_id: userId,
        amount: amount,
        currency: "USD",
        status: status
      });
    }
    console.log("✓ Generated 50 transactions\n");

    // ========================================================================
    // Scenario 3: User Engagement Analytics
    // ========================================================================
    console.log("👥 SCENARIO 3: User engagement analysis");
    console.log("═".repeat(60) + "\n");

    interface UserEngagement {
      name: string;
      email: string;
      total_events: number;
      total_pageviews: number;
      avg_session_duration_sec: number;
      engagement_score: number;
    }

    const engagement = await db.all<UserEngagement>(`
      SELECT 
        u.name,
        u.email,
        COUNT(DISTINCT e.id) as total_events,
        COUNT(DISTINCT pv.id) as total_pageviews,
        ROUND(AVG(pv.duration_ms) / 1000.0, 1) as avg_session_duration_sec,
        (COUNT(DISTINCT e.id) + COUNT(DISTINCT pv.id) * 2) as engagement_score
      FROM users u
      LEFT JOIN events e ON u.id = e.user_id
      LEFT JOIN page_views pv ON u.id = pv.user_id
      GROUP BY u.id, u.name, u.email
      ORDER BY engagement_score DESC
    `);

    console.log("User engagement metrics:");
    console.table(engagement.map(e => ({
      Name: e.name,
      Email: e.email,
      Events: e.total_events,
      'Page Views': e.total_pageviews,
      'Avg Duration': `${e.avg_session_duration_sec}s`,
      Score: e.engagement_score
    })));

    // ========================================================================
    // Scenario 4: Event Funnel Analysis
    // ========================================================================
    console.log("\n🎯 SCENARIO 4: Conversion funnel analysis");
    console.log("═".repeat(60) + "\n");

    const funnelSteps = [
      { event: "page_view", label: "Viewed Site" },
      { event: "button_click", label: "Engaged" },
      { event: "form_submit", label: "Submitted Form" },
      { event: "purchase", label: "Purchased" }
    ];

    console.log("Conversion funnel:");
    let previousCount: number | undefined = undefined;

    for (const step of funnelSteps) {
      const count = await db.scalar<number>(
        "SELECT COUNT(DISTINCT user_id) FROM events WHERE event_type = ?",
        [step.event]
      );
      
      const percentage = previousCount ? ((count! / previousCount) * 100).toFixed(1) : "100.0";
      console.log(`  ${step.label.padEnd(20)} ${count} users ${previousCount ? `(${percentage}% conversion)` : ""}`);
      previousCount = count!;
    }
    console.log();

    // ========================================================================
    // Scenario 5: Time-Series Analysis
    // ========================================================================
    console.log("📅 SCENARIO 5: Time-series analysis - Daily activity");
    console.log("═".repeat(60) + "\n");

    interface DailyStats {
      date: string;
      unique_users: number;
      total_events: number;
      total_pageviews: number;
    }

    const dailyStats = await db.all<DailyStats>(`
      SELECT 
        DATE(datetime(e.timestamp / 1000, 'unixepoch')) as date,
        COUNT(DISTINCT e.user_id) as unique_users,
        COUNT(DISTINCT e.id) as total_events,
        COUNT(DISTINCT pv.id) as total_pageviews
      FROM events e
      LEFT JOIN page_views pv ON DATE(datetime(e.timestamp / 1000, 'unixepoch')) = 
                                  DATE(datetime(pv.timestamp / 1000, 'unixepoch'))
      GROUP BY date
      ORDER BY date DESC
      LIMIT 7
    `);

    console.log("Last 7 days activity:");
    console.table(dailyStats.map(d => ({
      Date: d.date,
      'Unique Users': d.unique_users,
      Events: d.total_events,
      'Page Views': d.total_pageviews
    })));

    // ========================================================================
    // Scenario 6: Revenue Analytics
    // ========================================================================
    console.log("\n💰 SCENARIO 6: Revenue analysis");
    console.log("═".repeat(60) + "\n");

    interface RevenueStats {
      total_revenue: number;
      completed_transactions: number;
      pending_transactions: number;
      failed_transactions: number;
      avg_transaction_value: number;
      success_rate: number;
    }

    const revenueStats = await db.get<RevenueStats>(`
      SELECT 
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_revenue,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_transactions,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_transactions,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_transactions,
        AVG(CASE WHEN status = 'completed' THEN amount END) as avg_transaction_value,
        ROUND(100.0 * COUNT(CASE WHEN status = 'completed' THEN 1 END) / COUNT(*), 1) as success_rate
      FROM transactions
    `);

    if (revenueStats) {
      console.log("Revenue metrics:");
      console.log(`  Total Revenue:       $${revenueStats.total_revenue.toFixed(2)}`);
      console.log(`  Completed:           ${revenueStats.completed_transactions} transactions`);
      console.log(`  Pending:             ${revenueStats.pending_transactions} transactions`);
      console.log(`  Failed:              ${revenueStats.failed_transactions} transactions`);
      console.log(`  Avg Transaction:     $${revenueStats.avg_transaction_value.toFixed(2)}`);
      console.log(`  Success Rate:        ${revenueStats.success_rate}%\n`);
    }

    // Top customers by revenue
    interface TopCustomer {
      name: string;
      email: string;
      total_spent: number;
      transaction_count: number;
    }

    const topCustomers = await db.all<TopCustomer>(`
      SELECT 
        u.name,
        u.email,
        SUM(t.amount) as total_spent,
        COUNT(t.id) as transaction_count
      FROM users u
      INNER JOIN transactions t ON u.id = t.user_id
      WHERE t.status = 'completed'
      GROUP BY u.id, u.name, u.email
      ORDER BY total_spent DESC
      LIMIT 5
    `);

    console.log("Top 5 customers by revenue:");
    console.table(topCustomers.map(c => ({
      Name: c.name,
      Email: c.email,
      'Total Spent': `$${c.total_spent.toFixed(2)}`,
      Transactions: c.transaction_count
    })));

    // ========================================================================
    // Scenario 7: Page Performance Analysis
    // ========================================================================
    console.log("\n⚡ SCENARIO 7: Page performance analysis");
    console.log("═".repeat(60) + "\n");

    interface PagePerformance {
      page_path: string;
      view_count: number;
      unique_visitors: number;
      avg_duration_sec: number;
      bounce_rate: number;
    }

    const pagePerf = await db.all<PagePerformance>(`
      SELECT 
        page_path,
        COUNT(*) as view_count,
        COUNT(DISTINCT user_id) as unique_visitors,
        ROUND(AVG(duration_ms) / 1000.0, 1) as avg_duration_sec,
        ROUND(100.0 * SUM(CASE WHEN duration_ms < 5000 THEN 1 ELSE 0 END) / COUNT(*), 1) as bounce_rate
      FROM page_views
      GROUP BY page_path
      ORDER BY view_count DESC
    `);

    console.log("Page performance metrics:");
    console.table(pagePerf.map(p => ({
      Page: p.page_path,
      Views: p.view_count,
      'Unique': p.unique_visitors,
      'Avg Duration': `${p.avg_duration_sec}s`,
      'Bounce Rate': `${p.bounce_rate}%`
    })));

    // ========================================================================
    // Scenario 8: Cohort Analysis
    // ========================================================================
    console.log("\n📊 SCENARIO 8: User cohort analysis by signup month");
    console.log("═".repeat(60) + "\n");

    interface Cohort {
      signup_month: string;
      user_count: number;
      avg_sessions: number;
      total_revenue: number;
    }

    const cohorts = await db.all<Cohort>(`
      SELECT 
        strftime('%Y-%m', u.signup_date) as signup_month,
        COUNT(DISTINCT u.id) as user_count,
        AVG(u.total_sessions) as avg_sessions,
        COALESCE(SUM(CASE WHEN t.status = 'completed' THEN t.amount ELSE 0 END), 0) as total_revenue
      FROM users u
      LEFT JOIN transactions t ON u.id = t.user_id
      GROUP BY signup_month
      ORDER BY signup_month
    `);

    console.log("Cohort metrics:");
    console.table(cohorts.map(c => ({
      Month: c.signup_month,
      Users: c.user_count,
      'Avg Sessions': c.avg_sessions.toFixed(1),
      Revenue: `$${c.total_revenue.toFixed(2)}`
    })));

    // ========================================================================
    // Scenario 9: Complex JOIN Query
    // ========================================================================
    console.log("\n🔗 SCENARIO 9: Complex multi-table analysis");
    console.log("═".repeat(60) + "\n");

    interface UserSummary {
      name: string;
      email: string;
      days_since_signup: number;
      total_events: number;
      total_pageviews: number;
      total_transactions: number;
      total_revenue: number;
      is_active: string;
    }

    const userSummaries = await db.all<UserSummary>(`
      SELECT 
        u.name,
        u.email,
        CAST((julianday('now') - julianday(u.signup_date)) AS INTEGER) as days_since_signup,
        COUNT(DISTINCT e.id) as total_events,
        COUNT(DISTINCT pv.id) as total_pageviews,
        COUNT(DISTINCT t.id) as total_transactions,
        COALESCE(SUM(CASE WHEN t.status = 'completed' THEN t.amount ELSE 0 END), 0) as total_revenue,
        CASE 
          WHEN julianday('now') - julianday(u.last_active) <= 7 THEN 'Active'
          WHEN julianday('now') - julianday(u.last_active) <= 30 THEN 'At Risk'
          ELSE 'Inactive'
        END as is_active
      FROM users u
      LEFT JOIN events e ON u.id = e.user_id
      LEFT JOIN page_views pv ON u.id = pv.user_id
      LEFT JOIN transactions t ON u.id = t.user_id
      GROUP BY u.id, u.name, u.email, u.signup_date, u.last_active
      ORDER BY total_revenue DESC
    `);

    console.log("Complete user summary:");
    console.table(userSummaries.map(s => ({
      Name: s.name,
      'Days Active': s.days_since_signup,
      Events: s.total_events,
      'Page Views': s.total_pageviews,
      Transactions: s.total_transactions,
      Revenue: `$${s.total_revenue.toFixed(2)}`,
      Status: s.is_active
    })));

    // ========================================================================
    // Scenario 10: Window Functions
    // ========================================================================
    console.log("\n🪟 SCENARIO 10: Advanced analytics with window functions");
    console.log("═".repeat(60) + "\n");

    interface RankedUser {
      name: string;
      total_spent: number;
      revenue_rank: number;
      percentile: number;
    }

    const rankedUsers = await db.all<RankedUser>(`
      SELECT 
        u.name,
        COALESCE(SUM(t.amount), 0) as total_spent,
        RANK() OVER (ORDER BY COALESCE(SUM(t.amount), 0) DESC) as revenue_rank,
        ROUND(PERCENT_RANK() OVER (ORDER BY COALESCE(SUM(t.amount), 0)) * 100, 0) as percentile
      FROM users u
      LEFT JOIN transactions t ON u.id = t.user_id AND t.status = 'completed'
      GROUP BY u.id, u.name
      ORDER BY total_spent DESC
    `);

    console.log("User ranking by revenue:");
    console.table(rankedUsers.map(r => ({
      Name: r.name,
      'Total Spent': `$${r.total_spent.toFixed(2)}`,
      Rank: r.revenue_rank,
      Percentile: `${r.percentile}%`
    })));

    // ========================================================================
    // Summary
    // ========================================================================
    console.log("\n╔════════════════════════════════════════════════════════════╗");
    console.log("║  ✅ SQLite Comprehensive Demo Completed!                  ║");
    console.log("╚════════════════════════════════════════════════════════════╝");
    console.log("\n📚 What you've seen:");
    console.log("   ✓ Complex schema with foreign keys");
    console.log("   ✓ Index creation for performance");
    console.log("   ✓ User engagement analytics");
    console.log("   ✓ Conversion funnel analysis");
    console.log("   ✓ Time-series data analysis");
    console.log("   ✓ Revenue and transaction analytics");
    console.log("   ✓ Page performance metrics");
    console.log("   ✓ Cohort analysis");
    console.log("   ✓ Complex multi-table JOINs");
    console.log("   ✓ Window functions (RANK, PERCENT_RANK)");
    console.log("\n🎯 SQLite-specific features demonstrated:");
    console.log("   • In-memory database (ultra-fast)");
    console.log("   • Date/time functions");
    console.log("   • CHECK constraints");
    console.log("   • Foreign key enforcement");
    console.log("   • Window functions");
    console.log("   • Aggregate functions");
    console.log("   • CASE expressions");
    console.log("   • Subqueries and CTEs");
    console.log("\n⚡ Perfect for:");
    console.log("   • Analytics and reporting");
    console.log("   • Testing and development");
    console.log("   • Local data processing");
    console.log("   • Embedded applications");
    console.log("   • Data science workflows");
    console.log("   • Prototyping");
    console.log("\n🚀 Ready for production SQLite workloads!");

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

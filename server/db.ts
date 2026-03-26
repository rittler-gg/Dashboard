import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AggregateSnapshot,
  Brand,
  BrandBreakdown,
  BrandHourlyPoint,
  ChannelBreakdown,
  DashboardBreakdowns,
  DashboardDateRange,
  KpiSnapshot,
  OrderEvent,
  PlatformBreakdown,
  TrafficSnapshot,
} from "../src/types/dashboard";
import { getUtcRangeForIst } from "./timeRange";

interface StoredLineItemInput {
  lineItemId: string;
  title: string;
  vendor: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface StoredOrderInput {
  shopifyOrderId: string;
  orderName: string;
  quantity: number;
  price: number;
  zip: string | null;
  createdAt: string;
  city: string | null;
  state: string | null;
  country: string | null;
  currencyCode: string;
  financialStatus: string;
  fulfillmentStatus: string;
  vendorSummary: string | null;
  brand: Brand;
  channel: "D2C";
  platform: "App" | "Web" | "Unknown";
  appId: string | null;
  appName: string | null;
  rawPayload: string;
  lineItems: StoredLineItemInput[];
}

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const repoRoot = path.resolve(currentDir, "..");
const dataDir = path.join(repoRoot, "data");
const databasePath = path.join(dataDir, "shopify-orders.db");

fs.mkdirSync(dataDir, { recursive: true });

const database = new Database(databasePath);
database.pragma("journal_mode = WAL");
database.pragma("foreign_keys = ON");

function ensureColumn(table: string, column: string, definition: string) {
  try {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("duplicate column name")) {
      throw error;
    }
  }
}

database.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    shopify_order_id TEXT PRIMARY KEY,
    order_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    zip TEXT,
    created_at TEXT NOT NULL,
    city TEXT,
    state TEXT,
    country TEXT,
    currency_code TEXT NOT NULL,
    financial_status TEXT NOT NULL,
    fulfillment_status TEXT NOT NULL,
    vendor_summary TEXT,
    raw_payload TEXT NOT NULL,
    synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS order_line_items (
    line_item_id TEXT PRIMARY KEY,
    shopify_order_id TEXT NOT NULL,
    title TEXT NOT NULL,
    vendor TEXT,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    total_price REAL NOT NULL,
    synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shopify_order_id) REFERENCES orders(shopify_order_id) ON DELETE CASCADE
  );
`);

ensureColumn("orders", "brand", "TEXT NOT NULL DEFAULT 'Unknown'");
ensureColumn("orders", "channel", "TEXT NOT NULL DEFAULT 'D2C'");
ensureColumn("orders", "platform", "TEXT NOT NULL DEFAULT 'Unknown'");
ensureColumn("orders", "app_id", "TEXT");
ensureColumn("orders", "app_name", "TEXT");

const upsertOrderStatement = database.prepare(`
  INSERT INTO orders (
    shopify_order_id,
    order_name,
    quantity,
    price,
    zip,
    created_at,
    city,
    state,
    country,
    currency_code,
    financial_status,
    fulfillment_status,
    vendor_summary,
    brand,
    channel,
    platform,
    app_id,
    app_name,
    raw_payload,
    synced_at
  ) VALUES (
    @shopifyOrderId,
    @orderName,
    @quantity,
    @price,
    @zip,
    @createdAt,
    @city,
    @state,
    @country,
    @currencyCode,
    @financialStatus,
    @fulfillmentStatus,
    @vendorSummary,
    @brand,
    @channel,
    @platform,
    @appId,
    @appName,
    @rawPayload,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT(shopify_order_id) DO UPDATE SET
    order_name = excluded.order_name,
    quantity = excluded.quantity,
    price = excluded.price,
    zip = excluded.zip,
    created_at = excluded.created_at,
    city = excluded.city,
    state = excluded.state,
    country = excluded.country,
    currency_code = excluded.currency_code,
    financial_status = excluded.financial_status,
    fulfillment_status = excluded.fulfillment_status,
    vendor_summary = excluded.vendor_summary,
    brand = excluded.brand,
    channel = excluded.channel,
    platform = excluded.platform,
    app_id = excluded.app_id,
    app_name = excluded.app_name,
    raw_payload = excluded.raw_payload,
    synced_at = CURRENT_TIMESTAMP
`);

const deleteLineItemsForOrderStatement = database.prepare(`
  DELETE FROM order_line_items WHERE shopify_order_id = ?
`);

const insertLineItemStatement = database.prepare(`
  INSERT INTO order_line_items (
    line_item_id,
    shopify_order_id,
    title,
    vendor,
    quantity,
    unit_price,
    total_price,
    synced_at
  ) VALUES (
    @lineItemId,
    @shopifyOrderId,
    @title,
    @vendor,
    @quantity,
    @unitPrice,
    @totalPrice,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT(line_item_id) DO UPDATE SET
    title = excluded.title,
    vendor = excluded.vendor,
    quantity = excluded.quantity,
    unit_price = excluded.unit_price,
    total_price = excluded.total_price,
    synced_at = CURRENT_TIMESTAMP
`);

const selectRecentOrdersStatement = database.prepare(`
  SELECT
    shopify_order_id AS id,
    order_name AS name,
    created_at AS createdAt,
    financial_status AS financialStatus,
    fulfillment_status AS fulfillmentStatus,
    price AS orderValue,
    currency_code AS currencyCode,
    zip,
    city,
    state,
    country,
    quantity,
    vendor_summary AS vendorSummary,
    app_id AS appId,
    app_name AS appName,
    brand,
    channel,
    platform
  FROM orders
  ORDER BY datetime(created_at) DESC
  LIMIT ?
`);

const selectLineItemsForOrderStatement = database.prepare(`
  SELECT
    line_item_id AS id,
    title,
    vendor,
    quantity,
    unit_price AS unitPrice,
    total_price AS totalPrice
  FROM order_line_items
  WHERE shopify_order_id = ?
  ORDER BY rowid ASC
`);

function getRangeStart(dateRange: DashboardDateRange) {
  return getUtcRangeForIst(dateRange).startIso;
}

function getRangeEndInclusive(dateRange: DashboardDateRange) {
  return getUtcRangeForIst(dateRange).endInclusiveIso;
}

function buildEmptyBreakdowns(): DashboardBreakdowns {
  return {
    brand: [
      { category: "Core", orders: 0, revenue: 0 },
      { category: "BTC", orders: 0, revenue: 0 },
      { category: "Amodira", orders: 0, revenue: 0 },
      { category: "Other", orders: 0, revenue: 0 },
      { category: "Unknown", orders: 0, revenue: 0 },
    ],
    channel: [
      { category: "D2C", orders: 0, revenue: 0 },
      { category: "MP", orders: 0, revenue: 0 },
      { category: "Offline", orders: 0, revenue: 0 },
      { category: "Other", orders: 0, revenue: 0 },
      { category: "Unknown", orders: 0, revenue: 0 },
    ],
    platform: [
      { category: "App", orders: 0, revenue: 0 },
      { category: "Web", orders: 0, revenue: 0 },
      { category: "Other", orders: 0, revenue: 0 },
      { category: "Unknown", orders: 0, revenue: 0 },
    ],
  };
}

function rowToOrderEvent(row: {
  id: string;
  createdAt: string;
  city: string | null;
  state: string | null;
  quantity: number;
  orderValue: number;
  brand: string;
  channel: string;
  platform: string;
  zip: string | null;
  country: string | null;
}) : OrderEvent {
  const country = row.country ?? "";
  const isOutOfIndia = Boolean(country) && country.toLowerCase() !== "india";

  return {
    id: row.id,
    timestamp: row.createdAt,
    city: row.city ?? "Unknown",
    state: row.state ?? row.country ?? "Unknown",
    lat: null,
    lng: null,
    brand: row.brand as Brand,
    channel: row.channel as OrderEvent["channel"],
    platform: row.platform as OrderEvent["platform"],
    orderValue: row.orderValue,
    unitsSold: row.quantity,
    locationResolution: isOutOfIndia ? "out_of_india" : "unknown",
    isOutOfIndia,
  };
}

export function persistShopifyOrders(orders: StoredOrderInput[]) {
  const transaction = database.transaction((rows: StoredOrderInput[]) => {
    for (const row of rows) {
      upsertOrderStatement.run(row);
      deleteLineItemsForOrderStatement.run(row.shopifyOrderId);

      for (const lineItem of row.lineItems) {
        insertLineItemStatement.run({
          ...lineItem,
          shopifyOrderId: row.shopifyOrderId,
        });
      }
    }
  });

  transaction(orders);
}

export function getStoredRecentOrders(limit = 25) {
  const rows = selectRecentOrdersStatement.all(limit) as Array<{
    id: string;
    name: string;
    createdAt: string;
    financialStatus: string;
    fulfillmentStatus: string;
    orderValue: number;
    currencyCode: string;
    zip: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    quantity: number;
    vendorSummary: string | null;
    appId: string | null;
    appName: string | null;
    brand: Brand;
    channel: string;
    platform: string;
  }>;

  return rows.map((row) => ({
    ...row,
    shippingAddress: {
      city: row.city,
      province: row.state,
      country: row.country,
      zip: row.zip,
    },
    lineItems: selectLineItemsForOrderStatement.all(row.id),
  }));
}

export function getStoredOrdersForRange(dateRange: DashboardDateRange, limit = 50): OrderEvent[] {
  const rows = database
    .prepare(`
      SELECT
        shopify_order_id AS id,
        created_at AS createdAt,
        city,
        state,
        country,
        zip,
        quantity,
        price AS orderValue,
        brand,
        channel,
        platform
      FROM orders
      WHERE datetime(created_at) >= datetime(?)
        AND datetime(created_at) <= datetime(?)
      ORDER BY datetime(created_at) DESC
      LIMIT ?
    `)
    .all(getRangeStart(dateRange), getRangeEndInclusive(dateRange), limit) as Array<{
    id: string;
    createdAt: string;
    city: string | null;
    state: string | null;
    country: string | null;
    zip: string | null;
    quantity: number;
    orderValue: number;
    brand: string;
    channel: string;
    platform: string;
  }>;

  return rows.map(rowToOrderEvent);
}

export function getDashboardSnapshotFromDb(
  dateRange: DashboardDateRange,
  traffic: TrafficSnapshot,
): AggregateSnapshot {
  const params = [getRangeStart(dateRange), getRangeEndInclusive(dateRange)];
  const kpiRow = database
    .prepare(`
      SELECT
        COUNT(*) AS totalOrders,
        COALESCE(SUM(price), 0) AS totalRevenue,
        COALESCE(SUM(quantity), 0) AS totalUnits
      FROM orders
      WHERE datetime(created_at) >= datetime(?)
        AND datetime(created_at) <= datetime(?)
    `)
    .get(...params) as { totalOrders: number; totalRevenue: number; totalUnits: number };

  const kpis: KpiSnapshot = {
    totalOrders: kpiRow.totalOrders ?? 0,
    totalRevenue: kpiRow.totalRevenue ?? 0,
    totalUnits: kpiRow.totalUnits ?? 0,
    averageOrderValue:
      (kpiRow.totalOrders ?? 0) > 0
        ? Math.round((kpiRow.totalRevenue ?? 0) / kpiRow.totalOrders)
        : 0,
  };

  const breakdowns = buildEmptyBreakdowns();
  const breakdownRows = database
    .prepare(`
      SELECT 'brand' AS dimension, brand AS category, COUNT(*) AS orders, COALESCE(SUM(price), 0) AS revenue
      FROM orders
      WHERE datetime(created_at) >= datetime(?)
        AND datetime(created_at) <= datetime(?)
      GROUP BY brand
      UNION ALL
      SELECT 'channel' AS dimension, channel AS category, COUNT(*) AS orders, COALESCE(SUM(price), 0) AS revenue
      FROM orders
      WHERE datetime(created_at) >= datetime(?)
        AND datetime(created_at) <= datetime(?)
      GROUP BY channel
      UNION ALL
      SELECT 'platform' AS dimension, platform AS category, COUNT(*) AS orders, COALESCE(SUM(price), 0) AS revenue
      FROM orders
      WHERE datetime(created_at) >= datetime(?)
        AND datetime(created_at) <= datetime(?)
      GROUP BY platform
    `)
    .all(...params, ...params, ...params) as Array<{
    dimension: "brand" | "channel" | "platform";
    category: string;
    orders: number;
    revenue: number;
  }>;

  for (const row of breakdownRows) {
    const target =
      row.dimension === "brand"
        ? (breakdowns.brand as BrandBreakdown[])
        : row.dimension === "channel"
          ? (breakdowns.channel as ChannelBreakdown[])
          : (breakdowns.platform as PlatformBreakdown[]);
    const bucket = target.find((item) => item.category === row.category);

    if (bucket) {
      bucket.orders = row.orders;
      bucket.revenue = row.revenue;
    } else {
      target.push({
        category: row.category as never,
        orders: row.orders,
        revenue: row.revenue,
      });
    }
  }

  const dailySeries = database
    .prepare(`
      SELECT
        substr(created_at, 1, 10) AS date,
        COUNT(*) AS orders,
        COALESCE(SUM(price), 0) AS revenue,
        COALESCE(SUM(quantity), 0) AS units
      FROM orders
      WHERE datetime(created_at) >= datetime(?)
        AND datetime(created_at) <= datetime(?)
      GROUP BY substr(created_at, 1, 10)
      ORDER BY date ASC
    `)
    .all(...params) as Array<{ date: string; orders: number; revenue: number; units: number }>;

  const brandHourlyRows = database
    .prepare(`
      SELECT
        brand,
        strftime('%H:00', created_at) AS hour,
        COUNT(*) AS orders
      FROM orders
      WHERE datetime(created_at) >= datetime(?)
        AND datetime(created_at) <= datetime(?)
      GROUP BY brand, strftime('%H:00', created_at)
      ORDER BY hour ASC
    `)
    .all(...params) as Array<{ brand: Brand; hour: string; orders: number }>;

  const hourlyLabels = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}:00`);
  const brandHourlyMap = new Map<Brand, Map<string, number>>();

  for (const row of brandHourlyRows) {
    const bucket = brandHourlyMap.get(row.brand) ?? new Map<string, number>();
    bucket.set(row.hour, row.orders);
    brandHourlyMap.set(row.brand, bucket);
  }

  const brandHourly: BrandHourlyPoint[] = Array.from(brandHourlyMap.entries()).flatMap(
    ([brand, hourMap]) =>
      hourlyLabels.map((hour) => ({
        brand,
        hour,
        orders: hourMap.get(hour) ?? 0,
      })),
  );

  return {
    kpis,
    traffic,
    breakdowns,
    dailySeries,
    brandHourly,
    checkoutFunnel: null,
    asOf: new Date().toISOString(),
  };
}

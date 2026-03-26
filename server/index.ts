import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getDashboardSnapshotFromDb,
  getStoredOrdersForRange,
  getStoredRecentOrders,
  persistShopifyOrders,
} from "./db";
import { getActiveUsers } from "./ga4";
import { getRecentShopifyOrders, getShopifyOrdersForDateRange } from "./shopify";
import type { DashboardDateRange } from "../src/types/dashboard";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const repoRoot = path.resolve(currentDir, "..");
const envPath = path.join(repoRoot, ".env");

dotenv.config({ path: envPath });

if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(
    repoRoot,
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
  );
}

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
const REALTIME_CACHE_TTL_MS = 15_000;

let cachedRealtimeUsers: { activeUsers: number; fetchedAt: number } | null = null;
let realtimeUsersPromise: Promise<number> | null = null;

app.use(
  cors({
    origin: FRONTEND_ORIGIN,
  }),
);

function getTodayDateString(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCurrentTimeString(now = new Date()) {
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function isValidTimeString(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function getDateRangeFromRequest(request: express.Request): DashboardDateRange {
  const today = getTodayDateString();
  const currentTime = getCurrentTimeString();
  const from = typeof request.query.from === "string" ? request.query.from : today;
  const to = typeof request.query.to === "string" ? request.query.to : from;
  const fromTime = isValidTimeString(request.query.fromTime) ? request.query.fromTime : "00:00";
  const toTime = isValidTimeString(request.query.toTime) ? request.query.toTime : currentTime;
  const normalized = { from, to, fromTime, toTime };

  if (`${normalized.from}T${normalized.fromTime}` <= `${normalized.to}T${normalized.toTime}`) {
    return normalized;
  }

  return {
    from: to,
    to: from,
    fromTime: toTime,
    toTime: fromTime,
  };
}

function getRealtimeErrorStatus(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 8
  ) {
    return 429;
  }

  return 500;
}

async function getCachedActiveUsers() {
  const now = Date.now();

  if (cachedRealtimeUsers && now - cachedRealtimeUsers.fetchedAt < REALTIME_CACHE_TTL_MS) {
    return cachedRealtimeUsers.activeUsers;
  }

  if (!realtimeUsersPromise) {
    realtimeUsersPromise = getActiveUsers()
      .then((activeUsers) => {
        cachedRealtimeUsers = {
          activeUsers,
          fetchedAt: Date.now(),
        };
        return activeUsers;
      })
      .finally(() => {
        realtimeUsersPromise = null;
      });
  }

  return realtimeUsersPromise;
}

async function syncShopifyOrdersForRange(dateRange: DashboardDateRange) {
  const orders = await getShopifyOrdersForDateRange(dateRange);

  persistShopifyOrders(
    orders.map((order) => ({
      shopifyOrderId: order.id,
      orderName: order.name,
      quantity: order.quantity,
      price: order.orderValue,
      zip: order.shippingAddress?.zip ?? null,
      createdAt: order.createdAt,
      city: order.shippingAddress?.city ?? null,
      state: order.shippingAddress?.province ?? null,
      country: order.shippingAddress?.country ?? null,
      currencyCode: order.currencyCode,
      financialStatus: order.financialStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      vendorSummary: order.vendorSummary || null,
      brand: order.brand,
      channel: order.channel,
      platform: order.platform,
      appId: order.appId,
      appName: order.appName,
      rawPayload: JSON.stringify(order),
      lineItems: order.lineItems.map((lineItem) => ({
        lineItemId: lineItem.id,
        title: lineItem.title,
        vendor: lineItem.vendor,
        quantity: lineItem.quantity,
        unitPrice: lineItem.unitPrice,
        totalPrice: lineItem.totalPrice,
      })),
    })),
  );
}

app.get("/api/realtime-users", async (request, response) => {
  getDateRangeFromRequest(request);

  try {
    const activeUsers = await getCachedActiveUsers();
    response.json({ activeUsers });
  } catch (error) {
    console.error("GA4 error:", error);
    response
      .status(getRealtimeErrorStatus(error))
      .json({ activeUsers: null, error: "Failed to fetch" });
  }
});

app.get("/api/dashboard/snapshot", async (request, response) => {
  const dateRange = getDateRangeFromRequest(request);
  try {
    await syncShopifyOrdersForRange(dateRange);
    const traffic =
      cachedRealtimeUsers && Date.now() - cachedRealtimeUsers.fetchedAt < REALTIME_CACHE_TTL_MS
        ? { activeUsers: cachedRealtimeUsers.activeUsers, delta: 0 }
        : { activeUsers: 0, delta: 0 };
    response.json(getDashboardSnapshotFromDb(dateRange, traffic));
  } catch (error) {
    console.error("Dashboard snapshot error:", error);
    response.status(500).json({ error: error instanceof Error ? error.message : "Failed to build snapshot" });
  }
});

app.get("/api/dashboard/breakdowns", async (request, response) => {
  const dateRange = getDateRangeFromRequest(request);
  try {
    await syncShopifyOrdersForRange(dateRange);
    response.json(getDashboardSnapshotFromDb(dateRange, { activeUsers: 0, delta: 0 }).breakdowns);
  } catch (error) {
    console.error("Dashboard breakdowns error:", error);
    response.status(500).json({ error: error instanceof Error ? error.message : "Failed to build breakdowns" });
  }
});

app.get("/api/dashboard/orders", async (request, response) => {
  const dateRange = getDateRangeFromRequest(request);
  const limit = typeof request.query.limit === "string" ? Number(request.query.limit) : 50;
  try {
    await syncShopifyOrdersForRange(dateRange);
    response.json(getStoredOrdersForRange(dateRange, Number.isFinite(limit) ? limit : 50));
  } catch (error) {
    console.error("Dashboard orders error:", error);
    response.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch orders" });
  }
});

app.get("/api/shopify/orders/recent", async (request, response) => {
  const limit = typeof request.query.limit === "string" ? Number(request.query.limit) : 25;
  const lookbackMinutes =
    typeof request.query.lookbackMinutes === "string" ? Number(request.query.lookbackMinutes) : 30;

  try {
    const orders = await getRecentShopifyOrders(
      Number.isFinite(limit) ? limit : 25,
      Number.isFinite(lookbackMinutes) ? lookbackMinutes : 30,
    );

    persistShopifyOrders(
      orders.map((order) => ({
        shopifyOrderId: order.id,
        orderName: order.name,
        quantity: order.quantity,
        price: order.orderValue,
        zip: order.shippingAddress?.zip ?? null,
        createdAt: order.createdAt,
        city: order.shippingAddress?.city ?? null,
        state: order.shippingAddress?.province ?? null,
        country: order.shippingAddress?.country ?? null,
        currencyCode: order.currencyCode,
        financialStatus: order.financialStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        vendorSummary: order.vendorSummary || null,
        brand: order.brand,
        channel: order.channel,
        platform: order.platform,
        appId: order.appId,
        appName: order.appName,
        rawPayload: JSON.stringify(order),
        lineItems: order.lineItems.map((lineItem) => ({
          lineItemId: lineItem.id,
          title: lineItem.title,
          vendor: lineItem.vendor,
          quantity: lineItem.quantity,
          unitPrice: lineItem.unitPrice,
          totalPrice: lineItem.totalPrice,
        })),
      })),
    );

    response.json({ orders: getStoredRecentOrders(Number.isFinite(limit) ? limit : 25) });
  } catch (error) {
    console.error("Shopify orders error:", error);
    response.status(500).json({
      orders: [],
      error: error instanceof Error ? error.message : "Failed to fetch Shopify orders",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

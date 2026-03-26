import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDashboardSnapshot, getBrandHourly, getDashboardBreakdowns, getOrders } from "./dashboardMock";
import { getActiveUsers } from "./ga4";
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

function getDateRangeFromRequest(request: express.Request): DashboardDateRange {
  const today = getTodayDateString();
  const from = typeof request.query.from === "string" ? request.query.from : today;
  const to = typeof request.query.to === "string" ? request.query.to : from;
  return from <= to ? { from, to } : { from: to, to: from };
}

app.get("/api/realtime-users", async (request, response) => {
  getDateRangeFromRequest(request);

  try {
    const activeUsers = await getActiveUsers();
    response.json({ activeUsers });
  } catch (error) {
    console.error("GA4 error:", error);
    response.status(500).json({ activeUsers: null, error: "Failed to fetch" });
  }
});

app.get("/api/dashboard/snapshot", async (request, response) => {
  const dateRange = getDateRangeFromRequest(request);
  response.json(buildDashboardSnapshot(dateRange));
});

app.get("/api/dashboard/breakdowns", async (request, response) => {
  const dateRange = getDateRangeFromRequest(request);
  response.json(getDashboardBreakdowns(dateRange));
});

app.get("/api/dashboard/brand-hourly", async (request, response) => {
  const dateRange = getDateRangeFromRequest(request);
  response.json(getBrandHourly(dateRange));
});

app.get("/api/dashboard/orders", async (request, response) => {
  const dateRange = getDateRangeFromRequest(request);
  const limit = typeof request.query.limit === "string" ? Number(request.query.limit) : 50;
  response.json(getOrders(dateRange, Number.isFinite(limit) ? limit : 50));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

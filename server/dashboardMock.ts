import type {
  AggregateSnapshot,
  Brand,
  BrandBreakdown,
  BrandHourlyPoint,
  ChannelBreakdown,
  DashboardBreakdowns,
  DashboardDateRange,
  OrderEvent,
  Platform,
  PlatformBreakdown,
  SalesChannel,
  TrafficSnapshot,
} from "../src/types/dashboard";

const brands = ["Core", "BTC", "Amodira"] as const;
const channels = ["D2C", "MP", "Offline"] as const;
const platforms = ["App", "Web"] as const;
const locations = [
  { city: "Mumbai", state: "Maharashtra", lat: 19.076, lng: 72.8777 },
  { city: "Delhi", state: "Delhi", lat: 28.6139, lng: 77.209 },
  { city: "Bengaluru", state: "Karnataka", lat: 12.9716, lng: 77.5946 },
  { city: "Hyderabad", state: "Telangana", lat: 17.385, lng: 78.4867 },
  { city: "Chennai", state: "Tamil Nadu", lat: 13.0827, lng: 80.2707 },
  { city: "Kolkata", state: "West Bengal", lat: 22.5726, lng: 88.3639 },
  { city: "Pune", state: "Maharashtra", lat: 18.5204, lng: 73.8567 },
  { city: "Ahmedabad", state: "Gujarat", lat: 23.0225, lng: 72.5714 },
];

function createSeededRandom(seed: number) {
  let value = seed;

  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

const random = createSeededRandom(42);

function pick<T>(items: readonly T[]) {
  return items[Math.floor(random() * items.length)];
}

function formatDateKey(isoString: string) {
  const date = new Date(isoString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getRangeStart(dateRange: DashboardDateRange) {
  return Number(new Date(`${dateRange.from}T00:00:00`));
}

function getRangeEnd(dateRange: DashboardDateRange) {
  return Number(new Date(`${dateRange.to}T23:59:59.999`));
}

function createEmptyBrandBreakdown(): BrandBreakdown[] {
  return [
    { category: "Core", orders: 0, revenue: 0 },
    { category: "BTC", orders: 0, revenue: 0 },
    { category: "Amodira", orders: 0, revenue: 0 },
    { category: "Other", orders: 0, revenue: 0 },
    { category: "Unknown", orders: 0, revenue: 0 },
  ];
}

function createEmptyChannelBreakdown(): ChannelBreakdown[] {
  return [
    { category: "D2C", orders: 0, revenue: 0 },
    { category: "MP", orders: 0, revenue: 0 },
    { category: "Offline", orders: 0, revenue: 0 },
    { category: "Other", orders: 0, revenue: 0 },
    { category: "Unknown", orders: 0, revenue: 0 },
  ];
}

function createEmptyPlatformBreakdown(): PlatformBreakdown[] {
  return [
    { category: "App", orders: 0, revenue: 0 },
    { category: "Web", orders: 0, revenue: 0 },
    { category: "Other", orders: 0, revenue: 0 },
    { category: "Unknown", orders: 0, revenue: 0 },
  ];
}

function compactBreakdowns(breakdowns: DashboardBreakdowns): DashboardBreakdowns {
  const compact = <T extends { category: string; orders: number }>(items: T[]) =>
    items.filter((item) =>
      item.category === "Core" ||
      item.category === "BTC" ||
      item.category === "Amodira" ||
      item.category === "D2C" ||
      item.category === "MP" ||
      item.category === "Offline" ||
      item.category === "App" ||
      item.category === "Web" ||
      item.orders > 0,
    );

  return {
    brand: compact(breakdowns.brand) as BrandBreakdown[],
    channel: compact(breakdowns.channel) as ChannelBreakdown[],
    platform: compact(breakdowns.platform) as PlatformBreakdown[],
  };
}

function createBrandHourly(orders: OrderEvent[]): BrandHourlyPoint[] {
  const hourlyLabels = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}:00`);
  const buckets = new Map<Brand, Map<string, number>>();

  for (const order of orders) {
    const label = `${String(new Date(order.timestamp).getHours()).padStart(2, "0")}:00`;
    const brandBucket = buckets.get(order.brand) ?? new Map<string, number>();
    brandBucket.set(label, (brandBucket.get(label) ?? 0) + 1);
    buckets.set(order.brand, brandBucket);
  }

  return Array.from(buckets.entries()).flatMap(([brand, brandBuckets]) =>
    hourlyLabels.map((hour) => ({
      brand,
      hour,
      orders: brandBuckets.get(hour) ?? 0,
    })),
  );
}

function createOrder(id: number, timestamp: number): OrderEvent {
  const location = pick(locations);
  const brand = pick(brands);
  const channel = pick(channels);
  const platform = pick(platforms);
  const baseRevenue = brand === "Core" ? 1799 : brand === "BTC" ? 2399 : 2999;

  return {
    id: `ORD-${String(id).padStart(6, "0")}`,
    timestamp: new Date(timestamp).toISOString(),
    city: location.city,
    state: location.state,
    lat: location.lat,
    lng: location.lng,
    brand,
    channel,
    platform,
    orderValue: Math.round(baseRevenue * (0.8 + random() * 0.7)),
    unitsSold: 1 + Math.floor(random() * 4),
    locationResolution: "exact",
    isOutOfIndia: false,
  };
}

function generateOrders() {
  const orders: OrderEvent[] = [];
  const now = Date.now();
  let orderId = 1;

  for (let dayOffset = 44; dayOffset >= 0; dayOffset -= 1) {
    const ordersForDay = 12 + Math.floor(random() * 12);
    for (let index = 0; index < ordersForDay; index += 1) {
      const withinDayOffset = Math.floor(random() * 86_400_000);
      orders.push(createOrder(orderId++, now - dayOffset * 86_400_000 - withinDayOffset));
    }
  }

  return orders.sort((left, right) => Number(new Date(left.timestamp)) - Number(new Date(right.timestamp)));
}

const historicalOrders = generateOrders();

function filterOrdersByDateRange(orders: OrderEvent[], dateRange: DashboardDateRange) {
  const rangeStart = getRangeStart(dateRange);
  const rangeEnd = getRangeEnd(dateRange);

  return orders.filter((order) => {
    const orderTime = Number(new Date(order.timestamp));
    return orderTime >= rangeStart && orderTime <= rangeEnd;
  });
}

export function buildDashboardSnapshot(
  dateRange: DashboardDateRange,
  traffic: TrafficSnapshot = { activeUsers: 0, delta: 0 },
): AggregateSnapshot {
  const orders = filterOrdersByDateRange(historicalOrders, dateRange);
  const brand = createEmptyBrandBreakdown();
  const channel = createEmptyChannelBreakdown();
  const platform = createEmptyPlatformBreakdown();
  const dailySeriesMap = new Map<string, { orders: number; revenue: number; units: number }>();

  let totalRevenue = 0;
  let totalUnits = 0;

  for (const order of orders) {
    totalRevenue += order.orderValue;
    totalUnits += order.unitsSold;
    brand.find((item) => item.category === order.brand)!.orders += 1;
    brand.find((item) => item.category === order.brand)!.revenue += order.orderValue;
    channel.find((item) => item.category === order.channel)!.orders += 1;
    channel.find((item) => item.category === order.channel)!.revenue += order.orderValue;
    platform.find((item) => item.category === order.platform)!.orders += 1;
    platform.find((item) => item.category === order.platform)!.revenue += order.orderValue;

    const dayKey = formatDateKey(order.timestamp);
    const bucket = dailySeriesMap.get(dayKey) ?? { orders: 0, revenue: 0, units: 0 };
    bucket.orders += 1;
    bucket.revenue += order.orderValue;
    bucket.units += order.unitsSold;
    dailySeriesMap.set(dayKey, bucket);
  }

  return {
    kpis: {
      totalOrders: orders.length,
      totalRevenue,
      totalUnits,
      averageOrderValue: orders.length === 0 ? 0 : Math.round(totalRevenue / orders.length),
    },
    traffic,
    breakdowns: compactBreakdowns({ brand, channel, platform }),
    dailySeries: Array.from(dailySeriesMap.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, bucket]) => ({
        date,
        orders: bucket.orders,
        revenue: bucket.revenue,
        units: bucket.units,
      })),
    brandHourly: createBrandHourly(orders),
    checkoutFunnel: null,
    asOf: new Date().toISOString(),
  };
}

export function getDashboardBreakdowns(dateRange: DashboardDateRange) {
  return buildDashboardSnapshot(dateRange).breakdowns;
}

export function getBrandHourly(dateRange: DashboardDateRange) {
  return buildDashboardSnapshot(dateRange).brandHourly;
}

export function getOrders(dateRange: DashboardDateRange, limit = 50) {
  return filterOrdersByDateRange(historicalOrders, dateRange)
    .sort((left, right) => Number(new Date(right.timestamp)) - Number(new Date(left.timestamp)))
    .slice(0, limit);
}

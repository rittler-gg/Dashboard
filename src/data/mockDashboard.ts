import type {
  AggregateSnapshot,
  Brand,
  BrandBreakdown,
  BrandHourlyPoint,
  ChannelBreakdown,
  DashboardBreakdowns,
  DashboardDataSource,
  DashboardDateRange,
  DashboardState,
  DashboardStreamUpdate,
  OrderEvent,
  Platform,
  PlatformBreakdown,
  SalesChannel,
  TrafficSnapshot,
} from "../types/dashboard";
import {
  buildMapMarker,
  buildOrderComment,
  INITIAL_COMMENT_COUNT,
  INITIAL_MARKER_COUNT,
  RECENT_ORDER_LIMIT,
  getLatestOrder,
} from "../utils/dashboardLive";
const INDIA_BOUNDS = {
  minLat: 6,
  maxLat: 37.5,
  minLng: 68,
  maxLng: 97.5,
};

const brands = ["Core", "BTC", "Amodira"] as const;
const channels = ["D2C", "MP", "Offline"] as const;
const platforms = ["App", "Web"] as const;

const indiaCities = [
  { city: "Mumbai", state: "Maharashtra", lat: 19.076, lng: 72.8777 },
  { city: "Delhi", state: "Delhi", lat: 28.6139, lng: 77.209 },
  { city: "Bengaluru", state: "Karnataka", lat: 12.9716, lng: 77.5946 },
  { city: "Hyderabad", state: "Telangana", lat: 17.385, lng: 78.4867 },
  { city: "Chennai", state: "Tamil Nadu", lat: 13.0827, lng: 80.2707 },
  { city: "Kolkata", state: "West Bengal", lat: 22.5726, lng: 88.3639 },
  { city: "Pune", state: "Maharashtra", lat: 18.5204, lng: 73.8567 },
  { city: "Ahmedabad", state: "Gujarat", lat: 23.0225, lng: 72.5714 },
  { city: "Jaipur", state: "Rajasthan", lat: 26.9124, lng: 75.7873 },
  { city: "Lucknow", state: "Uttar Pradesh", lat: 26.8467, lng: 80.9462 },
  { city: "Kochi", state: "Kerala", lat: 9.9312, lng: 76.2673 },
  { city: "Guwahati", state: "Assam", lat: 26.1445, lng: 91.7362 },
  { city: "Indore", state: "Madhya Pradesh", lat: 22.7196, lng: 75.8577 },
  { city: "Surat", state: "Gujarat", lat: 21.1702, lng: 72.8311 },
  { city: "Bhubaneswar", state: "Odisha", lat: 20.2961, lng: 85.8245 },
  { city: "Chandigarh", state: "Chandigarh", lat: 30.7333, lng: 76.7794 },
];

const internationalCities = [
  { city: "Dubai", state: "UAE", lat: 25.2048, lng: 55.2708 },
  { city: "Singapore", state: "Singapore", lat: 1.3521, lng: 103.8198 },
  { city: "London", state: "UK", lat: 51.5072, lng: -0.1276 },
  { city: "New York", state: "USA", lat: 40.7128, lng: -74.006 },
];

const BRAND_BASE_REVENUE: Record<(typeof brands)[number], number> = {
  Core: 1699,
  BTC: 2299,
  Amodira: 2899,
};

const stateCentroids = new Map(
  indiaCities.map((location) => [location.state, location] as const),
);
const cityCentroids = new Map(
  indiaCities.map((location) => [`${location.city}|${location.state}`, location] as const),
);

interface RawOrderEvent {
  id: string;
  timestamp: string;
  city: string;
  state: string;
  lat: number | null;
  lng: number | null;
  brand: string;
  channel: string;
  platform: string;
  orderValue: number;
  unitsSold: number;
}

function createSeededRandom(seed: number) {
  let value = seed;

  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

const random = createSeededRandom(26);

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

const DEFAULT_DATE_RANGE: DashboardDateRange = {
  from: formatDateKey(new Date().toISOString()),
  to: formatDateKey(new Date().toISOString()),
  fromTime: "00:00",
  toTime: "23:59",
};

function getRangeStart(dateRange: DashboardDateRange) {
  return Number(new Date(`${dateRange.from}T00:00:00`));
}

function getRangeEnd(dateRange: DashboardDateRange) {
  return Number(new Date(`${dateRange.to}T23:59:59.999`));
}

function filterOrdersByDateRange(orders: OrderEvent[], dateRange: DashboardDateRange) {
  const rangeStart = getRangeStart(dateRange);
  const rangeEnd = getRangeEnd(dateRange);

  return orders.filter((order) => {
    const orderTime = Number(new Date(order.timestamp));
    return orderTime >= rangeStart && orderTime <= rangeEnd;
  });
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

function isWithinIndia(lat: number, lng: number) {
  return (
    lat >= INDIA_BOUNDS.minLat &&
    lat <= INDIA_BOUNDS.maxLat &&
    lng >= INDIA_BOUNDS.minLng &&
    lng <= INDIA_BOUNDS.maxLng
  );
}

function coerceBrand(value: string): Brand {
  if (value === "Core" || value === "BTC" || value === "Amodira") {
    return value;
  }
  return value ? "Other" : "Unknown";
}

function coerceChannel(value: string): SalesChannel {
  if (value === "D2C" || value === "MP" || value === "Offline") {
    return value;
  }
  return value ? "Other" : "Unknown";
}

function coercePlatform(value: string): Platform {
  if (value === "App" || value === "Web") {
    return value;
  }
  return value ? "Other" : "Unknown";
}

function normalizeOrder(raw: RawOrderEvent): OrderEvent {
  let lat = raw.lat;
  let lng = raw.lng;
  let locationResolution: OrderEvent["locationResolution"] = "unknown";
  let isOutOfIndia = false;

  const hasNumericCoordinates =
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0);

  if (hasNumericCoordinates && lat !== null && lng !== null) {
    if (isWithinIndia(lat, lng)) {
      locationResolution = "exact";
    } else if (isWithinIndia(lng, lat)) {
      [lat, lng] = [lng, lat];
      locationResolution = "exact";
    } else {
      locationResolution = "out_of_india";
      isOutOfIndia = true;
    }
  }

  if (locationResolution === "unknown") {
    const cityMatch = cityCentroids.get(`${raw.city}|${raw.state}`);
    if (cityMatch) {
      lat = cityMatch.lat;
      lng = cityMatch.lng;
      locationResolution = "city_centroid";
    } else {
      const stateMatch = stateCentroids.get(raw.state);
      if (stateMatch) {
        lat = stateMatch.lat;
        lng = stateMatch.lng;
        locationResolution = "state_centroid";
      } else {
        lat = null;
        lng = null;
      }
    }
  }

  return {
    id: raw.id,
    timestamp: raw.timestamp,
    city: raw.city,
    state: raw.state,
    lat,
    lng,
    brand: coerceBrand(raw.brand),
    channel: coerceChannel(raw.channel),
    platform: coercePlatform(raw.platform),
    orderValue: raw.orderValue,
    unitsSold: raw.unitsSold,
    locationResolution,
    isOutOfIndia,
  };
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

function createAggregateSnapshot(
  orders: OrderEvent[],
  traffic: TrafficSnapshot,
  asOf: string,
): AggregateSnapshot {
  const brand = createEmptyBrandBreakdown();
  const channel = createEmptyChannelBreakdown();
  const platform = createEmptyPlatformBreakdown();
  const dailySeriesMap = new Map<string, { orders: number; revenue: number; units: number }>();

  let totalRevenue = 0;
  let totalUnits = 0;

  for (const order of orders) {
    totalRevenue += order.orderValue;
    totalUnits += order.unitsSold;
    const brandBucket = brand.find((item) => item.category === order.brand);
    const channelBucket = channel.find((item) => item.category === order.channel);
    const platformBucket = platform.find((item) => item.category === order.platform);

    if (brandBucket) {
      brandBucket.orders += 1;
      brandBucket.revenue += order.orderValue;
    }

    if (channelBucket) {
      channelBucket.orders += 1;
      channelBucket.revenue += order.orderValue;
    }

    if (platformBucket) {
      platformBucket.orders += 1;
      platformBucket.revenue += order.orderValue;
    }

    const dayKey = formatDateKey(order.timestamp);
    const bucket = dailySeriesMap.get(dayKey) ?? { orders: 0, revenue: 0, units: 0 };
    bucket.orders += 1;
    bucket.revenue += order.orderValue;
    bucket.units += order.unitsSold;
    dailySeriesMap.set(dayKey, bucket);
  }

  const dailySeries = Array.from(dailySeriesMap.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-45)
    .map(([date, bucket]) => ({
      date,
      orders: bucket.orders,
      revenue: bucket.revenue,
      units: bucket.units,
    }));

  const checkoutWindowOrders = orders.filter(
    (order) => Number(new Date(order.timestamp)) >= Date.now() - 7 * 86_400_000,
  );
  const orderPlacedCount = checkoutWindowOrders.length;
  const checkoutStartedCount = Math.max(orderPlacedCount, Math.round(orderPlacedCount * 1.68));
  const addToCartCount = Math.max(
    checkoutStartedCount,
    Math.round(checkoutStartedCount * 1.59),
  );
  const pdpViewCount = Math.max(addToCartCount, Math.round(addToCartCount * 1.72));
  const sessionsCount = Math.max(pdpViewCount, Math.round(pdpViewCount * 1.36));
  const funnelCounts = [
    { key: "sessions", label: "Sessions", count: sessionsCount },
    { key: "pdp_views", label: "PDP views", count: pdpViewCount },
    { key: "add_to_cart", label: "Add to cart", count: addToCartCount },
    { key: "checkout_started", label: "Checkout started", count: checkoutStartedCount },
    { key: "order_placed", label: "Order placed", count: orderPlacedCount },
  ] as const;

  return {
    kpis: {
      totalOrders: orders.length,
      totalRevenue,
      totalUnits,
      averageOrderValue: orders.length === 0 ? 0 : Math.round(totalRevenue / orders.length),
    },
    traffic,
    breakdowns: compactBreakdowns({
      brand,
      channel,
      platform,
    }),
    dailySeries,
    brandHourly: createBrandHourly(orders),
    checkoutFunnel: funnelCounts.map((step, index) => {
      const previous = funnelCounts[index - 1]?.count;
      return {
        key: step.key,
        label: step.label,
        count: step.count,
        dropOffFromPrevious:
          previous && previous > 0
            ? Math.max(0, Math.round(((previous - step.count) / previous) * 100))
            : null,
      };
    }),
    asOf,
  };
}

function createInitialState(
  orders: OrderEvent[],
  traffic: TrafficSnapshot,
  streamStatus: DashboardState["streamStatus"],
  dateRange: DashboardDateRange,
): DashboardState {
  const recentOrders = [...orders]
    .sort((left, right) => Number(new Date(right.timestamp)) - Number(new Date(left.timestamp)))
    .slice(0, RECENT_ORDER_LIMIT);
  const latestOrder = getLatestOrder(recentOrders);

  return {
    aggregateSnapshot: createAggregateSnapshot(
      filterOrdersByDateRange(orders, dateRange),
      traffic,
      new Date().toISOString(),
    ),
    recentOrders,
    feedQueue: [],
    activeFeedComments: recentOrders
      .slice(0, INITIAL_COMMENT_COUNT)
      .map((order, index) => buildOrderComment(order, Date.now() + index * 280)),
    activeMapMarkers: recentOrders
      .slice(0, INITIAL_MARKER_COUNT)
      .map((order, index) =>
        buildMapMarker(order, Date.now() + index * 180, order.id === latestOrder?.id, 3600),
      ),
    streamStatus,
    lastMessageAt: latestOrder?.timestamp ?? new Date().toISOString(),
  };
}

function buildRawOrder(id: number, timestamp: number): RawOrderEvent {
  const useInternationalLocation = random() < 0.08;
  const location = useInternationalLocation ? pick(internationalCities) : pick(indiaCities);
  const brand =
    random() < 0.06 ? (random() < 0.5 ? "Limited" : "") : pick(brands);
  const channel =
    random() < 0.05 ? (random() < 0.5 ? "Retail Partner" : "") : pick(channels);
  const platform =
    random() < 0.05 ? (random() < 0.5 ? "Kiosk" : "") : pick(platforms);
  const base =
    brand === "Core" || brand === "BTC" || brand === "Amodira"
      ? BRAND_BASE_REVENUE[brand]
      : 1899;
  const volatility = 0.72 + random() * 0.9;
  let lat: number | null = location.lat;
  let lng: number | null = location.lng;
  const coordinateGlitch = random();

  if (!useInternationalLocation && coordinateGlitch < 0.04) {
    lat = 0;
    lng = 0;
  } else if (!useInternationalLocation && coordinateGlitch < 0.08) {
    [lat, lng] = [lng, lat];
  } else if (!useInternationalLocation && coordinateGlitch < 0.11) {
    lat = null;
    lng = null;
  }

  return {
    id: `ORD-${String(id).padStart(6, "0")}`,
    timestamp: new Date(timestamp).toISOString(),
    city: location.city,
    state: location.state,
    lat,
    lng,
    brand,
    channel,
    platform,
    orderValue: Math.round(base * volatility),
    unitsSold: 1 + Math.floor(random() * 4),
  };
}

function generateHistoricalOrders() {
  const orders: OrderEvent[] = [];
  const now = Date.now();
  let orderId = 1;

  for (let dayOffset = 44; dayOffset >= 0; dayOffset -= 1) {
    const ordersForDay = 6 + Math.floor(random() * 10);
    for (let index = 0; index < ordersForDay; index += 1) {
      const withinDayOffset = Math.floor(random() * 86_400_000);
      const timestamp = now - dayOffset * 86_400_000 - withinDayOffset;
      orders.push(normalizeOrder(buildRawOrder(orderId++, timestamp)));
    }
  }

  return orders.sort(
    (left, right) => Number(new Date(left.timestamp)) - Number(new Date(right.timestamp)),
  );
}

const historicalLedger = generateHistoricalOrders();
let liveLedger = [...historicalLedger];

function getAggregateSnapshotForRange(
  dateRange: DashboardDateRange,
  traffic: TrafficSnapshot,
): AggregateSnapshot {
  return createAggregateSnapshot(
    filterOrdersByDateRange(liveLedger, dateRange),
    traffic,
    new Date().toISOString(),
  );
}

function getInitialDashboardState(dateRange: DashboardDateRange = DEFAULT_DATE_RANGE): DashboardState {
  return createInitialState(liveLedger, { activeUsers: 128, delta: 6 }, "connecting", dateRange);
}

function subscribeToMockUpdates(
  onUpdate: (update: DashboardStreamUpdate) => void,
  options?: { getDateRange?: () => DashboardDateRange },
) {
  let activeUsers = 128;
  let lastTrafficDelta = 6;
  let orderCursor = liveLedger.length + 1;
  let paused = false;

  const emitSnapshot = () => {
    const dateRange = options?.getDateRange?.() ?? DEFAULT_DATE_RANGE;
    onUpdate({
      type: "snapshot",
      snapshot: getAggregateSnapshotForRange(dateRange, {
        activeUsers,
        delta: lastTrafficDelta,
      }),
    });
  };

  window.setTimeout(() => {
    onUpdate({ type: "status", status: "live" });
    emitSnapshot();
  }, 320);

  const orderTimer = window.setInterval(() => {
    if (paused) {
      return;
    }

    const burstSizeRoll = random();
    const batchSize = burstSizeRoll > 0.9 ? 5 + Math.floor(random() * 4) : burstSizeRoll > 0.72 ? 2 + Math.floor(random() * 3) : 1;
    const batch: OrderEvent[] = [];

    for (let index = 0; index < batchSize; index += 1) {
      const timestampOffset = index === 0 ? 0 : Math.floor(random() * 9_000);
      const isOutOfOrder = random() < 0.18;
      const timestamp = Date.now() - (isOutOfOrder ? 35_000 + timestampOffset : timestampOffset);
      const nextOrder = normalizeOrder(buildRawOrder(orderCursor++, timestamp));
      batch.push(nextOrder);
      liveLedger.push(nextOrder);
    }

    if (random() < 0.16 && liveLedger.length > 8) {
      batch.push(liveLedger[liveLedger.length - 1 - Math.floor(random() * 6)]);
    }

    onUpdate({ type: "orders", orders: batch });
  }, 1100);

  const trafficTimer = window.setInterval(() => {
    const swing = Math.floor(random() * 17) - 8;
    activeUsers = Math.max(42, activeUsers + swing);
    lastTrafficDelta = swing;
    onUpdate({
      type: "traffic",
      traffic: {
        activeUsers,
        delta: swing,
      },
    });
  }, 1700);

  const snapshotTimer = window.setInterval(() => {
    emitSnapshot();
  }, 9000);

  const reconnectTimer = window.setInterval(() => {
    paused = true;
    onUpdate({ type: "status", status: "stale" });

    const reconnectingTimer = window.setTimeout(() => {
      onUpdate({ type: "status", status: "reconnecting" });
    }, 1600);

    const resumeTimer = window.setTimeout(() => {
      paused = false;
      onUpdate({ type: "status", status: "live" });
      emitSnapshot();
    }, 3600);

    reconnectTimeouts.push(reconnectingTimer, resumeTimer);
  }, 28_000);

  const reconnectTimeouts: number[] = [];

  return () => {
    window.clearInterval(orderTimer);
    window.clearInterval(trafficTimer);
    window.clearInterval(snapshotTimer);
    window.clearInterval(reconnectTimer);
    for (const timeout of reconnectTimeouts) {
      window.clearTimeout(timeout);
    }
  };
}

export const mockDashboardDataSource: DashboardDataSource = {
  getInitialDashboardState,
  getAggregateSnapshotForRange,
  subscribeToMockUpdates,
};

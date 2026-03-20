import type {
  Brand,
  BrandBreakdown,
  ChannelBreakdown,
  DashboardDataSource,
  DashboardState,
  OrderEvent,
  PlatformBreakdown,
  SalesChannel,
  Platform,
} from "../types/dashboard";

const brands: Brand[] = ["Core", "BTC", "Amodira"];
const channels: SalesChannel[] = ["D2C", "MP", "Offline"];
const platforms: Platform[] = ["App", "Web"];

const cities = [
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

const BRAND_BASE_REVENUE: Record<Brand, number> = {
  Core: 1699,
  BTC: 2299,
  Amodira: 2899,
};

function createSeededRandom(seed: number) {
  let value = seed;

  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

const random = createSeededRandom(26);

function pick<T>(items: T[]) {
  return items[Math.floor(random() * items.length)];
}

function buildOrder(id: number, dateOffsetMs = 0): OrderEvent {
  const location = pick(cities);
  const brand = pick(brands);
  const channel = pick(channels);
  const platform =
    channel === "Offline"
      ? random() > 0.78
        ? "App"
        : "Web"
      : random() > 0.47
        ? "App"
        : "Web";
  const base = BRAND_BASE_REVENUE[brand];
  const volatility = 0.72 + random() * 0.9;

  return {
    id: `ORD-${String(id).padStart(5, "0")}`,
    timestamp: new Date(Date.now() - dateOffsetMs).toISOString(),
    city: location.city,
    state: location.state,
    lat: location.lat,
    lng: location.lng,
    brand,
    channel,
    platform,
    orderValue: Math.round(base * volatility),
  };
}

function createEmptyBrandBreakdown(): BrandBreakdown[] {
  return brands.map((category) => ({ category, orders: 0, revenue: 0 }));
}

function createEmptyChannelBreakdown(): ChannelBreakdown[] {
  return channels.map((category) => ({ category, orders: 0, revenue: 0 }));
}

function createEmptyPlatformBreakdown(): PlatformBreakdown[] {
  return platforms.map((category) => ({ category, orders: 0, revenue: 0 }));
}

function deriveState(
  orders: OrderEvent[],
  activeUsers: number,
  delta: number,
  streamStatus: DashboardState["streamStatus"],
): DashboardState {
  const brandBreakdown = createEmptyBrandBreakdown();
  const channelBreakdown = createEmptyChannelBreakdown();
  const platformBreakdown = createEmptyPlatformBreakdown();

  let totalRevenue = 0;

  for (const order of orders) {
    totalRevenue += order.orderValue;
    brandBreakdown.find((item) => item.category === order.brand)!.orders += 1;
    brandBreakdown.find((item) => item.category === order.brand)!.revenue +=
      order.orderValue;
    channelBreakdown.find((item) => item.category === order.channel)!.orders += 1;
    channelBreakdown.find((item) => item.category === order.channel)!.revenue +=
      order.orderValue;
    platformBreakdown.find((item) => item.category === order.platform)!.orders += 1;
    platformBreakdown.find((item) => item.category === order.platform)!.revenue +=
      order.orderValue;
  }

  return {
    orders,
    kpis: {
      totalOrders: orders.length,
      totalRevenue,
      averageOrderValue: orders.length === 0 ? 0 : Math.round(totalRevenue / orders.length),
    },
    traffic: {
      activeUsers,
      delta,
    },
    breakdowns: {
      brand: brandBreakdown,
      channel: channelBreakdown,
      platform: platformBreakdown,
    },
    lastOrder: orders[0],
    streamStatus,
  };
}

function generateInitialOrders(count: number) {
  return Array.from({ length: count }, (_, index) =>
    buildOrder(index + 1, index * 93000),
  ).sort((a, b) => Number(new Date(b.timestamp)) - Number(new Date(a.timestamp)));
}

const initialOrders = generateInitialOrders(32);

function getInitialDashboardState(): DashboardState {
  return deriveState(initialOrders, 128, 6, "connecting");
}

function subscribeToMockUpdates(onStateChange: (state: DashboardState) => void) {
  let activeUsers = 128;
  let orderCursor = initialOrders.length + 1;
  let orders = [...initialOrders];

  onStateChange(deriveState(orders, activeUsers, 6, "live"));

  const orderTimer = window.setInterval(() => {
    const nextOrder = buildOrder(orderCursor++);
    orders = [nextOrder, ...orders].slice(0, 80);
    onStateChange(deriveState(orders, activeUsers, 4 + Math.floor(random() * 8), "live"));
  }, 2600);

  const trafficTimer = window.setInterval(() => {
    const swing = Math.floor(random() * 17) - 8;
    activeUsers = Math.max(42, activeUsers + swing);
    onStateChange(deriveState(orders, activeUsers, swing, "live"));
  }, 1900);

  return () => {
    window.clearInterval(orderTimer);
    window.clearInterval(trafficTimer);
  };
}

export const mockDashboardDataSource: DashboardDataSource = {
  getInitialDashboardState,
  subscribeToMockUpdates,
};

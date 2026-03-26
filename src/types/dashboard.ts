export type StreamStatus =
  | "connecting"
  | "live"
  | "stale"
  | "reconnecting"
  | "error";

export interface DashboardDateRange {
  from: string;
  to: string;
  fromTime: string;
  toTime: string;
}

export type Brand = "Core" | "BTC" | "Amodira" | "Other" | "Unknown";
export type SalesChannel = "D2C" | "MP" | "Offline" | "Other" | "Unknown";
export type Platform = "App" | "Web" | "Other" | "Unknown";

export type LocationResolution =
  | "exact"
  | "city_centroid"
  | "state_centroid"
  | "out_of_india"
  | "unknown";

export type MarkerPlacement = "india" | "outskirts" | "unknown";
export type MarkerEdge = "north" | "south" | "east" | "west";

export interface OrderEvent {
  id: string;
  timestamp: string;
  city: string;
  state: string;
  lat: number | null;
  lng: number | null;
  brand: Brand;
  channel: SalesChannel;
  platform: Platform;
  orderValue: number;
  unitsSold: number;
  locationResolution: LocationResolution;
  isOutOfIndia: boolean;
}

export interface KpiSnapshot {
  totalOrders: number;
  totalRevenue: number;
  totalUnits: number;
  averageOrderValue: number;
}

export interface TrafficSnapshot {
  activeUsers: number;
  delta: number;
}

export interface BreakdownDatum<TCategory extends string> {
  category: TCategory;
  orders: number;
  revenue: number;
}

export type BrandBreakdown = BreakdownDatum<Brand>;
export type ChannelBreakdown = BreakdownDatum<SalesChannel>;
export type PlatformBreakdown = BreakdownDatum<Platform>;

export interface DashboardBreakdowns {
  brand: BrandBreakdown[];
  channel: ChannelBreakdown[];
  platform: PlatformBreakdown[];
}

export interface AggregateBucket {
  date: string;
  orders: number;
  revenue: number;
  units: number;
}

export interface BrandHourlyPoint {
  brand: Brand;
  hour: string;
  orders: number;
}

export interface CheckoutFunnelStep {
  key: "sessions" | "pdp_views" | "add_to_cart" | "checkout_started" | "order_placed";
  label: string;
  count: number | null;
  dropOffFromPrevious: number | null;
}

export interface AggregateSnapshot {
  kpis: KpiSnapshot;
  traffic: TrafficSnapshot;
  breakdowns: DashboardBreakdowns;
  dailySeries: AggregateBucket[];
  brandHourly: BrandHourlyPoint[];
  checkoutFunnel: CheckoutFunnelStep[] | null;
  asOf: string;
}

export interface FeedComment {
  id: string;
  kind: "order" | "summary";
  timestamp: string;
  order?: OrderEvent;
  summaryCount?: number;
  expiresAt: number;
}

export interface MapMarker {
  id: string;
  orderId: string;
  timestamp: string;
  city: string;
  state: string;
  orderValue: number;
  brand: Brand;
  lat: number | null;
  lng: number | null;
  placement: MarkerPlacement;
  edge?: MarkerEdge;
  locationResolution: LocationResolution;
  highlighted: boolean;
  expiresAt: number;
}

export interface LocationHealth {
  invalidCount: number;
  outOfIndiaCount: number;
  unknownCount: number;
  fallbackCount: number;
}

export interface DashboardState {
  aggregateSnapshot: AggregateSnapshot;
  recentOrders: OrderEvent[];
  feedQueue: OrderEvent[];
  activeFeedComments: FeedComment[];
  activeMapMarkers: MapMarker[];
  streamStatus: StreamStatus;
  lastMessageAt?: string;
  streamError?: string;
}

export type DashboardStreamUpdate =
  | { type: "snapshot"; snapshot: AggregateSnapshot }
  | { type: "traffic"; traffic: TrafficSnapshot }
  | { type: "orders"; orders: OrderEvent[] }
  | { type: "status"; status: StreamStatus }
  | { type: "error"; message: string };

export interface DashboardDataSource {
  getInitialDashboardState: (dateRange: DashboardDateRange) => DashboardState;
  getAggregateSnapshotForRange: (
    dateRange: DashboardDateRange,
    traffic: TrafficSnapshot,
  ) => AggregateSnapshot;
  subscribeToMockUpdates: (
    onUpdate: (update: DashboardStreamUpdate) => void,
    options?: {
      getDateRange?: () => DashboardDateRange;
    },
  ) => () => void;
}

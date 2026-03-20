export type Brand = "Core" | "BTC" | "Amodira";
export type SalesChannel = "D2C" | "MP" | "Offline";
export type Platform = "App" | "Web";

export interface OrderEvent {
  id: string;
  timestamp: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  brand: Brand;
  channel: SalesChannel;
  platform: Platform;
  orderValue: number;
}

export interface KpiSnapshot {
  totalOrders: number;
  totalRevenue: number;
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

export interface DashboardState {
  orders: OrderEvent[];
  kpis: KpiSnapshot;
  traffic: TrafficSnapshot;
  breakdowns: DashboardBreakdowns;
  lastOrder?: OrderEvent;
  streamStatus: "connecting" | "live";
}

export interface DashboardDataSource {
  getInitialDashboardState: () => DashboardState;
  subscribeToMockUpdates: (
    onStateChange: (state: DashboardState) => void,
  ) => () => void;
}

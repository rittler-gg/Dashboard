import type { OrderEvent, StreamStatus } from "../types/dashboard";
import { getStreamStatusLabel } from "../utils/streamStatus";
import { formatCurrency, formatTime } from "../utils/format";

interface OrderFeedProps {
  orders: OrderEvent[];
  streamStatus: StreamStatus;
}

const MAX_VISIBLE_ORDERS = 6;

export function OrderFeed({ orders, streamStatus }: OrderFeedProps) {
  const feedLabel = getStreamStatusLabel(streamStatus, "feed");
  const visibleOrders = orders.slice(0, MAX_VISIBLE_ORDERS).reverse();

  return (
    <section className="order-feed-overlay" aria-label="Live order feed rail">
      <div className="order-feed-overlay-head">
        <p className="eyebrow">Live commerce feed</p>
        <span className={`feed-chip ${streamStatus}`}>{feedLabel}</span>
      </div>

      <div className="order-feed-stream" role="log" aria-live="polite">
        {visibleOrders.map((order) => (
          <article key={order.id} className="feed-comment feed-ticker-enter">
            <div className="feed-comment-time">{formatTime(order.timestamp)}</div>
            <div className="feed-comment-body">
              <div className="feed-comment-headline">
                <strong>{formatCurrency(order.orderValue)}</strong>
                <span>
                  {order.city}, {order.state}
                </span>
              </div>
              <p>
                Brand {order.brand} via {order.channel} on {order.platform}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

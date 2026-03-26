import type { FeedComment, StreamStatus } from "../types/dashboard";
import { getStreamStatusLabel } from "../utils/streamStatus";
import { formatCurrency, formatTime } from "../utils/format";

interface OrderFeedProps {
  comments: FeedComment[];
  streamStatus: StreamStatus;
}

export function OrderFeed({ comments, streamStatus }: OrderFeedProps) {
  const feedLabel = getStreamStatusLabel(streamStatus, "feed");

  return (
    <section className="order-feed-overlay" aria-label="Live order comments overlay">
      <div className="order-feed-overlay-head">
        <p className="eyebrow">Live commerce feed</p>
        <span className={`feed-chip ${streamStatus}`}>{feedLabel}</span>
      </div>

      <div className="order-feed-stream" role="log" aria-live="polite">
        {comments.map((comment) =>
          comment.kind === "summary" ? (
            <article key={comment.id} className="feed-comment feed-comment-enter">
              <div className="feed-comment-time">{formatTime(comment.timestamp)}</div>
              <div className="feed-comment-body">
                <div className="feed-comment-headline">
                  <strong>+{comment.summaryCount} more orders</strong>
                  <span>Burst queue</span>
                </div>
                <p>Live overlay is compressing a spike to keep the stream readable.</p>
              </div>
            </article>
          ) : comment.order ? (
            <article key={comment.id} className="feed-comment feed-comment-enter">
              <div className="feed-comment-time">{formatTime(comment.order.timestamp)}</div>
              <div className="feed-comment-body">
                <div className="feed-comment-headline">
                  <strong>{formatCurrency(comment.order.orderValue)}</strong>
                  <span>
                    {comment.order.city}, {comment.order.state}
                  </span>
                </div>
                <p>
                  Brand {comment.order.brand} via {comment.order.channel} on{" "}
                  {comment.order.platform}
                </p>
              </div>
            </article>
          ) : null,
        )}
      </div>
    </section>
  );
}

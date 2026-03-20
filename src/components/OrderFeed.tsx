import { useEffect, useMemo, useRef, useState } from "react";
import type { OrderEvent } from "../types/dashboard";
import { formatCurrency, formatTime } from "../utils/format";

interface OrderFeedProps {
  orders: OrderEvent[];
}

interface FeedComment {
  orderId: string;
  overlayId: string;
  order: OrderEvent;
  phase: "enter" | "leave";
}

const COMMENT_VISIBLE_MS = 4200;
const COMMENT_EXIT_MS = 450;
const MAX_VISIBLE_COMMENTS = 3;

function buildComment(order: OrderEvent) {
  return {
    orderId: order.id,
    overlayId: `${order.id}-${Date.now()}`,
    order,
    phase: "enter" as const,
  };
}

export function OrderFeed({ orders }: OrderFeedProps) {
  const latestOrder = orders[0];
  const initialComments = useMemo(
    () => (latestOrder ? [buildComment(latestOrder)] : []),
    [latestOrder],
  );
  const [comments, setComments] = useState<FeedComment[]>(initialComments);
  const lastSeenOrderId = useRef<string | undefined>(latestOrder?.id);
  const timersRef = useRef<Record<string, number[]>>({});

  useEffect(() => {
    return () => {
      for (const timerIds of Object.values(timersRef.current)) {
        for (const timerId of timerIds) {
          window.clearTimeout(timerId);
        }
      }
    };
  }, []);

  useEffect(() => {
    if (!latestOrder?.id || latestOrder.id === lastSeenOrderId.current) {
      return;
    }

    lastSeenOrderId.current = latestOrder.id;
    const nextComment = buildComment(latestOrder);

    setComments((current) => [nextComment, ...current].slice(0, MAX_VISIBLE_COMMENTS));

    const leaveTimer = window.setTimeout(() => {
      setComments((current) =>
        current.map((comment) =>
          comment.overlayId === nextComment.overlayId
            ? { ...comment, phase: "leave" }
            : comment,
        ),
      );
    }, COMMENT_VISIBLE_MS);

    const removeTimer = window.setTimeout(() => {
      setComments((current) =>
        current.filter((comment) => comment.overlayId !== nextComment.overlayId),
      );
      delete timersRef.current[nextComment.overlayId];
    }, COMMENT_VISIBLE_MS + COMMENT_EXIT_MS);

    timersRef.current[nextComment.overlayId] = [leaveTimer, removeTimer];
  }, [latestOrder]);

  return (
    <section className="order-feed-overlay" aria-label="Live order comments overlay">
      <div className="order-feed-overlay-head">
        <p className="eyebrow">Live commerce feed</p>
        <span className="feed-chip">Streaming</span>
      </div>

      <div className="order-feed-stream" role="log" aria-live="polite">
        {comments.map((comment) => (
          <article
            key={comment.overlayId}
            className={
              comment.phase === "leave"
                ? "feed-comment feed-comment-leave"
                : "feed-comment feed-comment-enter"
            }
          >
            <div className="feed-comment-time">{formatTime(comment.order.timestamp)}</div>
            <div className="feed-comment-body">
              <div className="feed-comment-headline">
                <strong>{formatCurrency(comment.order.orderValue)}</strong>
                <span>
                  {comment.order.city}, {comment.order.state}
                </span>
              </div>
              <p>
                Brand {comment.order.brand} via {comment.order.channel} on {comment.order.platform}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

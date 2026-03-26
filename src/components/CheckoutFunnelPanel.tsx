import type { CheckoutFunnelStep } from "../types/dashboard";
import { formatWholeNumber } from "../utils/format";

interface CheckoutFunnelPanelProps {
  steps: CheckoutFunnelStep[] | null;
}

export function CheckoutFunnelPanel({ steps }: CheckoutFunnelPanelProps) {
  if (!steps || steps.length === 0) {
    return (
      <section className="panel breakdown-panel funnel-panel">
        <div className="panel-header compact">
          <div>
            <p className="eyebrow">Split by checkout step</p>
            <h2>Checkout funnel</h2>
          </div>
        </div>

        <div className="funnel-empty">
          <strong>Waiting for checkout analytics</strong>
          <p>Step counts will appear here once funnel events are available from the analytics pipeline.</p>
        </div>
      </section>
    );
  }

  const topCount = steps[0]?.count ?? 1;

  return (
    <section className="panel breakdown-panel funnel-panel">
      <div className="panel-header compact">
        <div>
          <p className="eyebrow">Split by checkout step</p>
          <h2>Checkout funnel</h2>
        </div>
      </div>

      <div className="funnel-list">
        {steps.map((step) => {
          const width = step.count && topCount ? Math.max((step.count / topCount) * 100, 10) : 0;

          return (
            <article className="funnel-row" key={step.key}>
              <div className="funnel-step">
                <strong>{step.label}</strong>
                <span>{step.count === null ? "—" : formatWholeNumber(step.count)}</span>
              </div>
              <div className="funnel-bar-track">
                {step.count === null ? (
                  <div className="funnel-bar-placeholder" />
                ) : (
                  <div
                    className={`funnel-bar-fill ${step.key === "order_placed" ? "goal" : ""}`}
                    style={{ width: `${width}%` }}
                  />
                )}
              </div>
              <div className="funnel-dropoff">
                {step.dropOffFromPrevious === null ? "—" : `↓ ${step.dropOffFromPrevious}% drop`}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

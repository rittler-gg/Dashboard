export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDashboardRevenue(amount: number) {
  if (amount >= 10_000_000) {
    return `₹${(amount / 10_000_000).toFixed(1)} Cr`;
  }

  if (amount >= 100_000) {
    return `₹${(amount / 100_000).toFixed(1)}L`;
  }

  return formatCurrency(amount);
}

export function formatCompactNumber(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
}

export function formatTrafficNumber(amount: number) {
  if (Math.abs(amount) < 100_000) {
    return formatWholeNumber(amount);
  }

  return formatCompactNumber(amount);
}

export function formatWholeNumber(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatTime(isoString: string) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(isoString));
}

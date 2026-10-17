export function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(rate: number): string {
  const percent = Math.round(rate * 1000) / 10;
  const text = Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(1);
  return `${text}%`;
}

export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

export function formatDay(isoDate: string): string {
  const date = isoDate.length <= 10 ? `${isoDate}T00:00:00.000Z` : isoDate;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date));
}

export function formatTime(isoTimestamp: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(isoTimestamp));
}

export function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

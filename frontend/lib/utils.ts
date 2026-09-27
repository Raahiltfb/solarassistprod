import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date, fmt = "MMM d, yyyy"): string {
  if (!date) return "—";
  const d = typeof date === "string" ? (date.includes("T") ? new Date(date) : parseISO(date)) : date;
  if (isNaN(d.getTime())) return "—";

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function formatDateTime(date: string | Date): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function formatNumber(n: number, digits = 1): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(digits)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(digits)}k`;
  return n.toFixed(digits);
}

export function kWh(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(2)} MWh`;
  return `${n.toFixed(1)} kWh`;
}

export function pct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

export function severityColor(s: string): string {
  switch (s) {
    case "critical": return "text-destructive";
    case "high": return "text-orange-500";
    case "medium": return "text-warning";
    case "low": return "text-muted-foreground";
    default: return "";
  }
}

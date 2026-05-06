import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date, fmt = "MMM d, yyyy"): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, fmt);
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "MMM d, yyyy HH:mm");
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

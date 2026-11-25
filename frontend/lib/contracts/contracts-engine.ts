import { 
  Contract, 
  SlaPolicy, 
  Ticket, 
  SlaTier,
  BillingInvoice 
} from "../types";

export type SlaComplianceStatus = "COMPLIANT" | "AT_RISK" | "BREACHED";

export interface SlaPerformanceReport {
  contract_id: string;
  site_id: string;
  tier: SlaTier;
  total_incidents: number;
  p1_count: number;
  p2_count: number;
  p3_count: number;
  p1_breaches: number;
  p2_breaches: number;
  p3_breaches: number;
  total_breaches: number;
  avg_mttr_hours: number;
  sla_uptime_target_pct: number;
  actual_uptime_pct: number;
  uptime_breached: boolean;
  penalty_credit_inr: number;
  compliance_status: SlaComplianceStatus;
}

export interface BillingCalculationResult {
  base_amount_inr: number;
  spares_amount_inr: number;
  penalty_credit_inr: number;
  subtotal_inr: number;
  tax_amount_inr: number;
  total_amount_inr: number;
}

export interface PortfolioContractStats {
  totalContracts: number;
  activeCount: number;
  pendingRenewalCount: number;
  expiredCount: number;
  totalPortfolioValueInr: number;
  annualRecurringRevenueInr: number;
}

/**
 * Evaluates real-time SLA compliance, MTTR, and calculates contract penalty credits
 */
export function calculateSlaPerformance(params: {
  contract: Contract;
  slaPolicy?: SlaPolicy | null;
  tickets: Ticket[];
  actualUptimePct?: number;
}): SlaPerformanceReport {
  const { contract, tickets, actualUptimePct = 99.2 } = params;
  const tier = contract.sla_tier;

  // Fallback policy standards if not in DB
  const policy: SlaPolicy = params.slaPolicy || {
    id: "default-policy",
    org_id: contract.org_id,
    contract_id: contract.id,
    tier_name: tier,
    p1_response_hours: tier === "premium" ? 2.0 : tier === "standard" ? 4.0 : 8.0,
    p1_resolution_hours: tier === "premium" ? 8.0 : tier === "standard" ? 12.0 : 24.0,
    p2_response_hours: tier === "premium" ? 6.0 : tier === "standard" ? 12.0 : 24.0,
    p2_resolution_hours: tier === "premium" ? 16.0 : tier === "standard" ? 24.0 : 48.0,
    p3_response_hours: tier === "premium" ? 12.0 : tier === "standard" ? 24.0 : 48.0,
    p3_resolution_hours: tier === "premium" ? 24.0 : tier === "standard" ? 48.0 : 72.0,
    uptime_guarantee_percent: tier === "premium" ? 99.0 : tier === "standard" ? 98.0 : 95.0,
    penalty_per_hour_breach_inr: tier === "premium" ? 1000 : tier === "standard" ? 500 : 250,
    created_at: new Date().toISOString(),
  };

  let p1Count = 0;
  let p2Count = 0;
  let p3Count = 0;
  let p1Breaches = 0;
  let p2Breaches = 0;
  let p3Breaches = 0;
  let totalResolutionHours = 0;
  let resolvedCount = 0;
  let penaltyCreditInr = 0;

  const now = Date.now();

  for (const t of tickets) {
    const createdTime = new Date(t.created_at).getTime();
    const resolvedTime = t.resolved_at ? new Date(t.resolved_at).getTime() : now;
    const durationHours = Math.max(0, (resolvedTime - createdTime) / (1000 * 3600));

    if (t.resolved_at) {
      totalResolutionHours += durationHours;
      resolvedCount++;
    }

    if (t.priority === "p1") {
      p1Count++;
      if (durationHours > policy.p1_resolution_hours) {
        p1Breaches++;
        const breachHours = durationHours - policy.p1_resolution_hours;
        penaltyCreditInr += breachHours * policy.penalty_per_hour_breach_inr;
      }
    } else if (t.priority === "p2") {
      p2Count++;
      if (durationHours > policy.p2_resolution_hours) {
        p2Breaches++;
        const breachHours = durationHours - policy.p2_resolution_hours;
        penaltyCreditInr += breachHours * (policy.penalty_per_hour_breach_inr * 0.7);
      }
    } else if (t.priority === "p3" || t.priority === "p4") {
      p3Count++;
      if (durationHours > policy.p3_resolution_hours) {
        p3Breaches++;
        const breachHours = durationHours - policy.p3_resolution_hours;
        penaltyCreditInr += breachHours * (policy.penalty_per_hour_breach_inr * 0.4);
      }
    }
  }

  // Check Uptime Guarantee
  const uptimeBreached = actualUptimePct < policy.uptime_guarantee_percent;
  if (uptimeBreached) {
    const shortfall = policy.uptime_guarantee_percent - actualUptimePct;
    // 1% shortfall penalizes 5% of monthly cycle billing
    const uptimePenalty = (shortfall / 100) * 5 * contract.billing_amount_per_cycle_inr;
    penaltyCreditInr += uptimePenalty;
  }

  const totalBreaches = p1Breaches + p2Breaches + p3Breaches;
  const avgMttr = resolvedCount > 0 ? Number((totalResolutionHours / resolvedCount).toFixed(1)) : 0;

  // Max penalty capped at 25% of billing cycle value
  const maxAllowedPenalty = contract.billing_amount_per_cycle_inr * 0.25;
  const finalPenalty = Math.min(maxAllowedPenalty, Math.round(penaltyCreditInr));

  let complianceStatus: SlaComplianceStatus = "COMPLIANT";
  if (totalBreaches >= 2 || uptimeBreached) {
    complianceStatus = "BREACHED";
  } else if (totalBreaches === 1 || actualUptimePct <= policy.uptime_guarantee_percent + 0.5) {
    complianceStatus = "AT_RISK";
  }

  return {
    contract_id: contract.id,
    site_id: contract.site_id,
    tier,
    total_incidents: tickets.length,
    p1_count: p1Count,
    p2_count: p2Count,
    p3_count: p3Count,
    p1_breaches: p1Breaches,
    p2_breaches: p2Breaches,
    p3_breaches: p3Breaches,
    total_breaches: totalBreaches,
    avg_mttr_hours: avgMttr,
    sla_uptime_target_pct: policy.uptime_guarantee_percent,
    actual_uptime_pct: Number(actualUptimePct.toFixed(2)),
    uptime_breached: uptimeBreached,
    penalty_credit_inr: finalPenalty,
    compliance_status: complianceStatus,
  };
}

/**
 * Computes billing breakdown for an AMC invoice
 */
export function calculateInvoiceBreakdown(params: {
  contract: Pick<Contract, "billing_amount_per_cycle_inr">;
  sparesAmountInr?: number;
  penaltyCreditInr?: number;
  taxRatePercent?: number; // Standard 18% GST
}): BillingCalculationResult {
  const base = Number(params.contract.billing_amount_per_cycle_inr || 0);
  const spares = Number(params.sparesAmountInr || 0);
  const penalty = Math.min(base, Number(params.penaltyCreditInr || 0));
  const taxRate = (params.taxRatePercent ?? 18) / 100;

  const subtotal = Math.max(0, base + spares - penalty);
  const tax = Number((subtotal * taxRate).toFixed(2));
  const total = Number((subtotal + tax).toFixed(2));

  return {
    base_amount_inr: base,
    spares_amount_inr: spares,
    penalty_credit_inr: penalty,
    subtotal_inr: subtotal,
    tax_amount_inr: tax,
    total_amount_inr: total,
  };
}

/**
 * Computes portfolio-wide contract and ARR metrics
 */
export function calculatePortfolioContractStats(contracts: Contract[]): PortfolioContractStats {
  let totalValue = 0;
  let activeArr = 0;
  let activeCount = 0;
  let pendingCount = 0;
  let expiredCount = 0;

  const now = new Date();

  for (const c of contracts) {
    const val = Number(c.contract_value_inr || 0);
    totalValue += val;

    if (c.status === "active") {
      activeCount++;
      activeArr += val;
      // Check if expiring within 60 days
      const endDate = new Date(c.end_date);
      const daysUntilExpiry = (endDate.getTime() - now.getTime()) / (1000 * 3600 * 24);
      if (daysUntilExpiry <= 60 && daysUntilExpiry >= 0) {
        pendingCount++;
      }
    } else if (c.status === "pending_renewal") {
      pendingCount++;
      activeArr += val;
    } else if (c.status === "expired" || c.status === "terminated") {
      expiredCount++;
    }
  }

  return {
    totalContracts: contracts.length,
    activeCount,
    pendingRenewalCount: pendingCount,
    expiredCount,
    totalPortfolioValueInr: Number(totalValue.toFixed(2)),
    annualRecurringRevenueInr: Number(activeArr.toFixed(2)),
  };
}

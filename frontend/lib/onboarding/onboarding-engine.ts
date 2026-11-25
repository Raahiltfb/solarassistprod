import { 
  ContractType, 
  BillingFrequency, 
  SlaTier, 
  SlaPolicy 
} from "../types";

export interface OnboardingSitePayload {
  name: string;
  capacity_kwp: number;
  location: string;
  latitude: number;
  longitude: number;
  grid_tariff_inr_per_kwh?: number | null;
  service_tier: "full_om" | "cleaning_only";
  client_id?: string | null;
  client_org_id?: string | null;
}

export interface OnboardingInverterPayload {
  oem: "solis" | "growatt" | "sungrow" | "feston" | "suryalogix";
  model: string;
  serial_number: string;
  capacity_kw: number;
  string_count: number;
  datalogger_sn?: string | null;
}

export interface OnboardingCleaningPayload {
  cleaning_cycle_days: number;
  cleaning_location_id?: string | null;
  water_source_notes?: string | null;
}

export interface OnboardingContractPayload {
  contract_number: string;
  contract_type: ContractType;
  start_date: string; // YYYY-MM-DD
  duration_months: number;
  annual_value_inr: number;
  billing_frequency: BillingFrequency;
  sla_tier: SlaTier;
  auto_renew?: boolean;
}

export interface OnboardingRequest {
  site: OnboardingSitePayload;
  inverters: OnboardingInverterPayload[];
  cleaning: OnboardingCleaningPayload;
  contract: OnboardingContractPayload;
}

export interface OnboardingValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface OnboardingResult {
  success: boolean;
  site_id?: string;
  contract_id?: string;
  inverters_count?: number;
  strings_count?: number;
  message?: string;
  error?: string;
}

/**
 * Validates complete onboarding configuration before submission
 */
export function validateOnboardingPayload(payload: OnboardingRequest): OnboardingValidationResult {
  const errors: string[] = [];

  if (!payload) {
    return { isValid: false, errors: ["Onboarding payload is required"] };
  }

  // 1. Validate Site Details
  const s = payload.site;
  if (!s) {
    errors.push("Plant site details are missing");
  } else {
    if (!s.name || s.name.trim().length < 3) {
      errors.push("Plant name must be at least 3 characters long");
    }
    if (typeof s.capacity_kwp !== "number" || s.capacity_kwp <= 0) {
      errors.push("Installed DC capacity must be greater than 0 kWp");
    }
    if (!s.location || s.location.trim().length < 3) {
      errors.push("Plant geographic location/address is required");
    }
    if (typeof s.latitude !== "number" || s.latitude < -90 || s.latitude > 90) {
      errors.push("Valid latitude between -90 and 90 is required");
    }
    if (typeof s.longitude !== "number" || s.longitude < -180 || s.longitude > 180) {
      errors.push("Valid longitude between -180 and 180 is required");
    }
    if (s.grid_tariff_inr_per_kwh !== undefined && s.grid_tariff_inr_per_kwh !== null && s.grid_tariff_inr_per_kwh < 0) {
      errors.push("Grid tariff cannot be negative");
    }
  }

  // 2. Validate Inverters
  const inverters = payload.inverters;
  if (!Array.isArray(inverters) || inverters.length === 0) {
    errors.push("At least one solar inverter must be configured");
  } else {
    const snSet = new Set<string>();
    inverters.forEach((inv, idx) => {
      if (!inv.serial_number || inv.serial_number.trim().length === 0) {
        errors.push(`Inverter #${idx + 1} serial number is required`);
      } else {
        const cleanSn = inv.serial_number.trim().toUpperCase();
        if (snSet.has(cleanSn)) {
          errors.push(`Duplicate serial number ${cleanSn} detected across inverters`);
        }
        snSet.add(cleanSn);
      }
      if (typeof inv.capacity_kw !== "number" || inv.capacity_kw <= 0) {
        errors.push(`Inverter #${idx + 1} AC capacity must be positive`);
      }
      if (typeof inv.string_count !== "number" || inv.string_count < 1 || inv.string_count > 48) {
        errors.push(`Inverter #${idx + 1} string count must be between 1 and 48`);
      }
    });
  }

  // 3. Validate Cleaning Policy
  const cl = payload.cleaning;
  if (!cl) {
    errors.push("Cleaning policy settings are required");
  } else {
    if (!cl.cleaning_cycle_days || cl.cleaning_cycle_days < 7 || cl.cleaning_cycle_days > 90) {
      errors.push("Cleaning cycle frequency must be between 7 and 90 days");
    }
  }

  // 4. Validate Contract & SLA
  const c = payload.contract;
  if (!c) {
    errors.push("Contract and SLA parameters are required");
  } else {
    if (!c.contract_number || c.contract_number.trim().length < 2) {
      errors.push("Contract identification number is required");
    }
    if (!c.start_date || !/^\d{4}-\d{2}-\d{2}$/.test(c.start_date)) {
      errors.push("Contract start date must be in YYYY-MM-DD format");
    }
    if (typeof c.duration_months !== "number" || c.duration_months < 1 || c.duration_months > 120) {
      errors.push("Contract duration must be between 1 and 120 months");
    }
    if (typeof c.annual_value_inr !== "number" || c.annual_value_inr < 0) {
      errors.push("Contract annual AMC value cannot be negative");
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Generates default SLA policy specs based on selected tier
 */
export function generateDefaultSlaPolicy(
  contractId: string,
  orgId: string,
  tier: SlaTier
): Omit<SlaPolicy, "id" | "created_at"> {
  if (tier === "premium") {
    return {
      org_id: orgId,
      contract_id: contractId,
      tier_name: "premium",
      p1_response_hours: 2.0,
      p1_resolution_hours: 8.0,
      p2_response_hours: 6.0,
      p2_resolution_hours: 16.0,
      p3_response_hours: 12.0,
      p3_resolution_hours: 24.0,
      uptime_guarantee_percent: 99.0,
      penalty_per_hour_breach_inr: 1000.0,
    };
  }

  if (tier === "basic") {
    return {
      org_id: orgId,
      contract_id: contractId,
      tier_name: "basic",
      p1_response_hours: 8.0,
      p1_resolution_hours: 24.0,
      p2_response_hours: 24.0,
      p2_resolution_hours: 48.0,
      p3_response_hours: 48.0,
      p3_resolution_hours: 72.0,
      uptime_guarantee_percent: 95.0,
      penalty_per_hour_breach_inr: 250.0,
    };
  }

  // Standard Tier default
  return {
    org_id: orgId,
    contract_id: contractId,
    tier_name: "standard",
    p1_response_hours: 4.0,
    p1_resolution_hours: 12.0,
    p2_response_hours: 12.0,
    p2_resolution_hours: 24.0,
    p3_response_hours: 24.0,
    p3_resolution_hours: 48.0,
    uptime_guarantee_percent: 98.0,
    penalty_per_hour_breach_inr: 500.0,
  };
}

/**
 * Calculates contract end date from start date and duration months
 */
export function calculateContractEndDate(startDateStr: string, durationMonths: number): string {
  const d = new Date(`${startDateStr}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + durationMonths);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Calculates billing amount per cycle based on annual value and frequency
 */
export function calculateBillingAmountPerCycle(
  annualValueInr: number,
  frequency: BillingFrequency
): number {
  if (frequency === "monthly") return Number((annualValueInr / 12).toFixed(2));
  if (frequency === "quarterly") return Number((annualValueInr / 4).toFixed(2));
  return Number(annualValueInr.toFixed(2));
}

/**
 * Executes full plant provisioning in Supabase
 */
export async function executePlantOnboarding(
  serviceClient: any,
  orgId: string,
  payload: OnboardingRequest
): Promise<OnboardingResult> {
  const validation = validateOnboardingPayload(payload);
  if (!validation.isValid) {
    return {
      success: false,
      error: `Validation failed: ${validation.errors.join("; ")}`,
    };
  }

  try {
    // 1. Insert Site
    const { data: site, error: siteErr } = await serviceClient
      .from("sites")
      .insert({
        org_id: orgId,
        name: payload.site.name.trim(),
        capacity_kwp: Number(payload.site.capacity_kwp),
        location: payload.site.location.trim(),
        latitude: payload.site.latitude,
        longitude: payload.site.longitude,
        grid_tariff_inr_per_kwh: payload.site.grid_tariff_inr_per_kwh ?? null,
        service_tier: payload.site.service_tier,
        cleaning_cycle_days: payload.cleaning.cleaning_cycle_days,
        client_id: payload.site.client_id || null,
        client_org_id: payload.site.client_org_id || null,
        cleaning_location_id: payload.cleaning.cleaning_location_id || null,
        status: "active",
        commissioned_on: payload.contract.start_date,
        timezone: "UTC+05:30",
      })
      .select()
      .single();

    if (siteErr || !site) {
      throw new Error(`Failed to provision plant site record: ${siteErr?.message}`);
    }

    const siteId = site.id;

    // 2. Insert Inverters & Strings
    let totalStringsCreated = 0;
    for (const invPayload of payload.inverters) {
      const { data: inverter, error: invErr } = await serviceClient
        .from("inverters")
        .insert({
          site_id: siteId,
          oem: invPayload.oem,
          oem_device_id: invPayload.datalogger_sn || invPayload.serial_number,
          model: invPayload.model || `${invPayload.oem.toUpperCase()} ${invPayload.capacity_kw}kW`,
          serial_number: invPayload.serial_number.trim().toUpperCase(),
          capacity_kw: Number(invPayload.capacity_kw),
          string_count: invPayload.string_count,
          status: "online",
          installed_on: payload.contract.start_date,
        })
        .select()
        .single();

      if (invErr || !inverter) {
        throw new Error(`Failed to provision inverter ${invPayload.serial_number}: ${invErr?.message}`);
      }

      // Provision strings for this inverter
      const stringRows = [];
      const perStringKw = Number((invPayload.capacity_kw / invPayload.string_count).toFixed(2));
      for (let sIdx = 1; sIdx <= invPayload.string_count; sIdx++) {
        stringRows.push({
          inverter_id: inverter.id,
          string_index: sIdx,
          capacity_kw: perStringKw,
          status: "ok",
        });
      }

      if (stringRows.length > 0) {
        const { error: strErr } = await serviceClient.from("strings").insert(stringRows);
        if (strErr) {
          throw new Error(`Failed to provision strings for inverter ${inverter.id}: ${strErr.message}`);
        }
        totalStringsCreated += stringRows.length;
      }
    }

    // 3. Insert Site Cleaning Rule
    await serviceClient.from("site_cleaning_rules").insert({
      site_id: siteId,
      cleaning_frequency_days: payload.cleaning.cleaning_cycle_days,
      special_instructions: payload.cleaning.water_source_notes || "Standard preventive wet wash.",
      priority_level: "standard",
    });

    // 4. Insert Contract
    const endDate = calculateContractEndDate(payload.contract.start_date, payload.contract.duration_months);
    const cycleBillingAmount = calculateBillingAmountPerCycle(
      payload.contract.annual_value_inr,
      payload.contract.billing_frequency
    );

    const { data: contract, error: contractErr } = await serviceClient
      .from("contracts")
      .insert({
        org_id: orgId,
        site_id: siteId,
        client_org_id: payload.site.client_org_id || null,
        contract_number: payload.contract.contract_number.trim().toUpperCase(),
        contract_type: payload.contract.contract_type,
        start_date: payload.contract.start_date,
        end_date: endDate,
        status: "active",
        billing_frequency: payload.contract.billing_frequency,
        contract_value_inr: Number(payload.contract.annual_value_inr),
        billing_amount_per_cycle_inr: cycleBillingAmount,
        sla_tier: payload.contract.sla_tier,
        payment_terms_days: 30,
        auto_renew: Boolean(payload.contract.auto_renew),
        terms_notes: `Auto-generated via Phase 9 Onboarding Engine on ${new Date().toISOString().slice(0, 10)}.`,
      })
      .select()
      .single();

    if (contractErr || !contract) {
      throw new Error(`Failed to provision contract record: ${contractErr?.message}`);
    }

    // 5. Insert SLA Policy
    const slaPolicyPayload = generateDefaultSlaPolicy(contract.id, orgId, payload.contract.sla_tier);
    const { error: slaErr } = await serviceClient.from("sla_policies").insert(slaPolicyPayload);
    if (slaErr) {
      throw new Error(`Failed to provision SLA policy: ${slaErr.message}`);
    }

    return {
      success: true,
      site_id: siteId,
      contract_id: contract.id,
      inverters_count: payload.inverters.length,
      strings_count: totalStringsCreated,
      message: `Successfully onboarded ${payload.site.name} (${payload.site.capacity_kwp} kWp, ${payload.inverters.length} inverters, ${totalStringsCreated} strings, Contract #${payload.contract.contract_number})`,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "An unexpected error occurred during onboarding execution",
    };
  }
}

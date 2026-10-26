/**
 * SolarAssist Phase 8: Scale & Hardening Synthetic Benchmark Harness
 * 
 * Generates synthetic datasets (100, 500, 1000 sites) in an isolated,
 * in-memory environment, and profiles latency, throughput, memory,
 * query limits, and tenant isolation.
 */

import { verifyTestEnvironmentSafety } from "./scale-test-guard";
import { generateMonthlyCleaningPlan, MacroScheduleResult } from "../lib/cleaning-scheduler";
import { analyzeStringAnomalies, StringAnomaly } from "../lib/string-anomaly-engine";

export interface SyntheticSite {
  id: string;
  org_id: string;
  name: string;
  location: string;
  latitude: number;
  longitude: number;
  capacity_kwp: number;
  commissioned_on: string;
  cleaning_cycle_days: number;
  last_cleaned_on: string | null;
  next_cleaning_date: string | null;
  client_id?: string;
  client_org_id?: string;
  status: "active" | "inactive";
}

export interface SyntheticInverter {
  id: string;
  site_id: string;
  oem: string;
  oem_device_id: string;
  model: string;
  serial_number: string;
  capacity_kw: number;
  string_count: number;
  status: "online" | "offline" | "fault";
  last_seen_at: string;
}

export interface SyntheticString {
  id: string;
  inverter_id: string;
  string_index: number;
  capacity_kw: number;
  status: "active" | "inactive";
}

export interface SyntheticTelemetry {
  inverter_id: string;
  timestamp: string;
  ac_power_kw: number;
  dc_power_kw: number;
  energy_kwh: number;
  daily_generation_kwh: number;
  total_generation_kwh: number;
}

export interface SyntheticStringTelemetry {
  string_id: string;
  timestamp: string;
  voltage_v: number;
  current_a: number;
  power_kw: number;
  status: string;
}

export interface SyntheticTicket {
  id: string;
  org_id: string;
  site_id: string;
  inverter_id?: string;
  title: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "p1" | "p2" | "p3" | "p4";
  created_at: string;
}

export interface SyntheticDataset {
  tierName: string;
  orgs: Array<{ id: string; name: string }>;
  sites: SyntheticSite[];
  inverters: SyntheticInverter[];
  strings: SyntheticString[];
  telemetry: SyntheticTelemetry[];
  stringTelemetry: SyntheticStringTelemetry[];
  tickets: SyntheticTicket[];
  teams: any[];
  rules: any[];
}

export class IsolatedSyntheticDatabase {
  public dataset: SyntheticDataset;

  constructor(siteCount: 100 | 500 | 1000) {
    // 1. Enforce Safety Guard
    verifyTestEnvironmentSafety("mock://isolated-in-memory-test-db");

    console.log(`\n======================================================`);
    console.log(`[Isolated DB] Generating Synthetic Fleet: ${siteCount} Sites`);
    console.log(`======================================================`);

    const startMemory = process.memoryUsage().heapUsed / (1024 * 1024);
    const startTime = performance.now();

    this.dataset = this.generateDataset(siteCount);

    const elapsedMs = Math.round(performance.now() - startTime);
    const endMemory = process.memoryUsage().heapUsed / (1024 * 1024);

    console.log(`[Isolated DB] Generation Complete:`);
    console.log(`  - Sites: ${this.dataset.sites.length.toLocaleString()}`);
    console.log(`  - Inverters: ${this.dataset.inverters.length.toLocaleString()}`);
    console.log(`  - Strings: ${this.dataset.strings.length.toLocaleString()}`);
    console.log(`  - Telemetry Points: ${this.dataset.telemetry.length.toLocaleString()}`);
    console.log(`  - String Telemetry: ${this.dataset.stringTelemetry.length.toLocaleString()}`);
    console.log(`  - Tickets: ${this.dataset.tickets.length.toLocaleString()}`);
    console.log(`  - Memory Overhead: +${(endMemory - startMemory).toFixed(1)} MB (Heap: ${endMemory.toFixed(1)} MB)`);
    console.log(`  - Time Taken: ${elapsedMs} ms\n`);
  }

  private generateDataset(siteCount: number): SyntheticDataset {
    const orgs = [
      { id: "SYNTHETIC-ORG-EPC-ALPHA", name: "[SYNTHETIC TEST] Alpha Solar EPC" },
      { id: "SYNTHETIC-ORG-EPC-BETA", name: "[SYNTHETIC TEST] Beta Operations Co" },
    ];

    const sites: SyntheticSite[] = [];
    const inverters: SyntheticInverter[] = [];
    const strings: SyntheticString[] = [];
    const telemetry: SyntheticTelemetry[] = [];
    const stringTelemetry: SyntheticStringTelemetry[] = [];
    const tickets: SyntheticTicket[] = [];

    const now = new Date();
    const nowIso = now.toISOString();

    const CITIES = [
      { name: "Pune, Maharashtra", lat: 18.5204, lng: 73.8567 },
      { name: "Mumbai, Maharashtra", lat: 19.076, lng: 72.8777 },
      { name: "Ahmedabad, Gujarat", lat: 23.0225, lng: 72.5714 },
      { name: "Surat, Gujarat", lat: 21.1702, lng: 72.8311 },
      { name: "Bengaluru, Karnataka", lat: 12.9716, lng: 77.5946 },
      { name: "Hyderabad, Telangana", lat: 17.385, lng: 78.4867 },
      { name: "Jaipur, Rajasthan", lat: 26.9124, lng: 75.7873 },
      { name: "Chennai, Tamil Nadu", lat: 13.0827, lng: 80.2707 },
    ];

    // Generate Sites
    for (let i = 1; i <= siteCount; i++) {
      const siteId = `SYNTHETIC-SITE-${String(i).padStart(4, "0")}`;
      // 90% org Alpha, 10% org Beta for cross-tenant testing
      const orgId = i % 10 === 0 ? orgs[1].id : orgs[0].id;
      const city = CITIES[i % CITIES.length];
      const capacity = [100, 250, 500, 1000, 1200, 2500][i % 6];
      const cycleDays = [15, 30, 30, 45][i % 4];

      sites.push({
        id: siteId,
        org_id: orgId,
        name: `[TEST] Solar Plant #${i} (${city.name})`,
        location: city.name,
        latitude: city.lat + (Math.sin(i) * 0.05),
        longitude: city.lng + (Math.cos(i) * 0.05),
        capacity_kwp: capacity,
        commissioned_on: "2023-01-15",
        cleaning_cycle_days: cycleDays,
        last_cleaned_on: new Date(now.getTime() - (i % cycleDays) * 86400000).toISOString().slice(0, 10),
        next_cleaning_date: new Date(now.getTime() + (cycleDays - (i % cycleDays)) * 86400000).toISOString().slice(0, 10),
        status: "active",
      });

      // 3 inverters per site
      const invCount = capacity >= 1000 ? 4 : 2;
      for (let invIdx = 1; invIdx <= invCount; invIdx++) {
        const invId = `SYNTHETIC-INV-${siteId}-${invIdx}`;
        const isOffline = (i % 25 === 0 && invIdx === 1); // 4% offline rate

        inverters.push({
          id: invId,
          site_id: siteId,
          oem: "solis",
          oem_device_id: `SOLIS-${siteId}-${invIdx}`,
          model: "Solis-50K-HV-5G",
          serial_number: `SN-${siteId}-${invIdx}`,
          capacity_kw: Math.round(capacity / invCount),
          string_count: 8,
          status: isOffline ? "offline" : "online",
          last_seen_at: isOffline ? new Date(now.getTime() - 86400000).toISOString() : nowIso,
        });

        // 1 telemetry point per inverter
        telemetry.push({
          inverter_id: invId,
          timestamp: nowIso,
          ac_power_kw: isOffline ? 0 : Math.round((capacity / invCount) * 0.78),
          dc_power_kw: isOffline ? 0 : Math.round((capacity / invCount) * 0.82),
          energy_kwh: Math.round(capacity * 3.8),
          daily_generation_kwh: Math.round(capacity * 3.8),
          total_generation_kwh: 500000 + i * 1000,
        });

        // 8 strings per inverter
        for (let strIdx = 1; strIdx <= 8; strIdx++) {
          const strId = `SYNTHETIC-STR-${invId}-${strIdx}`;
          strings.push({
            id: strId,
            inverter_id: invId,
            string_index: strIdx,
            capacity_kw: 6.25,
            status: "active",
          });

          // Generate string telemetry (recent point)
          const isUnderperforming = (i % 15 === 0 && strIdx === 3);
          const currentA = isOffline ? 0 : isUnderperforming ? 2.1 : 8.8;
          const voltageV = isOffline ? 0 : 640;

          stringTelemetry.push({
            string_id: strId,
            timestamp: nowIso,
            voltage_v: voltageV,
            current_a: currentA,
            power_kw: (voltageV * currentA) / 1000,
            status: isOffline ? "offline" : isUnderperforming ? "underperforming" : "normal",
          });
        }
      }

      // Generate realistic tickets (approx 0.8 tickets per site across open, in_progress, resolved)
      if (i % 2 === 0) {
        tickets.push({
          id: `SYNTHETIC-TKT-${i}`,
          org_id: orgId,
          site_id: siteId,
          title: `[TEST] Inverter Performance Alert - Site ${i}`,
          status: i % 4 === 0 ? "open" : i % 4 === 1 ? "in_progress" : "resolved",
          priority: i % 10 === 0 ? "p1" : i % 5 === 0 ? "p2" : "p3",
          created_at: new Date(now.getTime() - (i % 30) * 86400000).toISOString(),
        });
      }
    }

    // 5 Standard Cleaning Teams
    const teams = [
      { id: "SYNTHETIC-TEAM-A", org_id: orgs[0].id, name: "[TEST] Team Alpha (North)", is_active: true, speed_multiplier: 1.0, max_daily_minutes: 480 },
      { id: "SYNTHETIC-TEAM-B", org_id: orgs[0].id, name: "[TEST] Team Beta (South)", is_active: true, speed_multiplier: 1.0, max_daily_minutes: 480 },
      { id: "SYNTHETIC-TEAM-C", org_id: orgs[0].id, name: "[TEST] Team Gamma (Central)", is_active: true, speed_multiplier: 1.1, max_daily_minutes: 480 },
      { id: "SYNTHETIC-TEAM-D", org_id: orgs[0].id, name: "[TEST] Team Delta (West)", is_active: true, speed_multiplier: 1.0, max_daily_minutes: 480 },
      { id: "SYNTHETIC-TEAM-E", org_id: orgs[0].id, name: "[TEST] Team E (Pune Dedicated)", is_active: true, speed_multiplier: 1.0, max_daily_minutes: 480 },
    ];

    // Standard rules for all sites
    const rules = sites.map((s) => ({
      site_id: s.id,
      is_configured: true,
      cycle_frequency_days: s.cleaning_cycle_days,
      preferred_days_of_week: [1, 2, 3, 4, 5, 6],
      fixed_time_minutes: 30,
      panel_count: Math.round(s.capacity_kwp * 2),
      time_per_panel_seconds: 15,
      water_availability: "onsite" as const,
      safety_briefing_minutes: 15,
      work_start_time: "08:00",
      work_end_time: "17:00",
    }));

    return {
      tierName: `${siteCount} Sites`,
      orgs,
      sites,
      inverters,
      strings,
      telemetry,
      stringTelemetry,
      tickets,
      teams,
      rules,
    };
  }
}

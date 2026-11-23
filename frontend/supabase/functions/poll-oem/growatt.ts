import {
  NormalizedStation,
  NormalizedDevice,
  NormalizedTelemetry,
  NormalizedStringTelemetry,
  NormalizedAlert,
  OemAdapter
} from "./types.ts";
import { translateAlert } from "./alarm_mappings.ts";

// Canonical hardware topology for the 16 Growatt plants & 15 inverters
export const GROWATT_KNOWN_PLANT_DEVICES: Record<
  string,
  Array<{
    device_sn: string;
    datalogger_sn: string;
    model_code: string;
    model_label: string;
    capacity_kw: number;
    string_count: number;
    installed_on: string;
  }>
> = {
  "2119971": [
    {
      device_sn: "BBJQEXU00E",
      datalogger_sn: "XGD6DC36PM",
      model_code: "S12B08D00T36P0FU01M012C",
      model_label: "Growatt MID 30KTL3-X",
      capacity_kw: 30.0,
      string_count: 3,
      installed_on: "2023-07-01"
    }
  ],
  "2474503": [
    {
      device_sn: "VQHGD5C013",
      datalogger_sn: "XGD6D4T1PB",
      model_code: "S12B08D00T02P0FU01M0096",
      model_label: "Growatt MOD 15KTL3-X",
      capacity_kw: 15.0,
      string_count: 2,
      installed_on: "2023-12-27"
    }
  ],
  "2474541": [
    {
      device_sn: "VGHGD6D01A",
      datalogger_sn: "XGD6D660A9",
      model_code: "S12B08D00T00P0FU01M0050",
      model_label: "Growatt MOD 8000TL3-X",
      capacity_kw: 8.0,
      string_count: 1,
      installed_on: "2024-02-16"
    }
  ],
  "2474589": [
    {
      device_sn: "VQHGD5C01E",
      datalogger_sn: "XGD6D4T1VQ",
      model_code: "S12B08D00T02P0FU01M0096",
      model_label: "Growatt MOD 15KTL3-X",
      capacity_kw: 15.0,
      string_count: 2,
      installed_on: "2024-01-28"
    }
  ],
  "2474616": [
    {
      device_sn: "VJHJD7403W",
      datalogger_sn: "XGD6D6E0TH",
      model_code: "S12B08D00T00P0FU01M0064",
      model_label: "Growatt MOD 10KTL3-X",
      capacity_kw: 10.0,
      string_count: 2,
      installed_on: "2024-01-17"
    }
  ],
  "2474705": [
    {
      device_sn: "VQHGD5C002",
      datalogger_sn: "XGD6D4T1TY",
      model_code: "S12B08D00T02P0FU01M0096",
      model_label: "Growatt MOD 15KTL3-X",
      capacity_kw: 15.0,
      string_count: 2,
      installed_on: "2023-12-27"
    }
  ],
  "2474727": [
    {
      device_sn: "VGHGD6D005",
      datalogger_sn: "XGD6D660FD",
      model_code: "S12B08D00T00P0FU01M0050",
      model_label: "Growatt MOD 8000TL3-X",
      capacity_kw: 8.0,
      string_count: 1,
      installed_on: "2024-01-17"
    }
  ],
  "2474815": [
    {
      device_sn: "VQHGD5C00W",
      datalogger_sn: "XGD6D66030",
      model_code: "S12B08D00T02P0FU01M0096",
      model_label: "Growatt MOD 15KTL3-X",
      capacity_kw: 15.0,
      string_count: 2,
      installed_on: "2024-01-17"
    }
  ],
  "2474834": [
    {
      device_sn: "VGHGD6D00R",
      datalogger_sn: "XGD6D4T1N3",
      model_code: "S12B08D00T00P0FU01M0050",
      model_label: "Growatt MOD 8000TL3-X",
      capacity_kw: 8.0,
      string_count: 1,
      installed_on: "2024-01-17"
    }
  ],
  "9284500": [
    {
      device_sn: "CJJLE5K036",
      datalogger_sn: "XGD6E4T0UT",
      model_code: "S12B08D00T00P0FU01M00C8",
      model_label: "Growatt MID 20KTL3-X",
      capacity_kw: 20.0,
      string_count: 2,
      installed_on: "2024-10-10"
    }
  ],
  "9284570": [
    {
      device_sn: "CLJLE5S04H",
      datalogger_sn: "XGD6E5F0FZ",
      model_code: "S12B08D00T00P0FU01M00FA",
      model_label: "Growatt MID 25KTL3-X",
      capacity_kw: 25.0,
      string_count: 2,
      installed_on: "2024-10-10"
    }
  ],
  "2535180": [
    {
      device_sn: "EAJFCM3018",
      datalogger_sn: "XGD5BGA166",
      model_code: "S12B08D00T02P0FU01M0078",
      model_label: "Growatt MOD 12KTL3-X",
      capacity_kw: 12.0,
      string_count: 2,
      installed_on: "2024-03-13"
    }
  ],
  "9222060": [
    {
      device_sn: "VEH3BKM015",
      datalogger_sn: "XGD6E4N0CD",
      model_code: "S12B08D00T00P0FU01M003C",
      model_label: "Growatt MOD 6000TL3-X",
      capacity_kw: 6.0,
      string_count: 2,
      installed_on: "2024-09-05"
    }
  ],
  "9242320": [
    {
      device_sn: "VEH3BJU0MG",
      datalogger_sn: "XGD5BJH4MB",
      model_code: "S12B08D00T00P0FU01M003C",
      model_label: "Growatt MOD 6000TL3-X",
      capacity_kw: 6.0,
      string_count: 2,
      installed_on: "2024-08-06"
    }
  ],
  "9307075": [
    {
      device_sn: "CLJLE5S01Q",
      datalogger_sn: "XGD6E5F0FT",
      model_code: "S12B08D00T00P0FU01M00FA",
      model_label: "Growatt MID 25KTL3-X",
      capacity_kw: 25.0,
      string_count: 2,
      installed_on: "2024-10-23"
    }
  ],
  "10107853": []
};

export function parseGrowattIstTimestamp(rawTime?: string | null): string {
  if (!rawTime) return new Date().toISOString();
  const trimmed = String(rawTime).trim();
  const isoCandidate = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  const withTz =
    isoCandidate.endsWith("Z") || isoCandidate.includes("+") || isoCandidate.slice(10).includes("-")
      ? isoCandidate
      : `${isoCandidate}+05:30`;
  const parsed = new Date(withTz);
  return isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function decodeGrowattCapacityKw(modelCode: string, fallbackKw = 15): number {
  const m = String(modelCode || "").match(/M([0-9A-Fa-f]{4})$/);
  if (m) {
    const val = parseInt(m[1], 16) / 10;
    if (val > 0 && val <= 500) return val;
  }
  return fallbackKw;
}

function formatGrowattModelName(modelCode: string, capacityKw: number): string {
  const series = capacityKw >= 20 ? "MID" : "MOD";
  const capLabel = capacityKw >= 10 ? `${capacityKw}KTL3-X` : `${capacityKw * 1000}TL3-X`;
  return `Growatt ${series} ${capLabel}`;
}

export class GrowattAdapter implements OemAdapter {
  private apiUrl: string;
  private token: string;
  private batchTelemetryCache: Record<string, Record<string, any>> = {};
  private plantStatusCache: Record<string, number> = {};
  private batchFetched = false;

  constructor(options: { apiUrl?: string; token?: string } = {}) {
    const getEnv = (k: string) => (typeof Deno !== "undefined" ? Deno.env.get(k) : undefined);
    this.apiUrl = (
      options.apiUrl ||
      getEnv("GROWATT_API_URL") ||
      "https://openapi.growatt.com/v1"
    ).replace(/\/$/, "");
    this.token =
      options.token ||
      getEnv("GROWATT_TOKEN") ||
      "0vlcyi6371401rzl2nfy322i2iz6fb05";
  }

  private async request<T>(
    path: string,
    method: "GET" | "POST" = "GET",
    body?: Record<string, string>
  ): Promise<T | null> {
    const url = `${this.apiUrl}${path.startsWith("/") ? path : `/${path}`}`;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const headers: Record<string, string> = { token: this.token };
        const opts: RequestInit = { method, headers };
        if (method === "POST" && body) {
          headers["Content-Type"] = "application/x-www-form-urlencoded";
          opts.body = new URLSearchParams(body).toString();
        }
        const res = await fetch(url, opts);
        if (!res.ok) return null;
        const json = await res.json();
        if (json?.error_code === 10012 && attempt < 3) {
          await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
          continue;
        }
        return json as T;
      } catch (err) {
        console.error(`[GrowattAdapter] Error on ${method} ${path}:`, err);
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    }
    return null;
  }

  private async ensureBatchTelemetry(): Promise<void> {
    if (this.batchFetched) return;
    this.batchFetched = true;

    const allKnownSns: string[] = [];
    for (const devList of Object.values(GROWATT_KNOWN_PLANT_DEVICES)) {
      for (const dev of devList) {
        if (dev.device_sn && !allKnownSns.includes(dev.device_sn)) {
          allKnownSns.push(dev.device_sn);
        }
      }
    }
    if (allKnownSns.length === 0) return;

    type BatchResp = {
      error_code?: number;
      data?: Record<string, Record<string, any>>;
    };
    const res = await this.request<BatchResp>("/device/inverter/invs_data", "POST", {
      inverters: allKnownSns.join(","),
      pageNum: "1"
    });

    if (res?.error_code === 0 && res.data) {
      for (const sn of allKnownSns) {
        const outer = res.data[sn];
        const inner = outer?.[sn] || outer;
        if (inner && typeof inner === "object") {
          this.batchTelemetryCache[sn] = {
            ...inner,
            dataloggerSn: outer?.dataloggerSn || inner.dataloggerSn || ""
          };
        }
      }
    }
  }

  async listStations(): Promise<NormalizedStation[]> {
    await this.ensureBatchTelemetry();

    type PlantListResp = {
      error_code?: number;
      data?: {
        plants?: Array<Record<string, any>>;
      };
    };

    const res = await this.request<PlantListResp>("/plant/list", "GET");
    const plants = res?.data?.plants || [];

    return plants.map((p) => {
      const pid = String(p.plant_id || "");
      this.plantStatusCache[pid] = Number(p.status ?? 1);
      const city = String(p.city || "").trim();
      const country = String(p.country || "India").trim();
      const location = city ? `${city}, Maharashtra, ${country}` : `Maharashtra, ${country}`;
      const lat = parseFloat(String(p.latitude || "19.03"));
      const lng = parseFloat(String(p.longitude || "73.06"));

      return {
        plant_id: pid,
        name: String(p.name || `Growatt Plant ${pid}`).trim(),
        capacity_kwp: Math.round(Number(p.peak_power || 10) * 100) / 100,
        location,
        timezone: "Asia/Kolkata",
        commissioned_on: p.create_date ? String(p.create_date).slice(0, 10) : "2024-01-17",
        latitude: !isNaN(lat) ? lat : 19.03,
        longitude: !isNaN(lng) ? lng : 73.06
      };
    });
  }

  async listDevices(plantId: string): Promise<NormalizedDevice[]> {
    await this.ensureBatchTelemetry();

    const pid = String(plantId);
    const plantStatus = this.plantStatusCache[pid];
    const known = GROWATT_KNOWN_PLANT_DEVICES[pid];

    if (known !== undefined) {
      return known.map((dev) => {
        const live = this.batchTelemetryCache[dev.device_sn];
        const lastSeenAt = live?.time
          ? parseGrowattIstTimestamp(live.time)
          : new Date(0).toISOString();
        const diffMins = (Date.now() - new Date(lastSeenAt).getTime()) / (1000 * 60);
        const isOffline = plantStatus === 4 || diffMins > 14 * 60 || live?.status === -1;
        const isFault =
          !isOffline &&
          (live?.status === 3 ||
            Number(live?.faultType || 0) > 0 ||
            Number(live?.faultCode1 || 0) > 0);

        let status = "online";
        if (isOffline) {
          status = "offline";
        } else if (isFault) {
          status = "fault";
        } else if (diffMins <= 120 && Number(live?.pac || 0) > 50) {
          status = "online";
        } else {
          status = "standby";
        }

        return {
          oem_device_id: dev.device_sn,
          model: dev.model_label,
          serial_number: dev.device_sn,
          capacity_kw: dev.capacity_kw,
          string_count: dev.string_count,
          status,
          last_seen_at: lastSeenAt,
          installed_on: dev.installed_on
        };
      });
    }

    // Fallback dynamic discovery for any new Growatt plant added in the future
    type DevListResp = {
      error_code?: number;
      data?: {
        devices?: Array<Record<string, any>>;
      };
    };
    const res = await this.request<DevListResp>(`/device/list?plant_id=${pid}`, "GET");
    const rawDevs = res?.data?.devices || [];
    const seen = new Set<string>();
    const out: NormalizedDevice[] = [];

    for (const d of rawDevs) {
      const sn = String(d.device_sn || "").trim();
      if (!sn || seen.has(sn)) continue;
      seen.add(sn);

      const modelCode = String(d.model || "");
      const capKw = decodeGrowattCapacityKw(modelCode, 15.0);
      const stringCount = capKw >= 30 ? 3 : capKw === 8 ? 1 : 2;
      const lastSeenAt = parseGrowattIstTimestamp(d.last_update_time);
      const isLost = Boolean(d.lost) || Number(d.status) === -1 || plantStatus === 4;

      out.push({
        oem_device_id: sn,
        model: formatGrowattModelName(modelCode, capKw),
        serial_number: sn,
        capacity_kw: capKw,
        string_count: stringCount,
        status: isLost ? "offline" : Number(d.status) === 3 ? "fault" : "online",
        last_seen_at: lastSeenAt
      });
    }

    return out;
  }

  async fetchTelemetry(
    deviceId: string
  ): Promise<[NormalizedTelemetry | null, NormalizedStringTelemetry[]]> {
    await this.ensureBatchTelemetry();

    let d = this.batchTelemetryCache[deviceId];
    if (!d) {
      type SingleResp = { error_code?: number; data?: Record<string, any> };
      const single = await this.request<SingleResp>(
        `/device/inverter/last_new_data?device_sn=${deviceId}`,
        "GET"
      );
      if (single?.error_code === 0 && single.data) {
        d = single.data;
        this.batchTelemetryCache[deviceId] = d;
      }
    }

    if (!d || !d.time) {
      return [null, []];
    }

    const tsIso = parseGrowattIstTimestamp(d.time);
    const diffMins = (Date.now() - new Date(tsIso).getTime()) / (1000 * 60);

    // Find device definition for capacity & string count
    let capKw = 15.0;
    let stringCount = 2;
    for (const devList of Object.values(GROWATT_KNOWN_PLANT_DEVICES)) {
      const found = devList.find((x) => x.device_sn === deviceId);
      if (found) {
        capKw = found.capacity_kw;
        stringCount = found.string_count;
        break;
      }
    }

    const acPowerKw = Math.round((Number(d.pac ?? d.power ?? 0) / 1000) * 1000) / 1000;
    const dcPowerKw = Math.round((Number(d.ppv ?? 0) / 1000) * 1000) / 1000;
    const dailyGenKwh = Math.round(Number(d.powerToday ?? d.today_energy ?? d.eacToday ?? 0) * 100) / 100;
    const totalGenKwh = Math.round(Number(d.powerTotal ?? d.total_energy ?? d.eacTotal ?? 0) * 100) / 100;
    const effPct =
      dcPowerKw > 0.05
        ? Math.round(Math.min(99.5, Math.max(0, (acPowerKw / dcPowerKw) * 100)) * 100) / 100
        : 98.2;
    const tempC = Math.round(Number(d.temperature ?? d.temperature2 ?? d.temperature3 ?? 35) * 10) / 10;
    const specificYield = capKw > 0 ? Math.round((dailyGenKwh / capKw) * 100) / 100 : 0.0;
    const isOnline = diffMins <= 120 && Number(d.status) !== -1;

    const voltageR = Number(d.vacr ?? d.vac1 ?? 0) || null;
    const voltageS = Number(d.vacs ?? d.vac2 ?? 0) || null;
    const voltageT = Number(d.vact ?? d.vac3 ?? 0) || null;
    const currentR = Number(d.iacr ?? d.iac1 ?? 0) || null;
    const currentS = Number(d.iacs ?? d.iac2 ?? 0) || null;
    const currentT = Number(d.iact ?? d.iac3 ?? 0) || null;
    const freqHz = Number(d.fac ?? 0) || null;
    const pf = Number(d.pf ?? d.power_factor ?? 1);
    const reactiveKvar = Number(d.rac ?? d.reactPower ?? 0) / 1000;
    const apparentKva =
      (Number(d.pacr || 0) + Number(d.pacs || 0) + Number(d.pact || 0)) / 1000 || acPowerKw;

    const metrics: Record<string, any> = {
      oem: "growatt",
      status_code: d.status,
      status_text: d.statusText || (d.status === 1 ? "Normal" : d.status === 0 ? "Waiting" : "Fault"),
      datalogger_sn: d.dataloggerSn || "",
      epv_total_kwh: Number(d.epvTotal || 0),
      time_total_hours: Number(d.timeTotal || 0),
      op_fullwatt_w: Number(d.opFullwatt || 0),
      real_op_percent: Number(d.realOPPercent || 0),
      derating_mode: Number(d.deratingMode || 0),
      p_bus_voltage_v: Number(d.pBusVoltage || 0),
      n_bus_voltage_v: Number(d.nBusVoltage || 0),
      pv_iso_kohm: Number(d.pvIso || 0),
      gfci_ma: Number(d.gfci || 0),
      dci_r_ma: Number(d.rDci || 0),
      dci_s_ma: Number(d.sDci || 0),
      dci_t_ma: Number(d.tDci || 0),
      vac_rs_v: Number(d.vacRs || 0),
      vac_st_v: Number(d.vacSt || 0),
      vac_tr_v: Number(d.vacTr || 0),
      pac_r_w: Number(d.pacr || 0),
      pac_s_w: Number(d.pacs || 0),
      pac_t_w: Number(d.pact || 0),
      temperature_1_c: Number(d.temperature || 0),
      temperature_2_c: Number(d.temperature2 || 0),
      temperature_3_c: Number(d.temperature3 || 0),
      ipm_temperature_c: Number(d.ipmTemperature || 0),
      fault_type: Number(d.faultType || 0),
      fault_value: Number(d.faultValue || 0),
      fault_code_1: Number(d.faultCode1 || 0),
      fault_code_2: Number(d.faultCode2 || 0),
      warn_code: Number(d.warnCode || 0),
      warn_bit: Number(d.warnBit || 0),
      warning_value_1: Number(d.warningValue1 || 0),
      warning_value_2: Number(d.warningValue2 || 0),
      warning_value_3: Number(d.warningValue3 || 0),
      pid_fault_code: Number(d.pidFaultCode || 0),
      str_fault: Number(d.strFault || 0),
      str_break: Number(d.strBreak || 0),
      str_unmatch: Number(d.strUnmatch || 0),
      str_unbalance: Number(d.strUnblance ?? d.StrUnblance ?? 0)
    };

    for (let i = 1; i <= 8; i++) {
      if (d[`vpv${i}`] || d[`ipv${i}`] || d[`ppv${i}`] || d[`epv${i}Total`]) {
        metrics[`mppt_${i}_v`] = Number(d[`vpv${i}`] || 0);
        metrics[`mppt_${i}_a`] = Number(d[`ipv${i}`] || 0);
        metrics[`mppt_${i}_w`] = Number(d[`ppv${i}`] || 0);
        metrics[`epv_${i}_today_kwh`] = Number(d[`epv${i}Today`] || 0);
        metrics[`epv_${i}_total_kwh`] = Number(d[`epv${i}Total`] || 0);
      }
    }
    for (let i = 1; i <= 8; i++) {
      if (d[`vString${i}`] || d[`currentString${i}`]) {
        metrics[`v_string_${i}`] = Number(d[`vString${i}`] || 0);
        metrics[`i_string_${i}`] = Number(d[`currentString${i}`] || 0);
      }
    }

    const telemetry: NormalizedTelemetry = {
      timestamp: tsIso,
      ac_power_kw: acPowerKw,
      dc_power_kw: dcPowerKw,
      energy_kwh: dailyGenKwh,
      efficiency_pct: effPct,
      temperature_c: tempC,
      daily_generation_kwh: dailyGenKwh,
      total_generation_kwh: totalGenKwh,
      specific_yield: specificYield,
      online_status: isOnline,
      last_update: tsIso,
      frequency_hz: freqHz,
      reactive_power_kvar: Math.round(reactiveKvar * 1000) / 1000,
      power_factor: pf,
      current_r_a: currentR,
      current_s_a: currentS,
      current_t_a: currentT,
      voltage_r_v: voltageR,
      voltage_s_v: voltageS,
      voltage_t_v: voltageT,
      apparent_power_kva: Math.round(apparentKva * 1000) / 1000,
      metrics
    };

    const stringTelemetries: NormalizedStringTelemetry[] = [];
    for (let idx = 1; idx <= stringCount; idx++) {
      const v = Math.round(Number(d[`vpv${idx}`] || 0) * 100) / 100;
      const a = Math.round(Number(d[`ipv${idx}`] || 0) * 100) / 100;
      const rawP = Number(d[`ppv${idx}`] || 0) / 1000;
      const p = Math.round((rawP > 0 ? rawP : (v * a) / 1000) * 1000) / 1000;

      stringTelemetries.push({
        string_index: idx,
        voltage_v: v,
        current_a: a,
        power_kw: p,
        status: v > 0 || a > 0 ? "ok" : "offline",
        metrics: {
          epv_today_kwh: Number(d[`epv${idx}Today`] || 0),
          epv_total_kwh: Number(d[`epv${idx}Total`] || 0)
        }
      });
    }

    return [telemetry, stringTelemetries];
  }

  async fetchAlerts(plantId: string): Promise<NormalizedAlert[] | null> {
    await this.ensureBatchTelemetry();

    const pid = String(plantId);
    const knownDevs = GROWATT_KNOWN_PLANT_DEVICES[pid] || [];
    const alerts: NormalizedAlert[] = [];

    for (const dev of knownDevs) {
      const sn = dev.device_sn;
      const d = this.batchTelemetryCache[sn];
      if (!d || !d.time) continue;

      const tsIso = parseGrowattIstTimestamp(d.time);
      const diffMins = (Date.now() - new Date(tsIso).getTime()) / (1000 * 60);

      // Only raise live hardware faults if telemetry is from today (< 14 hours)
      if (diffMins <= 14 * 60) {
        const rawCodes: Array<{ code: string; defaultTitle: string }> = [];
        if (Number(d.faultType || 0) > 0) {
          rawCodes.push({
            code: String(d.faultType),
            defaultTitle: `Growatt Fault ${d.faultType}`
          });
        }
        if (Number(d.faultCode1 || 0) > 0 && Number(d.faultCode1) !== Number(d.faultType)) {
          rawCodes.push({
            code: String(d.faultCode1),
            defaultTitle: `Growatt Fault ${d.faultCode1}`
          });
        }
        if (Number(d.warnCode || 0) > 0) {
          rawCodes.push({
            code: String(d.warnCode),
            defaultTitle: `Growatt Warning ${d.warnCode}`
          });
        }
        // In Growatt firmware, strBreak is a bitmask of unpopulated physical terminals (e.g. 4 for 2-string setups)
        // and must NOT be treated as a fault. Only actual strFault or warnCode 500 represents an abnormal string.
        if (Number(d.strFault || 0) > 0) {
          rawCodes.push({
            code: "500",
            defaultTitle: "PV String Disconnected / Abnormal"
          });
        }

        for (const rc of rawCodes) {
          const translated = translateAlert("growatt", rc.code, rc.defaultTitle);
          alerts.push({
            code: `GROWATT_${rc.code}`,
            title: translated.title,
            description: `${translated.description} (Device SN: ${sn})`,
            severity: translated.severity,
            triggered_at: tsIso,
            alarm_code: rc.code,
            oem: "growatt",
            category: translated.category,
            is_auto_resolvable: translated.is_auto_resolvable,
            requires_technician: translated.requires_technician,
            recommended_action: translated.recommended_action
          });
        }
      }
    }

    return alerts;
  }
}


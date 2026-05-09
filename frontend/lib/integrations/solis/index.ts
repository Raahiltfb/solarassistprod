import crypto from "node:crypto";
import type {
  OemAdapter,
  NormalizedDevice,
  NormalizedTelemetry,
  NormalizedAlert,
} from "../types";

const API_URL =
  process.env.SOLIS_API_URL || "https://www.soliscloud.com:13333";

const KEY_ID = process.env.SOLIS_KEY_ID || "";
const KEY_SECRET = process.env.SOLIS_KEY_SECRET || "";

function sign(
  method: string,
  contentMd5: string,
  contentType: string,
  date: string,
  path: string
) {
  const stringToSign = `${method}\n${contentMd5}\n${contentType}\n${date}\n${path}`;

  const hmac = crypto
    .createHmac("sha1", KEY_SECRET)
    .update(Buffer.from(stringToSign, "utf8"))
    .digest("base64");

  return `API ${KEY_ID}:${hmac}`;
}

async function callSolis<T>(
  path: string,
  body: Record<string, unknown>
): Promise<T | null> {
  if (!KEY_ID || !KEY_SECRET) {
    console.log("Missing Solis credentials");
    return null;
  }

  const json = JSON.stringify(body);

  const contentMd5 = crypto
    .createHash("md5")
    .update(Buffer.from(json, "utf8"))
    .digest("base64");

  const contentType = "application/json";

  const date = new Date().toUTCString();

  const auth = sign(
    "POST",
    contentMd5,
    contentType,
    date,
    path
  );

  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      "Content-MD5": contentMd5,
      Date: date,
      Authorization: auth,
    },
    body: json,
  });

  if (!res.ok) {
    console.log("SOLIS ERROR:", res.status);
    console.log(await res.text());
    return null;
  }

  return (await res.json()) as T;
}

export const solisAdapter: OemAdapter = {
  provider: "solis",

  async listDevices(
    plantId: string
  ): Promise<NormalizedDevice[]> {
    type Resp = {
      data?: {
        page?: {
          records?: Array<Record<string, unknown>>;
        };
      };
    };

    const r = await callSolis<Resp>(
      "/v1/api/inverterList",
      {
        stationId: plantId,
        pageNo: 1,
        pageSize: 100,
      }
    );

    const records = r?.data?.page?.records ?? [];

    return records.map((d) => ({
      oem_device_id: String(d.id ?? d.sn ?? ""),
      model: String(d.machine ?? d.model ?? "Solis"),
      serial_number: String(d.sn ?? ""),
      capacity_kw: Number(d.power ?? 0) / 1000,
      string_count: Number(d.stringCount ?? 4),
      installed_on: new Date()
        .toISOString()
        .slice(0, 10),
    }));
  },

  async fetchTelemetry(
    deviceId: string
  ): Promise<NormalizedTelemetry[]> {
    type Resp = {
      data?: Record<string, unknown>;
    };

    const r = await callSolis<Resp>(
      "/v1/api/inverterDetail",
      {
        id: deviceId,
      }
    );

    const d = r?.data ?? {};

    return [
      {
        oem_device_id: deviceId,
        timestamp: new Date().toISOString(),
        ac_power_kw: Number(d.pac ?? 0),
        dc_power_kw: Number(
          d.dcPac ?? d.pac ?? 0
        ),
        energy_kwh: Number(d.eToday ?? 0),
        efficiency_pct: Number(
          d.efficiency ?? 95
        ),
        temperature_c: Number(
          d.inverterTemperature ?? 35
        ),
        status:
          d.state === "1" || d.state === 1
            ? "online"
            : "offline",
        fault_codes: [],
      },
    ];
  },

  async fetchAlerts(
    deviceId: string
  ): Promise<NormalizedAlert[]> {
    type Resp = {
      data?: {
        records?: Array<Record<string, unknown>>;
      };
    };

    const r = await callSolis<Resp>(
      "/v1/api/alarmList",
      {
        sn: deviceId,
        pageNo: 1,
        pageSize: 5,
      }
    );

    const records = r?.data?.records ?? [];

    return records.map((a) => ({
      oem_device_id: deviceId,
      code: String(
        a.alarmCode ?? "UNKNOWN"
      ),
      title: String(
        a.alarmMsg ??
          a.alarmName ??
          "Solis fault"
      ),
      description: a.advice
        ? String(a.advice)
        : undefined,
      severity: "high",
      triggered_at: a.alarmBeginTime
        ? new Date(
            Number(a.alarmBeginTime)
          ).toISOString()
        : new Date().toISOString(),
    }));
  },
};
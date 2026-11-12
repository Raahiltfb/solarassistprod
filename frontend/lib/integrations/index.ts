import { solisAdapter } from "./solis";
import { growattAdapter } from "./growatt";
import { sungrowAdapter } from "./sungrow";
import { suryalogixAdapter } from "./suryalogix";
import type { OemAdapter } from "./types";

export type OemProvider = "solis" | "growatt" | "sungrow" | "suryalogix";

export const adapters: Record<OemProvider, OemAdapter> = {
  solis: solisAdapter,
  growatt: growattAdapter,
  sungrow: sungrowAdapter,
  suryalogix: suryalogixAdapter,
};

export type { OemAdapter } from "./types";

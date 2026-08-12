import { solisAdapter } from "./solis";
import { growattAdapter } from "./growatt";
import { sungrowAdapter } from "./sungrow";
import type { OemAdapter } from "./types";

export type OemProvider = "solis" | "growatt" | "sungrow";

export const adapters: Record<OemProvider, OemAdapter> = {
  solis: solisAdapter,
  growatt: growattAdapter,
  sungrow: sungrowAdapter,
};

export type { OemAdapter } from "./types";

"use client";
import { create } from "zustand";
import type { Profile, Organization } from "./types";

interface AppState {
  user: Profile | null;
  org: Organization | null;
  selectedSiteId: string | null;
  theme: "light" | "dark";
  setUser: (u: Profile | null) => void;
  setOrg: (o: Organization | null) => void;
  setSelectedSite: (id: string | null) => void;
  toggleTheme: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  org: null,
  selectedSiteId: null,
  theme: "light",
  setUser: (user) => set({ user }),
  setOrg: (org) => set({ org }),
  setSelectedSite: (selectedSiteId) => set({ selectedSiteId }),
  toggleTheme: () => set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),
}));

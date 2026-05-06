import type { Role } from "./types";

export type Permission =
  | "site.view" | "site.manage"
  | "alert.view" | "alert.ack" | "alert.manage"
  | "ticket.view" | "ticket.create" | "ticket.assign" | "ticket.update"
  | "cleaning.view" | "cleaning.log"
  | "user.view" | "user.manage"
  | "org.manage" | "report.view" | "settings.manage";

const PERMISSIONS: Record<Role, Permission[]> = {
  super_admin: [
    "site.view", "site.manage", "alert.view", "alert.ack", "alert.manage",
    "ticket.view", "ticket.create", "ticket.assign", "ticket.update",
    "cleaning.view", "cleaning.log", "user.view", "user.manage",
    "org.manage", "report.view", "settings.manage",
  ],
  epc_admin: [
    "site.view", "site.manage", "alert.view", "alert.ack", "alert.manage",
    "ticket.view", "ticket.create", "ticket.assign", "ticket.update",
    "cleaning.view", "cleaning.log", "user.view", "user.manage",
    "report.view", "settings.manage",
  ],
  technician: [
    "site.view", "alert.view", "alert.ack",
    "ticket.view", "ticket.update",
    "cleaning.view", "cleaning.log",
    "report.view",
  ],
  client: [
    "site.view", "alert.view", "ticket.view", "cleaning.view", "report.view",
  ],
};

export function hasPermission(role: Role | undefined, permission: Permission): boolean {
  if (!role) return false;
  return PERMISSIONS[role]?.includes(permission) ?? false;
}

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  epc_admin: "EPC Admin",
  technician: "Field Technician",
  client: "Client",
};

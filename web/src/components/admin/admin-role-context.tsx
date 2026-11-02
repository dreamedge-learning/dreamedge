"use client";

import { createContext, useContext } from "react";

import type { AdminRole } from "@/lib/auth-guard";

/**
 * The signed-in admin's role, available to any client component in the panel.
 *
 * The role already reaches the shell from the layout; without this, every page
 * that wants to hide a control from the wrong role would have to thread it
 * down as a prop, and the export button sits on nineteen different lists.
 *
 * It decides what to render, never what is allowed — the server actions and
 * the export route re-check with `assertAdmin`.
 */
const AdminRoleContext = createContext<AdminRole | null>(null);

export function AdminRoleProvider({
  role,
  children,
}: {
  role: AdminRole;
  children: React.ReactNode;
}) {
  return <AdminRoleContext.Provider value={role}>{children}</AdminRoleContext.Provider>;
}

export function useAdminRole(): AdminRole | null {
  return useContext(AdminRoleContext);
}

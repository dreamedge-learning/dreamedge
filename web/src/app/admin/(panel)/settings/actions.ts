"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { assertAdmin } from "@/lib/auth-guard";
import { sanitizeSearch } from "@/lib/search";
import { rangeEnd, rangeStart } from "@/lib/date-range";
import type { Json } from "@/types/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminTeamRow {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  role_id: string;
  roles: { id: string; name: string; description: string | null } | null;
}

export interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  permissions: Record<string, boolean>;
  created_at: string;
  admin_count: number;
}

export interface AuditLogRow {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export interface SiteSetting {
  key: string;
  value: unknown;
  updated_at: string;
  updated_by: string | null;
}

export interface AdminUserLite {
  id: string;
  user_id: string;
  full_name: string;
}

// ---------------------------------------------------------------------------
// Admin Team
// ---------------------------------------------------------------------------

export async function getAdminTeam(filters: {
  page?: number;
  pageSize?: number;
  search?: string;
} = {}) {
  try {
    await assertAdmin(["super_admin", "technical"]);
    const supabase = await createClient();

    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 10;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("admin_users")
      .select(
        `id, user_id, full_name, email, phone, is_active, last_login_at, created_at,
         role_id, roles(id, name, description)`,
        { count: "exact" }
      )
      .order("created_at", { ascending: false });

    if (filters.search) {
      const safe = sanitizeSearch(filters.search);
      if (safe) {
        query = query.or(
          `full_name.ilike.%${safe}%,email.ilike.%${safe}%`
        );
      }
    }

    const { data, count, error } = await query.range(from, to);

    if (error) {
      return { data: null, count: 0, error: error.message };
    }

    const rows: AdminTeamRow[] = (data ?? []).map((row) => ({
      id: row.id,
      user_id: row.user_id,
      full_name: row.full_name,
      email: row.email,
      phone: row.phone,
      is_active: row.is_active,
      last_login_at: row.last_login_at,
      created_at: row.created_at,
      role_id: row.role_id,
      roles: row.roles as unknown as AdminTeamRow["roles"],
    }));

    return { data: rows, count: count ?? 0, error: null };
  } catch {
    return { data: null, count: 0, error: "You don't have permission to perform this action." };
  }
}

export async function inviteAdmin(formData: FormData) {
  try {
    const { adminUser } = await assertAdmin(["super_admin", "technical"]);
    const supabase = await createClient();
    const service = createServiceClient();

    const fullName = (formData.get("full_name") as string)?.trim();
    const email = (formData.get("email") as string)?.trim().toLowerCase();
    const phone = (formData.get("phone") as string)?.trim() || null;
    const roleId = formData.get("role_id") as string;

    if (!fullName || !email || !roleId) {
      return { error: "Name, email, and role are required." };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return { error: "Please enter a valid email address." };
    }

    const { data: existing } = await supabase
      .from("admin_users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      return { error: "An admin with this email already exists." };
    }

    const tempPassword = `DE_${Math.random().toString(36).slice(2, 10)}!${Date.now().toString(36).slice(-4)}`;

    const { data: authUser, error: authError } = await service.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (authError || !authUser.user) {
      return { error: authError?.message ?? "Failed to create auth user." };
    }

    const { error: insertError } = await supabase
      .from("admin_users")
      .insert({
        user_id: authUser.user.id,
        full_name: fullName,
        email,
        phone,
        role_id: roleId,
        is_active: true,
      });

    if (insertError) {
      await service.auth.admin.deleteUser(authUser.user.id);
      return { error: insertError.message };
    }

    await supabase.from("audit_log").insert({
      user_id: adminUser.user_id,
      action: "invite",
      entity_type: "admin_user",
      entity_id: authUser.user.id,
      new_data: { full_name: fullName, email, role_id: roleId },
    });

    revalidatePath("/admin/settings");
    return { data: { tempPassword }, error: null };
  } catch {
    return { error: "You don't have permission to perform this action." };
  }
}

export async function updateAdmin(id: string, formData: FormData) {
  try {
    const { adminUser } = await assertAdmin(["super_admin", "technical"]);
    const supabase = await createClient();

    const fullName = (formData.get("full_name") as string)?.trim();
    const phone = (formData.get("phone") as string)?.trim() || null;
    const roleId = formData.get("role_id") as string;

    if (!fullName || !roleId) {
      return { error: "Name and role are required." };
    }

    const { data: target, error: fetchError } = await supabase
      .from("admin_users")
      .select("id, user_id, role_id, roles(name)")
      .eq("id", id)
      .single();

    if (fetchError || !target) {
      return { error: "Admin user not found." };
    }

    const currentRoleName = (target.roles as unknown as { name: string })?.name;

    if (currentRoleName === "super_admin" && roleId !== target.role_id) {
      const { count } = await supabase
        .from("admin_users")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("role_id", target.role_id);

      if ((count ?? 0) <= 1) {
        return { error: "Cannot change role of the last active super admin." };
      }
    }

    const { error: updateError } = await supabase
      .from("admin_users")
      .update({ full_name: fullName, phone, role_id: roleId })
      .eq("id", id);

    if (updateError) {
      return { error: updateError.message };
    }

    await supabase.from("audit_log").insert({
      user_id: adminUser.user_id,
      action: "update",
      entity_type: "admin_user",
      entity_id: target.user_id,
      new_data: { full_name: fullName, phone, role_id: roleId },
    });

    revalidatePath("/admin/settings");
    return { error: null };
  } catch {
    return { error: "You don't have permission to perform this action." };
  }
}

export async function toggleAdminActive(id: string) {
  try {
    const { adminUser } = await assertAdmin(["super_admin", "technical"]);
    const supabase = await createClient();

    const { data: target, error: fetchError } = await supabase
      .from("admin_users")
      .select("id, user_id, is_active, role_id, roles(name)")
      .eq("id", id)
      .single();

    if (fetchError || !target) {
      return { error: "Admin user not found." };
    }

    if (target.user_id === adminUser.user_id) {
      return { error: "You cannot deactivate yourself." };
    }

    const roleName = (target.roles as unknown as { name: string })?.name;

    if (target.is_active && roleName === "super_admin") {
      const { count } = await supabase
        .from("admin_users")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("role_id", target.role_id);

      if ((count ?? 0) <= 1) {
        return { error: "Cannot deactivate the last active super admin." };
      }
    }

    const { error: updateError } = await supabase
      .from("admin_users")
      .update({ is_active: !target.is_active })
      .eq("id", id);

    if (updateError) {
      return { error: updateError.message };
    }

    await supabase.from("audit_log").insert({
      user_id: adminUser.user_id,
      action: "toggle_active",
      entity_type: "admin_user",
      entity_id: target.user_id,
      new_data: { is_active: !target.is_active },
    });

    revalidatePath("/admin/settings");
    return { error: null };
  } catch {
    return { error: "You don't have permission to perform this action." };
  }
}

export async function deleteAdmin(id: string) {
  try {
    const { adminUser } = await assertAdmin(["super_admin", "technical"]);
    const supabase = await createClient();

    const { data: target, error: fetchError } = await supabase
      .from("admin_users")
      .select("id, user_id, role_id, roles(name)")
      .eq("id", id)
      .single();

    if (fetchError || !target) {
      return { error: "Admin user not found." };
    }

    if (target.user_id === adminUser.user_id) {
      return { error: "You cannot delete yourself." };
    }

    const roleName = (target.roles as unknown as { name: string })?.name;

    if (roleName === "super_admin") {
      const { count } = await supabase
        .from("admin_users")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("role_id", target.role_id);

      if ((count ?? 0) <= 1) {
        return { error: "Cannot delete the last super admin." };
      }
    }

    const { error: deleteError } = await supabase
      .from("admin_users")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return { error: deleteError.message };
    }

    await supabase.from("audit_log").insert({
      user_id: adminUser.user_id,
      action: "delete",
      entity_type: "admin_user",
      entity_id: target.user_id,
    });

    revalidatePath("/admin/settings");
    return { error: null };
  } catch {
    return { error: "You don't have permission to perform this action." };
  }
}

// ---------------------------------------------------------------------------
// Roles & Permissions
// ---------------------------------------------------------------------------

export async function getRoles() {
  try {
    await assertAdmin(["super_admin", "technical"]);
    const supabase = await createClient();

    const [rolesResult, countsResult] = await Promise.all([
      supabase
        .from("roles")
        .select("id, name, description, permissions, created_at")
        .order("name"),
      supabase
        .from("admin_users")
        .select("role_id")
        .eq("is_active", true),
    ]);

    if (rolesResult.error) {
      return { data: null, error: rolesResult.error.message };
    }

    const countMap: Record<string, number> = {};
    for (const row of countsResult.data ?? []) {
      countMap[row.role_id] = (countMap[row.role_id] ?? 0) + 1;
    }

    const roles: RoleRow[] = (rolesResult.data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      permissions: (r.permissions ?? {}) as Record<string, boolean>,
      created_at: r.created_at,
      admin_count: countMap[r.id] ?? 0,
    }));

    return { data: roles, error: null };
  } catch {
    return { data: null, error: "You don't have permission to perform this action." };
  }
}

export async function updateRolePermissions(roleId: string, formData: FormData) {
  try {
    const { adminUser } = await assertAdmin(["super_admin", "technical"]);
    const supabase = await createClient();

    const { data: role, error: fetchError } = await supabase
      .from("roles")
      .select("id, name, permissions")
      .eq("id", roleId)
      .single();

    if (fetchError || !role) {
      return { error: "Role not found." };
    }

    if (role.name === "super_admin") {
      return { error: "Super admin permissions cannot be modified." };
    }

    const description = (formData.get("description") as string)?.trim() || null;
    const permissionsJson = formData.get("permissions") as string;

    let permissions: Record<string, boolean> = {};
    try {
      permissions = JSON.parse(permissionsJson);
    } catch {
      return { error: "Invalid permissions format." };
    }

    const { error: updateError } = await supabase
      .from("roles")
      .update({ description, permissions })
      .eq("id", roleId);

    if (updateError) {
      return { error: updateError.message };
    }

    await supabase.from("audit_log").insert({
      user_id: adminUser.user_id,
      action: "update_permissions",
      entity_type: "role",
      entity_id: roleId,
      old_data: role.permissions as Json,
      new_data: permissions as Json,
    });

    revalidatePath("/admin/settings");
    return { error: null };
  } catch {
    return { error: "You don't have permission to perform this action." };
  }
}

// ---------------------------------------------------------------------------
// Audit Log
// ---------------------------------------------------------------------------

export async function getAuditLog(filters: {
  page?: number;
  pageSize?: number;
  search?: string;
  entityType?: string;
  dateFrom?: string;
  dateTo?: string;
  userId?: string;
} = {}) {
  try {
    await assertAdmin(["super_admin", "technical"]);
    const supabase = await createClient();

    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("audit_log")
      .select(
        "id, user_id, action, entity_type, entity_id, old_data, new_data, metadata, ip_address, created_at",
        { count: "exact" }
      )
      .order("created_at", { ascending: false });

    if (filters.search) {
      const safe = sanitizeSearch(filters.search);
      if (safe) {
        query = query.or(
          `action.ilike.%${safe}%,entity_type.ilike.%${safe}%,entity_id.ilike.%${safe}%`
        );
      }
    }

    if (filters.entityType && filters.entityType !== "all") {
      query = query.eq("entity_type", filters.entityType);
    }

    if (filters.dateFrom) {
      query = query.gte("created_at", rangeStart(filters.dateFrom));
    }

    if (filters.dateTo) {
      query = query.lte("created_at", rangeEnd(filters.dateTo));
    }

    if (filters.userId && filters.userId !== "all") {
      query = query.eq("user_id", filters.userId);
    }

    const { data, count, error } = await query.range(from, to);

    if (error) {
      return { data: null, count: 0, error: error.message };
    }

    const rows: AuditLogRow[] = (data ?? []).map((row) => ({
      id: row.id,
      user_id: row.user_id,
      action: row.action,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      old_data: row.old_data as AuditLogRow["old_data"],
      new_data: row.new_data as AuditLogRow["new_data"],
      metadata: row.metadata as AuditLogRow["metadata"],
      ip_address: row.ip_address,
      created_at: row.created_at,
    }));

    return { data: rows, count: count ?? 0, error: null };
  } catch {
    return { data: null, count: 0, error: "You don't have permission to perform this action." };
  }
}

// ---------------------------------------------------------------------------
// Platform Settings
// ---------------------------------------------------------------------------

export async function getSettings() {
  try {
    await assertAdmin(["super_admin", "technical"]);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("site_settings")
      .select("key, value, updated_at, updated_by")
      .order("key");

    if (error) {
      return { data: null, error: error.message };
    }

    const rows: SiteSetting[] = (data ?? []).map((row) => ({
      key: row.key,
      value: row.value,
      updated_at: row.updated_at,
      updated_by: row.updated_by,
    }));

    return { data: rows, error: null };
  } catch {
    return { data: null, error: "You don't have permission to perform this action." };
  }
}

export async function updateSettings(entries: { key: string; value: unknown }[]) {
  try {
    const { adminUser } = await assertAdmin(["super_admin", "technical"]);
    const supabase = await createClient();

    for (const entry of entries) {
      const { error } = await supabase
        .from("site_settings")
        .upsert({
          key: entry.key,
          value: entry.value as Json,
          updated_at: new Date().toISOString(),
          updated_by: adminUser.id,
        });

      if (error) {
        return { error: `Failed to update "${entry.key}": ${error.message}` };
      }
    }

    revalidatePath("/admin/settings");
    return { error: null };
  } catch {
    return { error: "You don't have permission to perform this action." };
  }
}

// ---------------------------------------------------------------------------
// Lightweight admin list (for audit log user filter)
// ---------------------------------------------------------------------------

export async function getAdminUsersLite() {
  try {
    await assertAdmin(["super_admin", "technical"]);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("admin_users")
      .select("id, user_id, full_name")
      .order("full_name");

    if (error) {
      return { data: null, error: error.message };
    }

    const rows: AdminUserLite[] = (data ?? []).map((row) => ({
      id: row.id,
      user_id: row.user_id,
      full_name: row.full_name,
    }));

    return { data: rows, error: null };
  } catch {
    return { data: null, error: "You don't have permission to perform this action." };
  }
}

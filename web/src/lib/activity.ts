// Shared between the server query and the realtime subscription so both
// produce identical feed items from an audit_log row.

export interface AuditLogRow {
  id: string;
  action: string;
  entity_type: string;
  new_data: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface ActivityItem {
  id: string;
  action: string;
  entityType: string;
  description: string;
  createdAt: string;
}

const VERBS: Record<string, string> = {
  create: "Created",
  insert: "Created",
  update: "Updated",
  delete: "Deleted",
  publish: "Published",
  unpublish: "Unpublished",
  archive: "Archived",
  purchase: "New purchase of",
  enroll: "New enrollment in",
  refund: "Refunded",
  upload: "Uploaded",
  schedule: "Scheduled",
};

function humanize(value: string): string {
  return value.replace(/[_-]+/g, " ").trim().toLowerCase();
}

function pickLabel(source: Record<string, unknown> | null): string | null {
  if (!source) return null;
  for (const key of ["name", "title", "full_name", "course_name", "invoice_number"]) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function toActivityItem(row: AuditLogRow): ActivityItem {
  const custom = row.metadata?.description;
  let description: string;

  if (typeof custom === "string" && custom.trim()) {
    description = custom.trim();
  } else {
    const action = row.action.toLowerCase();
    const verb = VERBS[action] ?? humanize(row.action).replace(/^\w/, (c) => c.toUpperCase());
    const label = pickLabel(row.new_data) ?? pickLabel(row.metadata);
    description = `${verb} ${humanize(row.entity_type)}${label ? ` “${label}”` : ""}`;
  }

  return {
    id: row.id,
    action: row.action,
    entityType: row.entity_type,
    description,
    createdAt: row.created_at,
  };
}

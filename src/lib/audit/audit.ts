import "server-only";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { logger } from "@/lib/logging/logger";

export type AuditAction =
  | "CREATED" | "EDITED" | "DUPLICATED" | "DELETED" | "RESTORED"
  | "PUBLISHED" | "DEACTIVATED" | "VERSION_CREATED" | "BACKGROUND_UPLOADED"
  | "PREVIEWED" | "GENERATED" | "SIGNED" | "COMPLETED" | "UPLOADED"
  | "D365_UPDATED" | "RETRIED" | "FAILED" | "CANCELLED" | "SIGNED_IN" | "ROLE_CHANGED" | "SETTINGS_CHANGED";

export interface AuditInput {
  entityType: "template" | "template_version" | "field_definition" | "cmr_document" | "user" | "settings" | "asset" | "role";
  entityId?: string;
  action: AuditAction;
  user: { id?: string; email?: string };
  cmrNumber?: string;
  details?: Record<string, unknown>;
}

/** Best-effort audit write: never throws into the business flow. */
export async function audit(input: AuditInput): Promise<void> {
  try {
    const { error } = await supabaseAdmin().from("cmr_audit_logs").insert({
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      action: input.action,
      user_id: input.user.id && /^[0-9a-f-]{36}$/i.test(input.user.id) ? input.user.id : null,
      user_email: input.user.email ?? null,
      cmr_number: input.cmrNumber ?? null,
      details: input.details ?? null,
    });
    if (error) throw error;
  } catch (err) {
    logger.error("audit write failed", { action: input.action, entityType: input.entityType, error: (err as Error).message });
  }
}

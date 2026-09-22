import { z } from "zod";
import { route, json } from "@/lib/api/handler";
import { requireCapability } from "@/lib/auth/guards";
import { updateRole, deleteRole, getRoleById } from "@/lib/db/repositories/roles";
import { audit } from "@/lib/audit/audit";
import { CAPABILITY_DEFINITIONS, type Capability } from "@/lib/auth/roles";
import { Errors } from "@/lib/errors";

const VALID_CAPABILITIES = CAPABILITY_DEFINITIONS.map((c) => c.key);

const isValidPermissionToken = (token: string): boolean => {
  if (VALID_CAPABILITIES.includes(token as Capability)) return true;
  if (/^[a-z0-9_]+:(read|create|update|delete)$/.test(token)) return true;
  return false;
};

const UpdateRoleSchema = z.object({
  name: z
    .string()
    .min(2, "Role name must be at least 2 characters")
    .max(50, "Role name cannot exceed 50 characters")
    .regex(/^[A-Za-z0-9 _-]+$/, "Role name can only contain letters, numbers, spaces, underscores, and hyphens")
    .optional(),
  description: z.string().max(255).optional(),
  capabilities: z
    .array(z.string())
    .refine(
      (arr) => arr.every(isValidPermissionToken),
      "One or more permissions or capabilities are invalid"
    )
    .optional(),
});

export const PATCH = route<{ id: string }>(async (req, { params }) => {
  const session = await requireCapability("manageUsers");
  const body = UpdateRoleSchema.parse(await req.json());

  const existing = await getRoleById(params.id);
  if (!existing) throw Errors.notFound("Role not found");

  const updated = await updateRole(params.id, {
    name: body.name,
    description: body.description,
    capabilities: body.capabilities,
  });

  await audit({
    entityType: "role",
    entityId: params.id,
    action: "EDITED",
    user: session.user,
    details: { name: updated.name, capabilities: updated.capabilities },
  });

  return json({ ok: true, role: updated });
});

export const DELETE = route<{ id: string }>(async (_req, { params }) => {
  const session = await requireCapability("manageUsers");

  const existing = await getRoleById(params.id);
  if (!existing) throw Errors.notFound("Role not found");

  await deleteRole(params.id);

  await audit({
    entityType: "role",
    entityId: params.id,
    action: "DELETED",
    user: session.user,
    details: { name: existing.name },
  });

  return json({ ok: true, message: `Role "${existing.name}" deleted successfully` });
});

import { z } from "zod";
import { route, json } from "@/lib/api/handler";
import { requireCapability } from "@/lib/auth/guards";
import { listRoles, createCustomRole } from "@/lib/db/repositories/roles";
import { audit } from "@/lib/audit/audit";
import { CAPABILITY_DEFINITIONS, type Capability } from "@/lib/auth/roles";

const VALID_CAPABILITIES = CAPABILITY_DEFINITIONS.map((c) => c.key);

const isValidPermissionToken = (token: string): boolean => {
  if (VALID_CAPABILITIES.includes(token as Capability)) return true;
  if (/^[a-z0-9_]+:(read|create|update|delete)$/.test(token)) return true;
  return false;
};

export const GET = route(async () => {
  // Allow anyone with manageUsers or viewDashboard to list roles (e.g. for dropdowns)
  await requireCapability("viewDashboard");
  const roles = await listRoles();
  return json({ roles });
});

const CreateRoleSchema = z.object({
  name: z
    .string()
    .min(2, "Role name must be at least 2 characters")
    .max(50, "Role name cannot exceed 50 characters")
    .regex(/^[A-Za-z0-9 _-]+$/, "Role name can only contain letters, numbers, spaces, underscores, and hyphens"),
  description: z.string().max(255).optional(),
  capabilities: z.array(z.string()).refine(
    (arr) => arr.every(isValidPermissionToken),
    "One or more permissions or capabilities are invalid"
  ),
});

export const POST = route(async (req) => {
  const session = await requireCapability("manageUsers");
  const body = CreateRoleSchema.parse(await req.json());

  const role = await createCustomRole({
    name: body.name,
    description: body.description,
    capabilities: body.capabilities,
  });

  await audit({
    entityType: "role",
    entityId: role.id,
    action: "CREATED",
    user: session.user,
    details: { name: role.name, capabilities: role.capabilities },
  });

  return json({ ok: true, role }, { status: 201 });
});

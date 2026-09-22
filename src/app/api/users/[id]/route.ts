import { z } from "zod";
import { route, json } from "@/lib/api/handler";
import { requireCapability } from "@/lib/auth/guards";
import { updateUser, deleteUser } from "@/lib/db/repositories/users";
import { ROLES } from "@/lib/auth/roles";
import { audit } from "@/lib/audit/audit";
import { Errors } from "@/lib/errors";

export const PATCH = route<{ id: string }>(async (req, { params }) => {
  const session = await requireCapability("manageUsers");
  const body = z
    .object({
      displayName: z.string().optional(),
      role: z.string().min(1).optional(),
      active: z.boolean().optional(),
      allowed_companies: z.array(z.string()).optional(),
    })
    .parse(await req.json());

  if (params.id === session.user.id && ((body.role !== undefined && body.role !== "Admin") || body.active === false)) {
    throw Errors.conflict("You cannot remove your own Admin access.");
  }

  const user = await updateUser(params.id, body);
  await audit({
    entityType: "user",
    entityId: params.id,
    action: "EDITED",
    user: session.user,
    details: body,
  });
  return json({ user });
});

export const DELETE = route<{ id: string }>(async (_req, { params }) => {
  const session = await requireCapability("manageUsers");
  if (params.id === session.user.id) {
    throw Errors.conflict("You cannot delete your own account.");
  }

  await deleteUser(params.id);
  await audit({
    entityType: "user",
    entityId: params.id,
    action: "DELETED",
    user: session.user,
  });
  return json({ success: true });
});


import { route, json } from "@/lib/api/handler";
import { requireCapability } from "@/lib/auth/guards";
import { getUserById } from "@/lib/db/repositories/users";
import { issueSetupPasscode } from "@/lib/auth/account-setup";
import { audit } from "@/lib/audit/audit";
import { Errors } from "@/lib/errors";

/** Admin: issue a new 6-digit passcode; the user's current password stops working until they set a new one. */
export const POST = route<{ id: string }>(async (_req, { params }) => {
  const session = await requireCapability("manageUsers");
  const user = await getUserById(params.id);
  if (!user) throw Errors.notFound("User");
  const rec = await issueSetupPasscode(user, { clearPassword: true });
  await audit({ entityType: "user", entityId: user.id, action: "EDITED", user: session.user, details: { type: "passcode_issued" } });
  return json({ ok: true, code: rec.code, expiresAt: rec.expiresAt });
});

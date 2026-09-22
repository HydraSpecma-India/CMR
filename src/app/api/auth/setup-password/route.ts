import { z } from "zod";
import { route, json } from "@/lib/api/handler";
import { completePasswordSetup } from "@/lib/auth/account-setup";
import { audit } from "@/lib/audit/audit";

/** Public: new user (or reset user) sets a password using the 6-digit passcode from the admin. */
export const POST = route(async (req) => {
  const body = z
    .object({ email: z.string().email(), code: z.string().trim(), password: z.string().min(1).max(200) })
    .parse(await req.json());
  const user = await completePasswordSetup(body.email, body.code, body.password);
  await audit({ entityType: "user", entityId: user.id, action: "EDITED", user: { id: user.id, email: user.email }, details: { type: "password_set_with_passcode" } });
  return json({ ok: true });
});

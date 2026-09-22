import { z } from "zod";
import { route, json } from "@/lib/api/handler";
import { requireCapability } from "@/lib/auth/guards";
import { resetUserPassword } from "@/lib/db/repositories/users";
import { audit } from "@/lib/audit/audit";

const ResetPasswordSchema = z.object({
  password: z.string().min(6, "Password must be at least 6 characters long"),
});

export const POST = route<{ id: string }>(async (req, { params }) => {
  const session = await requireCapability("manageUsers");
  const body = ResetPasswordSchema.parse(await req.json());
  await resetUserPassword(params.id, body.password);
  await audit({
    entityType: "user",
    entityId: params.id,
    action: "EDITED",
    user: session.user,
    details: { type: "password_reset" },
  });
  return json({ success: true, message: "Password updated successfully" });
});

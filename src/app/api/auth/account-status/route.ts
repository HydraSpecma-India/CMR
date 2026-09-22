import { z } from "zod";
import { route, json } from "@/lib/api/handler";
import { needsPasswordSetup } from "@/lib/auth/account-setup";

/** Public: tells the sign-in page whether this e-mail must first set a password with a passcode. */
export const POST = route(async (req) => {
  const { email } = z.object({ email: z.string().email() }).parse(await req.json());
  return json({ setupRequired: await needsPasswordSetup(email) });
});

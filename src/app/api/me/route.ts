import { route, json } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";

export const GET = route(async () => {
  const session = await requireSession();
  return json({ user: session.user });
});

import { z } from "zod";
import { route, json } from "@/lib/api/handler";
import { requireCapability } from "@/lib/auth/guards";
import { listUsers, createUser } from "@/lib/db/repositories/users";
import { issueSetupPasscode, listSetupPasscodes, toSafeUser, MIN_PASSWORD_LENGTH } from "@/lib/auth/account-setup";
import { ROLES } from "@/lib/auth/roles";
import { audit } from "@/lib/audit/audit";

export const GET = route(async () => {
  await requireCapability("manageUsers");
  const [users, setups] = await Promise.all([listUsers(), listSetupPasscodes()]);
  return json({ users: users.map((u) => toSafeUser(u, setups)) });
});

const CreateUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  displayName: z.string().optional(),
  role: z.string().min(1, "Role is required"),
  // Optional: leave empty and the user sets their own password with a 6-digit passcode
  password: z.string().min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`).optional().or(z.literal("")),
  active: z.boolean().optional(),
  allowed_companies: z.array(z.string()).optional(),
});

export const POST = route(async (req) => {
  const session = await requireCapability("manageUsers");
  const body = CreateUserSchema.parse(await req.json());
  const user = await createUser({ ...body, password: body.password || undefined });
  const setup = body.password ? null : await issueSetupPasscode(user);
  await audit({
    entityType: "user",
    entityId: user.id,
    action: "CREATED",
    user: session.user,
    details: { email: user.email, role: user.role },
  });
  return json({ user: toSafeUser(user), passcode: setup?.code ?? null, passcodeExpiresAt: setup?.expiresAt ?? null }, { status: 201 });
});


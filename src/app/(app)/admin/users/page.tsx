import { requireCapability } from "@/lib/auth/guards";
import { listUsers } from "@/lib/db/repositories/users";
import { listRoles } from "@/lib/db/repositories/roles";
import { UsersClient } from "./users-client";
import { listSetupPasscodes, toSafeUser } from "@/lib/auth/account-setup";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users & Roles" };

export default async function UsersPage() {
  const session = await requireCapability("manageUsers");
  const [users, initialRoles, setups] = await Promise.all([listUsers(), listRoles(), listSetupPasscodes()]);

  // Never send password hashes to the browser; include passcode status for the admin instead
  return <UsersClient users={users.map((u) => toSafeUser(u, setups))} initialRoles={initialRoles} selfId={session.user.id} />;
}

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { env } from "@/lib/env";
import { AppShell } from "@/components/layout/AppShell";
import { SessionProvider } from "next-auth/react";
import { SessionTimeoutProvider } from "@/components/layout/SessionTimeoutProvider";
import { getActiveConfig } from "@/lib/config";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.email) redirect("/signin");
  const e = env();
  const cfg = await getActiveConfig().catch(() => null);
  const loginUrl = cfg?.app.loginRedirectUrl || undefined;
  return (
    <SessionProvider session={session}>
      <SessionTimeoutProvider timeoutMinutes={cfg?.app.sessionTimeoutMinutes ?? 30} loginUrl={loginUrl}>
        <AppShell user={session.user} d365Mode={e.D365_MODE} storageMode={e.STORAGE_MODE} loginUrl={loginUrl}>
          {children}
        </AppShell>
      </SessionTimeoutProvider>
    </SessionProvider>
  );
}

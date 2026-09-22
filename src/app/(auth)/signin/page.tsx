import { redirect } from "next/navigation";
import { auth, hasEntraProvider } from "@/lib/auth/auth";
import { SignInForm } from "./signin-form";
import { APP_VERSION } from "@/lib/version";

export const metadata = { title: "Sign in - CMR Platform" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string; reason?: string }>;
}) {
  const session = await auth();
  const { callbackUrl = "/", error, reason } = await searchParams;
  if (session?.user?.email && session.user.id) redirect(callbackUrl);

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-100 p-6">
      <div className="w-full max-w-md rounded-xl border border-ink-200 bg-white p-8 shadow-sm">
        {/* Brand Header */}
        <div className="mb-6 flex items-center gap-3.5">
          <img
            src="/hydraspecma-logo.png"
            alt="HydraSpecma"
            className="h-10 w-auto object-contain shrink-0"
          />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-ink-900">CMR Platform</h1>
              <span className="rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-800 border border-brand-200">
                {APP_VERSION}
              </span>
            </div>
            <p className="text-xs text-ink-500 font-medium">CMR consignment note • HydraSpecma</p>
          </div>
        </div>

        <SignInForm
          callbackUrl={callbackUrl}
          initialError={error}
          reason={reason}
          hasEntra={hasEntraProvider()}
        />

        <div className="mt-6 text-center text-[11px] text-ink-400">
          Authorized HydraSpecma personnel only &bull; ISO 9001:2015 Compliant
        </div>
      </div>
    </div>
  );
}

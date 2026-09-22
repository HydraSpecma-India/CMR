"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutToLogin } from "@/lib/auth/login-redirect";
import {
  LayoutDashboard, FilePlus2, History, FileText, ListTree, Database, FolderCog, Users, PenTool, ScrollText, Settings, LogOut, ShieldCheck,
  Menu, X,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { can, type Role } from "@/lib/auth/roles";
import { Toaster } from "@/components/ui/toast";
import { Badge } from "@/components/ui";
import { APP_VERSION } from "@/lib/version";

interface Props {
  user: { name?: string | null; email: string; role: Role; isDev?: boolean; capabilities?: string[] };
  d365Mode: string;
  storageMode: string;
  /** Admin-configured sign-in page used after sign-out */
  loginUrl?: string;
  children: React.ReactNode;
}

type NavItem = { href: string; label: string; short: string; icon: typeof LayoutDashboard; show: boolean };

const nav = (role: Role, capabilities?: string[]): { title: string; items: NavItem[] }[] => [
  {
    title: "Documents",
    items: [
      { href: "/", label: "Dashboard", short: "Home", icon: LayoutDashboard, show: can(role, "dashboard:read", capabilities) },
      { href: "/cmr/new", label: "New CMR", short: "New", icon: FilePlus2, show: can(role, "cmr:create", capabilities) },
      { href: "/cmr/history", label: "CMR register", short: "Register", icon: History, show: can(role, "cmr:read", capabilities) },
    ],
  },
  {
    title: "Administration",
    items: [
      { href: "/admin/templates", label: "Templates", short: "Templates", icon: FileText, show: can(role, "templates:read", capabilities) },
      { href: "/admin/fields", label: "Field Definitions", short: "Fields", icon: ListTree, show: can(role, "fields:read", capabilities) },
      { href: "/admin/d365-mappings", label: "D365FO Field Mapping", short: "D365", icon: Database, show: can(role, "d365_mappings:read", capabilities) },
      { href: "/admin/sharepoint", label: "SharePoint Configuration", short: "SharePoint", icon: FolderCog, show: can(role, "sharepoint:read", capabilities) },
      { href: "/admin/users", label: "Users & Roles", short: "Users", icon: Users, show: can(role, "users:read", capabilities) || can(role, "roles:read", capabilities) },
      { href: "/admin/signatures", label: "Signatures", short: "Signatures", icon: PenTool, show: can(role, "signatures:read", capabilities) },
      { href: "/admin/audit", label: "Audit Logs", short: "Audit", icon: ScrollText, show: can(role, "audit:read", capabilities) },
      { href: "/admin/settings", label: "System Settings", short: "Settings", icon: Settings, show: can(role, "settings:read", capabilities) },
    ],
  },
];

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

/**
 * Responsive application shell – switches automatically by screen width:
 *  • Phone   (< 768px):  top app bar + slide-in drawer + bottom tab bar
 *  • Tablet  (768–1279): compact icon rail
 *  • Desktop (≥ 1280px): full labelled sidebar
 */
export function AppShell({ user, d365Mode, storageMode, loginUrl, children }: Props) {
  const pathname = usePathname();
  const isDesigner = pathname.includes("/designer/");
  const isCmrNew = pathname.startsWith("/cmr/new");
  const groups = nav(user.role, user.capabilities).map((g) => ({ ...g, items: g.items.filter((i) => i.show) })).filter((g) => g.items.length);
  // The drawer remembers the path it was opened on, so it closes automatically after navigation
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const drawerOpen = drawerPath === pathname;
  const setDrawerOpen = (open: boolean) => setDrawerPath(open ? pathname : null);

  // Lock background scroll while the drawer is open
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  const allItems = groups.flatMap((g) => g.items);
  const currentLabel = allItems.find((i) => isActive(pathname, i.href))?.label || "CMR Platform";
  const bottomItems = groups[0]?.items ?? [];
  // The New CMR wizard renders its own sticky action bar on phones
  const showBottomBar = !isDesigner && !isCmrNew;

  const initials = (user.name || user.email).slice(0, 2).toUpperCase();

  const renderUserFooter = (compact = false) => (
    <div className="border-t border-ink-200 p-3">
      {compact ? (
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-200 text-xs font-semibold text-ink-700" title={`${user.name || user.email} · ${user.role}`}>
            {initials}
          </div>
          <button onClick={() => void signOutToLogin(loginUrl, "signout")} className="rounded p-2 text-ink-500 hover:bg-ink-100" title="Sign out" aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-200 text-xs font-semibold text-ink-700">{initials}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{user.name || user.email}</div>
              <div className="flex items-center gap-1 text-[11px] text-ink-500">
                <ShieldCheck className="h-3 w-3" /> {user.role}
              </div>
            </div>
            <button onClick={() => void signOutToLogin(loginUrl, "signout")} className="rounded p-1.5 text-ink-500 hover:bg-ink-100" title="Sign out" aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {d365Mode === "mock" && <Badge tone="info">D365 Catalog</Badge>}
            {storageMode === "mock" && <Badge tone="neutral">HydraSpecma Storage</Badge>}
            {user.isDev && <Badge tone="neutral">Internal User</Badge>}
          </div>
        </>
      )}
    </div>
  );

  const renderFullNav = () => (
    <nav className="flex-1 overflow-y-auto px-3 py-4">
      {groups.map((g) => (
        <div key={g.title} className="mb-5">
          <div className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{g.title}</div>
          {g.items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              prefetch={true}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2 py-2 text-sm text-ink-700 hover:bg-ink-100 transition-colors",
                isActive(pathname, i.href) && "bg-ink-900 text-white hover:bg-ink-900 font-medium",
              )}
            >
              <i.icon className="h-4 w-4 shrink-0" />
              {i.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );

  const renderBrand = (compact = false) => (
    <Link href="/" prefetch={true} className={cn("flex h-14 items-center gap-2.5 border-b border-ink-200 hover:bg-ink-50 transition-colors", compact ? "justify-center px-2" : "px-3")}>
      <img src="/hydraspecma-logo.png" alt="HydraSpecma" className={cn("w-auto object-contain shrink-0", compact ? "h-6" : "h-8")} />
      {!compact && (
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-ink-900 tracking-tight">CMR Platform</span>
            <span className="inline-flex items-center rounded bg-brand-50 px-1 py-0.5 text-[9px] font-bold text-brand-800 border border-brand-200">{APP_VERSION}</span>
          </div>
          <div className="text-[11px] font-medium text-ink-500">HydraSpecma</div>
        </div>
      )}
    </Link>
  );

  return (
    <div className="flex h-[100dvh] overflow-hidden">
      {/* ── Desktop: full sidebar ── */}
      {!isDesigner && (
        <aside className="hidden xl:flex w-64 shrink-0 flex-col border-r border-ink-200 bg-white">
          {renderBrand()}
          {renderFullNav()}
          {renderUserFooter()}
        </aside>
      )}

      {/* ── Tablet: icon rail ── */}
      {!isDesigner && (
        <aside className="hidden md:flex xl:hidden w-[76px] shrink-0 flex-col border-r border-ink-200 bg-white">
          {renderBrand(true)}
          <nav className="flex-1 overflow-y-auto px-1.5 py-3 space-y-1">
            {groups.map((g, gi) => (
              <div key={g.title} className={cn("space-y-1", gi > 0 && "mt-3 border-t border-ink-100 pt-3")}>
                {g.items.map((i) => (
                  <Link
                    key={i.href}
                    href={i.href}
                    prefetch={true}
                    title={i.label}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium leading-tight text-ink-600 hover:bg-ink-100 transition-colors text-center",
                      isActive(pathname, i.href) && "bg-ink-900 text-white hover:bg-ink-900",
                    )}
                  >
                    <i.icon className="h-5 w-5 shrink-0" />
                    <span className="w-full truncate">{i.short}</span>
                  </Link>
                ))}
              </div>
            ))}
          </nav>
          {renderUserFooter(true)}
        </aside>
      )}

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* ── Phone: top app bar ── */}
        {!isDesigner && (
          <header className="md:hidden flex h-14 shrink-0 items-center gap-2 border-b border-ink-200 bg-white px-2 pt-[env(safe-area-inset-top)]">
            <button onClick={() => setDrawerOpen(true)} className="rounded-md p-2.5 text-ink-700 hover:bg-ink-100 active:bg-ink-200" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <img src="/hydraspecma-logo.png" alt="HydraSpecma" className="h-6 w-auto object-contain shrink-0" />
            <div className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-900">{currentLabel}</div>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-200 text-[11px] font-semibold text-ink-700" title={user.name || user.email}>
              {initials}
            </div>
          </header>
        )}

        <div
          className={cn(
            "flex-1 min-h-0",
            // only the designer manages its own scrolling; every other page (incl. New CMR) scrolls here
            isDesigner
              ? "overflow-hidden flex flex-col"
              : "overflow-y-auto overscroll-contain px-3 py-4 sm:px-6 lg:px-8 lg:py-6",
            showBottomBar && "pb-24 md:pb-6",
          )}
        >
          {children}
        </div>

        {/* ── Phone: bottom tab bar ── */}
        {showBottomBar && bottomItems.length > 0 && (
          <nav className="md:hidden fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
            <div className="grid" style={{ gridTemplateColumns: `repeat(${bottomItems.length + 1}, minmax(0, 1fr))` }}>
              {bottomItems.map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  prefetch={true}
                  className={cn(
                    "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-ink-500",
                    isActive(pathname, i.href) && "text-ink-900",
                  )}
                >
                  <span className={cn("flex h-7 w-12 items-center justify-center rounded-full", isActive(pathname, i.href) && "bg-brand-100 text-brand-800")}>
                    <i.icon className="h-5 w-5" />
                  </span>
                  {i.short}
                </Link>
              ))}
              <button onClick={() => setDrawerOpen(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-ink-500">
                <span className="flex h-7 w-12 items-center justify-center rounded-full">
                  <Menu className="h-5 w-5" />
                </span>
                More
              </button>
            </div>
          </nav>
        )}
      </main>

      {/* ── Phone: slide-in drawer ── */}
      {!isDesigner && (
        <div className={cn("md:hidden fixed inset-0 z-50", drawerOpen ? "pointer-events-auto" : "pointer-events-none")} aria-hidden={!drawerOpen}>
          <div
            className={cn("absolute inset-0 bg-ink-900/40 transition-opacity", drawerOpen ? "opacity-100" : "opacity-0")}
            onClick={() => setDrawerOpen(false)}
          />
          <aside
            className={cn(
              "absolute inset-y-0 left-0 flex w-[82%] max-w-[300px] flex-col bg-white shadow-2xl transition-transform duration-200 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
              drawerOpen ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <div className="flex items-center">
              <div className="flex-1 min-w-0">
                {renderBrand()}
              </div>
              <button onClick={() => setDrawerOpen(false)} className="mr-2 rounded-md p-2 text-ink-500 hover:bg-ink-100" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            {renderFullNav()}
            {renderUserFooter()}
          </aside>
        </div>
      )}
      <Toaster />
    </div>
  );
}

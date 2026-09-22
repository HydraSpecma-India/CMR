"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  PageHeader,
  Table,
  Th,
  Td,
  Select,
  Badge,
  Alert,
  Button,
  Dialog,
  Input,
  Field,
} from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/utils/fetcher";
import {
  PAGE_RESOURCES,
  CAPABILITY_DEFINITIONS,
  normalizePermissions,
  canPermission,
  type Capability,
  type Role,
  type PermissionAction,
  type PageResourceDefinition,
} from "@/lib/auth/roles";
import type { SafeUser as UserRow } from "@/lib/auth/account-setup";
import type { RoleRow } from "@/lib/db/repositories/roles";
import {
  UserPlus,
  KeyRound,
  Trash2,
  Search,
  UserCheck,
  UserX,
  Shield,
  ShieldCheck,
  Plus,
  Edit2,
  Users as UsersIcon,
  CheckCircle2,
  Lock,
  Sparkles,
  CheckSquare,
  Square,
  Eye,
  Sliders,
  X,
} from "lucide-react";

export function UsersClient({
  users,
  initialRoles,
  selfId,
}: {
  users: UserRow[];
  initialRoles: RoleRow[];
  selfId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Active Tab: "users" or "roles"
  const [activeTab, setActiveTab] = useState<"users" | "roles">("users");

  // Roles state
  const [roles, setRoles] = useState<RoleRow[]>(initialRoles);
  const [loadingRoles, setLoadingRoles] = useState(false);

  // Search filter
  const [searchTerm, setSearchTerm] = useState("");
  const [companies, setCompanies] = useState<{ code: string; name: string }[]>([
    { code: "HSIN", name: "HydraSpecma India (India)" },
    { code: "HGCN", name: "HydraSpecma China (China)" },
    { code: "HSDK", name: "HydraSpecma Denmark (Denmark)" },
  ]);

  const refreshRoles = async () => {
    setLoadingRoles(true);
    try {
      const res = await api<{ roles: RoleRow[] }>("/api/roles");
      if (res.roles) setRoles(res.roles);
    } catch {
      // ignore
    } finally {
      setLoadingRoles(false);
    }
  };

  useEffect(() => {
    api<{ ok: boolean; companies: { code: string; name: string }[] }>("/api/d365/companies")
      .then((res) => {
        if (res.ok && res.companies && res.companies.length > 0) {
          setCompanies(res.companies);
        }
      })
      .catch(() => {});
  }, []);

  // Create User Modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<{
    displayName: string;
    email: string;
    role: string;
    password: string;
    active: boolean;
    allowedCompany: string;
  }>({
    displayName: "",
    email: "",
    role: "Shipping",
    password: "",
    active: true,
    allowedCompany: "ALL",
  });
  const [createLoading, setCreateLoading] = useState(false);
  // One-time passcode to show the admin (after creating a user or issuing a new passcode)
  const [passcodeInfo, setPasscodeInfo] = useState<{ email: string; code: string; expiresAt?: string | null } | null>(null);
  const [passcodeLoading, setPasscodeLoading] = useState<string | null>(null);

  const issuePasscode = async (u: UserRow) => {
    if (u.has_password && !confirm(`Issue a new passcode for ${u.email}? Their current password will stop working until they set a new one.`)) return;
    setPasscodeLoading(u.id);
    try {
      const res = await api<{ ok: boolean; code: string; expiresAt: string }>(`/api/users/${u.id}/passcode`, { method: "POST" });
      setPasscodeInfo({ email: u.email, code: res.code, expiresAt: res.expiresAt });
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error("Could not issue passcode", (e as Error).message);
    } finally {
      setPasscodeLoading(null);
    }
  };

  // Reset Password Modal state
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  // Delete User Confirmation Modal state
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Role Create / Edit Modal state (D365FO Security Configuration)
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [roleModalMode, setRoleModalMode] = useState<"create" | "edit" | "view">("create");
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleSearch, setRoleSearch] = useState("");
  const [roleForm, setRoleForm] = useState<{
    name: string;
    description: string;
    capabilities: string[];
  }>({
    name: "",
    description: "",
    capabilities: ["dashboard:read", "cmr:read", "viewDashboard", "viewCmr"],
  });
  const [roleLoading, setRoleLoading] = useState(false);

  // Delete Role Confirmation Modal state
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<RoleRow | null>(null);
  const [deleteRoleLoading, setDeleteRoleLoading] = useState(false);

  // Patch user handler
  const patchUser = async (
    id: string,
    body: { role?: string; active?: boolean; displayName?: string; allowed_companies?: string[] }
  ) => {
    try {
      await api(`/api/users/${id}`, { method: "PATCH", json: body });
      toast.success("User updated successfully");
      startTransition(() => {
        router.refresh();
      });
      refreshRoles();
    } catch (e) {
      toast.error("Update failed", (e as Error).message);
    }
  };

  // Create user handler
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.email.trim()) {
      toast.error("Email required", "Please enter a valid work email.");
      return;
    }
    setCreateLoading(true);
    try {
      const created = await api<{ passcode: string | null; passcodeExpiresAt: string | null }>("/api/users", {
        method: "POST",
        json: {
          email: createForm.email.trim(),
          displayName: createForm.displayName.trim() || undefined,
          role: createForm.role,
          password: createForm.password.trim() || undefined,
          active: createForm.active,
          allowed_companies: [createForm.allowedCompany],
        },
      });
      toast.success("User created", `${createForm.email} has been added.`);
      if (created.passcode) setPasscodeInfo({ email: createForm.email.trim(), code: created.passcode, expiresAt: created.passcodeExpiresAt });
      setCreateOpen(false);
      setCreateForm({
        displayName: "",
        email: "",
        role: roles[0]?.name || "Shipping",
        password: "",
        active: true,
        allowedCompany: "ALL",
      });
      startTransition(() => {
        router.refresh();
      });
      refreshRoles();
    } catch (e) {
      toast.error("Failed to create user", (e as Error).message);
    } finally {
      setCreateLoading(false);
    }
  };

  // Reset password handler
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    if (newPassword.length < 6) {
      toast.error("Password too short", "Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setResetLoading(true);
    try {
      await api(`/api/users/${resetTarget.id}/reset-password`, {
        method: "POST",
        json: { password: newPassword },
      });
      toast.success("Password reset", `Updated password for ${resetTarget.email}`);
      setResetTarget(null);
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      toast.error("Reset failed", (e as Error).message);
    } finally {
      setResetLoading(false);
    }
  };

  // Delete user handler
  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await api(`/api/users/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("User removed", `${deleteTarget.email} deleted.`);
      setDeleteTarget(null);
      startTransition(() => {
        router.refresh();
      });
      refreshRoles();
    } catch (e) {
      toast.error("Delete failed", (e as Error).message);
    } finally {
      setDeleteLoading(false);
    }
  };

  // Open Create Role modal
  const openCreateRole = () => {
    setRoleModalMode("create");
    setEditingRoleId(null);
    setRoleSearch("");
    setRoleForm({
      name: "",
      description: "",
      capabilities: normalizePermissions(["dashboard:read", "cmr:read"]),
    });
    setRoleModalOpen(true);
  };

  // Open Edit/View Role modal
  const openEditRole = (role: RoleRow, viewOnly = false) => {
    setRoleModalMode(viewOnly ? "view" : "edit");
    setEditingRoleId(role.id);
    setRoleSearch("");
    setRoleForm({
      name: role.name,
      description: role.description || "",
      capabilities: normalizePermissions(role.capabilities || []),
    });
    setRoleModalOpen(true);
  };

  // Toggle granular permission with D365FO dependency rules
  const togglePerm = (resId: string, action: PermissionAction) => {
    if (roleModalMode === "view") return;
    const token = `${resId}:${action}`;
    setRoleForm((prev) => {
      const has = prev.capabilities.includes(token);
      let next = [...prev.capabilities];
      if (has) {
        // Removing action
        next = next.filter((c) => c !== token);
        // D365FO Rule: If removing 'read', also remove create, update, delete for this resource
        if (action === "read") {
          next = next.filter((c) => !c.startsWith(`${resId}:`));
        }
      } else {
        // Adding action
        next.push(token);
        // D365FO Rule: If adding create, update, or delete, auto-add 'read'
        if (action !== "read" && !next.includes(`${resId}:read`)) {
          next.push(`${resId}:read`);
        }
      }
      return { ...prev, capabilities: normalizePermissions(next) };
    });
  };

  // Set row preset (Full, Read, None)
  const setRowPreset = (res: PageResourceDefinition, level: "full" | "read" | "none") => {
    if (roleModalMode === "view") return;
    setRoleForm((prev) => {
      let next = prev.capabilities.filter((c) => !c.startsWith(`${res.id}:`));
      if (level === "full") {
        res.supportedActions.forEach((act) => next.push(`${res.id}:${act}`));
      } else if (level === "read") {
        next.push(`${res.id}:read`);
      }
      return { ...prev, capabilities: normalizePermissions(next) };
    });
  };

  // Grant Full Access across all resources
  const grantFullAccess = () => {
    if (roleModalMode === "view") return;
    const allPerms: string[] = [];
    PAGE_RESOURCES.forEach((r) => {
      r.supportedActions.forEach((a) => allPerms.push(`${r.id}:${a}`));
    });
    setRoleForm((prev) => ({ ...prev, capabilities: normalizePermissions(allPerms) }));
  };

  // Grant Read-Only across all resources
  const grantReadOnlyAccess = () => {
    if (roleModalMode === "view") return;
    const readPerms = PAGE_RESOURCES.map((r) => `${r.id}:read`);
    setRoleForm((prev) => ({ ...prev, capabilities: normalizePermissions(readPerms) }));
  };

  // Clear all permissions
  const clearAllPermissions = () => {
    if (roleModalMode === "view") return;
    setRoleForm((prev) => ({ ...prev, capabilities: [] }));
  };

  // Save Role handler (Create or Edit)
  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (roleModalMode === "view") {
      setRoleModalOpen(false);
      return;
    }

    if (!roleForm.name.trim()) {
      toast.error("Role name required", "Please enter a unique name for the role.");
      return;
    }

    setRoleLoading(true);
    try {
      const normalizedCaps = normalizePermissions(roleForm.capabilities);
      if (roleModalMode === "create") {
        await api("/api/roles", {
          method: "POST",
          json: {
            name: roleForm.name.trim(),
            description: roleForm.description.trim() || undefined,
            capabilities: normalizedCaps,
          },
        });
        toast.success("Role created", `Custom role "${roleForm.name}" created successfully.`);
      } else if (roleModalMode === "edit" && editingRoleId) {
        await api(`/api/roles/${editingRoleId}`, {
          method: "PATCH",
          json: {
            name: roleForm.name.trim(),
            description: roleForm.description.trim() || undefined,
            capabilities: normalizedCaps,
          },
        });
        toast.success("Role updated", `Role "${roleForm.name}" updated successfully.`);
      }
      setRoleModalOpen(false);
      startTransition(() => {
        router.refresh();
      });
      refreshRoles();
    } catch (err) {
      toast.error("Failed to save role", (err as Error).message);
    } finally {
      setRoleLoading(false);
    }
  };

  // Delete Role handler
  const handleDeleteRole = async () => {
    if (!deleteRoleTarget) return;
    setDeleteRoleLoading(true);
    try {
      await api(`/api/roles/${deleteRoleTarget.id}`, { method: "DELETE" });
      toast.success("Role deleted", `Role "${deleteRoleTarget.name}" was deleted.`);
      setDeleteRoleTarget(null);
      refreshRoles();
    } catch (err) {
      toast.error("Could not delete role", (err as Error).message);
    } finally {
      setDeleteRoleLoading(false);
    }
  };

  // Filtered users
  const filteredUsers = users.filter((u) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      (u.display_name && u.display_name.toLowerCase().includes(q)) ||
      u.email.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="User & Access Management"
        description="Manage user accounts, assign authorization roles, reset login passwords, and define custom role capabilities."
        actions={
          <div className="flex items-center gap-2">
            {activeTab === "users" ? (
              <Button
                variant="primary"
                onClick={() => setCreateOpen(true)}
                className="flex items-center gap-1.5 shadow-sm"
              >
                <UserPlus className="h-4 w-4" />
                <span>Add User</span>
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={openCreateRole}
                className="flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="h-4 w-4" />
                <span>Create New Role</span>
              </Button>
            )}
          </div>
        }
      />

      {/* Tabs Switcher */}
      <div className="flex items-center border-b border-ink-200 gap-4">
        <button
          type="button"
          onClick={() => setActiveTab("users")}
          className={`flex items-center gap-2 py-3 px-1 border-b-2 text-sm font-semibold transition-colors ${
            activeTab === "users"
              ? "border-brand-500 text-brand-700"
              : "border-transparent text-ink-500 hover:text-ink-900"
          }`}
        >
          <UsersIcon className="h-4 w-4" />
          <span>Users</span>
          <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-ink-600 font-mono">
            {users.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("roles")}
          className={`flex items-center gap-2 py-3 px-1 border-b-2 text-sm font-semibold transition-colors ${
            activeTab === "roles"
              ? "border-brand-500 text-brand-700"
              : "border-transparent text-ink-500 hover:text-ink-900"
          }`}
        >
          <Shield className="h-4 w-4" />
          <span>Roles & Permissions</span>
          <span className="ml-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700 font-mono font-bold">
            {roles.length}
          </span>
        </button>
      </div>

      {activeTab === "users" ? (
        /* ================= USERS TAB ================= */
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-ink-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-medium text-ink-500">Total Users</div>
              <div className="mt-1 text-2xl font-bold text-ink-900">{users.length}</div>
            </div>
            <div className="rounded-lg border border-ink-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-medium text-ink-500">Active Accounts</div>
              <div className="mt-1 text-2xl font-bold text-emerald-600">
                {users.filter((u) => u.active).length}
              </div>
            </div>
            <div className="rounded-lg border border-ink-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-medium text-ink-500">Administrators</div>
              <div className="mt-1 text-2xl font-bold text-brand-600">
                {users.filter((u) => u.role.toLowerCase() === "admin").length}
              </div>
            </div>
            <div className="rounded-lg border border-ink-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-medium text-ink-500">Configured Roles</div>
              <div className="mt-1 text-2xl font-bold text-indigo-600">
                {roles.length} Roles
              </div>
            </div>
          </div>

          <Alert tone="info">
            <div className="space-y-1 text-xs leading-relaxed">
              <p className="font-semibold text-sky-900 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-sky-700" />
                Role-Based Visibility & Access:
              </p>
              <p>
                Each user's assigned role directly determines what they can see in the sidebar navigation and what actions they are authorized to perform. You can assign any role below or switch to the{" "}
                <button
                  type="button"
                  onClick={() => setActiveTab("roles")}
                  className="font-bold underline text-sky-800 hover:text-sky-950"
                >
                  Roles & Permissions tab
                </button>{" "}
                to create custom roles with specific view and manage rights.
              </p>
            </div>
          </Alert>

          {/* Search Bar */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-400" />
              <input
                type="text"
                placeholder="Search by name, email, or role..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-md border border-ink-200 bg-white py-2 pl-9 pr-3 text-xs placeholder:text-ink-400 focus:border-brand-500 focus:outline-none"
              />
            </div>
            {searchTerm && (
              <Button variant="ghost" size="sm" onClick={() => setSearchTerm("")}>
                Clear
              </Button>
            )}
            <span className="ml-auto text-xs text-ink-400">
              Showing {filteredUsers.length} of {users.length} users
            </span>
          </div>

          {/* Users Table */}
          <div className="overflow-hidden rounded-lg border border-ink-200 bg-white shadow-sm">
            <Table>
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50/70 text-left text-xs font-semibold text-ink-700">
                  <Th>User</Th>
                  <Th>Role / Access Level</Th>
                  <Th>Company Access</Th>
                  <Th>Status</Th>
                  <Th>Last Login</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 text-xs">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-ink-400">
                      No users match your search criteria.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const isSelf = u.id === selfId;
                    const assignedRole = roles.find((r) => r.name.toLowerCase() === u.role.toLowerCase());
                    return (
                      <tr key={u.id} className="hover:bg-ink-50/50 transition-colors">
                        <Td>
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-900">
                              {(u.display_name || u.email).slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-semibold text-ink-900 flex items-center gap-1.5">
                                {u.display_name || u.email.split("@")[0]}
                                {isSelf && (
                                  <Badge tone="info" className="text-[10px] px-1 py-0 font-normal">
                                    You
                                  </Badge>
                                )}
                              </div>
                              <div className="text-[11px] text-ink-500 font-mono">{u.email}</div>
                            </div>
                          </div>
                        </Td>

                        {/* Assign Role Dropdown */}
                        <Td>
                          <div className="space-y-1">
                            <Select
                              value={u.role}
                              disabled={isSelf}
                              onChange={(e) => patchUser(u.id, { role: e.target.value })}
                              className="text-xs font-medium py-1 px-2 border-ink-200 bg-white focus:border-brand-500"
                              title={isSelf ? "Cannot change your own role" : "Assign user role"}
                            >
                              {roles.map((r) => (
                                <option key={r.id} value={r.name}>
                                  {r.name} {!r.is_system ? "(Custom)" : ""}
                                </option>
                              ))}
                            </Select>
                            {assignedRole?.description && (
                              <p className="text-[10px] text-ink-400 line-clamp-1 max-w-[200px]" title={assignedRole.description}>
                                {assignedRole.description}
                              </p>
                            )}
                          </div>
                        </Td>

                        {/* Company Access Dropdown */}
                        <Td>
                          <Select
                            value={u.allowed_companies && u.allowed_companies.length > 0 ? u.allowed_companies[0] : "ALL"}
                            onChange={(e) => patchUser(u.id, { allowed_companies: [e.target.value] })}
                            className="text-xs py-1 px-2 border-ink-200 bg-white"
                          >
                            <option value="ALL">🌐 ALL Companies (Global)</option>
                            {companies.map((c) => (
                              <option key={c.code} value={c.code}>
                                🏢 {c.code} - {c.name}
                              </option>
                            ))}
                          </Select>
                        </Td>

                        {/* Status Toggle */}
                        <Td>
                          <button
                            type="button"
                            disabled={isSelf}
                            onClick={() => patchUser(u.id, { active: !u.active })}
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                              u.active
                                ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                                : "bg-ink-100 text-ink-600 hover:bg-ink-200"
                            } ${isSelf ? "cursor-not-allowed opacity-75" : "cursor-pointer"}`}
                            title={isSelf ? "Cannot deactivate yourself" : "Click to toggle active/deactivated"}
                          >
                            {u.active ? <UserCheck className="h-3 w-3" /> : <UserX className="h-3 w-3" />}
                            {u.active ? "Active" : "Inactive"}
                          </button>
                          {(u.setup || !u.has_password) && (
                            <div className="mt-1 space-y-0.5">
                              <Badge tone={u.setup?.locked ? "danger" : "warning"} className="text-[10px]">
                                {u.setup?.locked ? "Passcode expired / locked" : "Awaiting password"}
                              </Badge>
                              {u.setup && !u.setup.locked && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard?.writeText(u.setup!.code).then(() => toast.success("Passcode copied"), () => {});
                                  }}
                                  className="block font-mono text-sm font-bold tracking-[0.2em] text-ink-900 hover:text-brand-800"
                                  title={`Passcode – valid until ${new Date(u.setup.expiresAt).toLocaleDateString()}. Click to copy.`}
                                >
                                  {u.setup.code}
                                </button>
                              )}
                            </div>
                          )}
                        </Td>

                        <Td className="text-ink-500 font-mono text-[11px]">
                          {u.last_login_at
                            ? new Date(u.last_login_at).toLocaleDateString("en-GB", {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "Never"}
                        </Td>

                        <Td className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setResetTarget(u);
                                setNewPassword("");
                                setConfirmPassword("");
                              }}
                              className="text-[11px] h-7 px-2"
                              title="Reset Password"
                            >
                              <KeyRound className="h-3 w-3 mr-1 text-ink-500" />
                              Reset
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              loading={passcodeLoading === u.id}
                              onClick={() => issuePasscode(u)}
                              className="text-[11px] h-7 px-2"
                              title="Generate a 6-digit passcode so the user sets their own password"
                            >
                              Passcode
                            </Button>

                            {!isSelf && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteTarget(u)}
                                className="text-red-600 hover:bg-red-50 h-7 w-7 p-0"
                                title="Delete user"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </Td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </Table>
          </div>
        </div>
      ) : (
        /* ================= ROLES & PERMISSIONS TAB ================= */
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-ink-900">Configured Authorization Roles</h3>
              <p className="text-xs text-ink-500">
                Define and manage roles to restrict or grant access to specific pages, tools, and capabilities.
              </p>
            </div>
            <Button variant="primary" onClick={openCreateRole} className="gap-1.5 shadow-sm text-xs">
              <Plus className="h-4 w-4" />
              <span>Create New Role</span>
            </Button>
          </div>

          {/* Roles Grid */}
          <div className="grid gap-4 md:grid-cols-2">
            {roles.map((role) => {
              const roleCaps = role.capabilities || [];
              return (
                <div
                  key={role.id}
                  className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm space-y-3.5 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-100 text-brand-800">
                          <Shield className="h-4 w-4" />
                        </div>
                        <span className="font-bold text-ink-900 text-sm">{role.name}</span>
                        {role.is_system ? (
                          <Badge tone="neutral" className="text-[10px] px-1.5 py-0">
                            System Role
                          </Badge>
                        ) : (
                          <Badge tone="success" className="text-[10px] px-1.5 py-0 flex items-center gap-0.5">
                            <Sparkles className="h-2.5 w-2.5" />
                            Custom Role
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <span className="text-xs font-mono font-semibold text-ink-600 bg-ink-100 px-2 py-0.5 rounded-full">
                          {role.user_count ?? 0} {role.user_count === 1 ? "user" : "users"}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-ink-600 leading-relaxed min-h-[36px]">
                      {role.description || "No description provided for this role."}
                    </p>

                    {/* D365FO Permissions list */}
                    <div className="pt-2 border-t border-ink-100 space-y-2">
                      <div className="text-[11px] font-semibold text-ink-700 flex items-center justify-between">
                        <span>Configured Page Privileges:</span>
                        <span className="text-[10px] text-ink-400 font-mono">
                          {
                            PAGE_RESOURCES.filter((res) =>
                              roleCaps.some((c) => c === `${res.id}:read` || c.startsWith(`${res.id}:`))
                            ).length
                          }{" "}
                          / {PAGE_RESOURCES.length} pages
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1 max-h-[120px] overflow-y-auto pr-1">
                        {PAGE_RESOURCES.map((res) => {
                          const hasR = roleCaps.includes(`${res.id}:read`);
                          const hasW = roleCaps.includes(`${res.id}:create`);
                          const hasU = roleCaps.includes(`${res.id}:update`);
                          const hasD = roleCaps.includes(`${res.id}:delete`);

                          if (!hasR && !hasW && !hasU && !hasD) return null;

                          return (
                            <div
                              key={res.id}
                              className="inline-flex items-center gap-1.5 rounded-md bg-slate-50 px-2 py-0.5 text-[10.5px] border border-slate-200"
                              title={`${res.name}: ${res.description}`}
                            >
                              <span className="font-semibold text-ink-800">{res.name}</span>
                              <div className="flex items-center gap-0.5 font-mono text-[9.5px] font-bold">
                                {hasR && <span className="text-sky-700 bg-sky-100 px-1 rounded" title="Read">R</span>}
                                {hasW && <span className="text-emerald-700 bg-emerald-100 px-1 rounded" title="Write / Create">W</span>}
                                {hasU && <span className="text-amber-700 bg-amber-100 px-1 rounded" title="Update">U</span>}
                                {hasD && <span className="text-rose-700 bg-rose-100 px-1 rounded" title="Delete">D</span>}
                              </div>
                            </div>
                          );
                        })}
                        {roleCaps.length === 0 && (
                          <span className="text-[11px] text-ink-400 italic">No permissions granted</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Role Actions */}
                  <div className="pt-3 border-t border-ink-100 flex items-center justify-between">
                    {role.is_system ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditRole(role, true)}
                        className="text-xs h-7 gap-1"
                      >
                        <Lock className="h-3 w-3 text-ink-400" />
                        <span>View Permissions</span>
                      </Button>
                    ) : (
                      <div className="flex items-center gap-2 w-full justify-between">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditRole(role, false)}
                          className="text-xs h-7 gap-1"
                        >
                          <Edit2 className="h-3 w-3 text-brand-600" />
                          <span>Edit Permissions</span>
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteRoleTarget(role)}
                          className="text-xs h-7 gap-1 text-red-600 hover:bg-red-50"
                          title={
                            (role.user_count ?? 0) > 0
                              ? "Cannot delete role while users are assigned"
                              : "Delete custom role"
                          }
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>Delete</span>
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================= MODALS ================= */}

      {/* 1. Create User Modal */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Create New User Account">
        <form onSubmit={handleCreateUser} className="space-y-4">
          <Field label="Full Name" hint="First and last name of the employee">
            <Input
              value={createForm.displayName}
              onChange={(e) => setCreateForm({ ...createForm, displayName: e.target.value })}
              placeholder="e.g. Rahul Sharma"
            />
          </Field>

          <Field label="Email Address *" hint="Company email address">
            <Input
              type="email"
              required
              value={createForm.email}
              onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
              placeholder="user@hydraspecma.com"
            />
          </Field>

          <Field label="Authorization Role *" hint="Select from standard or custom created roles">
            <Select
              value={createForm.role}
              onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
            >
              {roles.map((r) => (
                <option key={r.id} value={r.name}>
                  {r.name} {!r.is_system ? "(Custom Role)" : `— ${r.description?.slice(0, 45)}...`}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Company Access Permission *" hint="Restricts the legal entity orders this user can view/issue">
            <Select
              value={createForm.allowedCompany}
              onChange={(e) => setCreateForm({ ...createForm, allowedCompany: e.target.value })}
            >
              <option value="ALL">🌐 ALL Companies (Global Cross-Company Access)</option>
              {companies.map((c) => (
                <option key={c.code} value={c.code}>
                  🏢 {c.code} - {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Initial Password (optional)" hint="Leave empty – the user sets their own password">
            <Input
              type="text"
              value={createForm.password}
              onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
              placeholder="Leave empty to use a 6-digit passcode"
            />
            {!createForm.password && (
              <p className="mt-1 text-[11px] text-ink-500">
                A 6-digit passcode is generated. Give it to the user – on the sign-in page they choose
                “New user / set password”, enter their e-mail and the passcode, and pick a password.
              </p>
            )}
          </Field>

          <div className="flex items-center gap-2 pt-2">
            <input
              id="createActive"
              type="checkbox"
              checked={createForm.active}
              onChange={(e) => setCreateForm({ ...createForm, active: e.target.checked })}
              className="rounded border-ink-300 text-brand-600 focus:ring-brand-500"
            />
            <label htmlFor="createActive" className="text-xs font-medium text-ink-700">
              Account Active immediately
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-ink-100">
            <Button variant="outline" type="button" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={createLoading}>
              Create User
            </Button>
          </div>
        </form>
      </Dialog>

      {/* 2. Create / Edit Role Modal (D365FO Security Configuration) */}
      <Dialog
        open={roleModalOpen}
        onClose={() => setRoleModalOpen(false)}
        title={
          roleModalMode === "create"
            ? "Create New Custom Role (D365FO Security Configuration)"
            : roleModalMode === "edit"
            ? `Edit Role: ${roleForm.name} (Security Configuration)`
            : `Role Permissions: ${roleForm.name} (Security Configuration)`
        }
        width="max-w-5xl w-11/12"
      >
        <form onSubmit={handleSaveRole} className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
          {/* Top Banner / Explainer */}
          <div className="rounded-lg border border-brand-200 bg-brand-50/50 p-3 flex items-start gap-2.5 text-xs text-brand-900">
            <ShieldCheck className="h-4 w-4 text-brand-700 mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              <span className="font-bold">Dynamics 365 F&amp;O Security Configuration Model:</span>
              <p className="text-brand-800 text-[11px] leading-relaxed">
                Configure granular <strong>Read (R)</strong>, <strong>Write / Create (W)</strong>, <strong>Update (U)</strong>, and <strong>Delete (D)</strong> permissions for every menu and page.
                Granting Write, Update, or Delete automatically enables Read access. Unchecking Read automatically removes modification privileges for that page.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Role Name *" hint="Unique role name (e.g. Dispatcher, Warehouse Lead)">
              <Input
                disabled={roleModalMode === "view"}
                required
                value={roleForm.name}
                onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                placeholder="e.g. Dispatcher"
              />
            </Field>

            <Field label="Description" hint="Brief explanation of duties &amp; operational scope">
              <Input
                disabled={roleModalMode === "view"}
                value={roleForm.description}
                onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                placeholder="e.g. Authorized to inspect orders, verify checklists, and generate CMRs"
              />
            </Field>
          </div>

          {/* D365FO Security Action Toolbar */}
          <div className="pt-2 border-t border-ink-100 flex flex-wrap items-center justify-between gap-2.5">
            {/* Search Filter */}
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-400" />
              <input
                type="text"
                value={roleSearch}
                onChange={(e) => setRoleSearch(e.target.value)}
                placeholder="Filter pages &amp; menus..."
                className="w-full rounded-md border border-ink-200 bg-white py-1.5 pl-8 pr-7 text-xs text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              {roleSearch && (
                <button
                  type="button"
                  onClick={() => setRoleSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Presets & Column Actions */}
            {roleModalMode !== "view" && (
              <div className="flex items-center gap-1.5 flex-wrap text-xs">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={grantFullAccess}
                  className="text-[11px] h-7 px-2 font-semibold text-emerald-700 hover:bg-emerald-50 border-emerald-200 gap-1"
                >
                  <CheckSquare className="h-3 w-3" /> Full Access
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={grantReadOnlyAccess}
                  className="text-[11px] h-7 px-2 font-semibold text-sky-700 hover:bg-sky-50 border-sky-200 gap-1"
                >
                  <Eye className="h-3 w-3" /> Read Only
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={clearAllPermissions}
                  className="text-[11px] h-7 px-2 text-ink-600 hover:bg-ink-50 gap-1"
                >
                  <Square className="h-3 w-3" /> Clear All
                </Button>
              </div>
            )}
          </div>

          {/* D365FO Security Matrix Table */}
          <div className="space-y-4">
            {(["Documents & Operations", "Templates & Configuration", "Administration & Security"] as const).map(
              (category) => {
                const filteredResources = PAGE_RESOURCES.filter(
                  (res) =>
                    res.category === category &&
                    (!roleSearch ||
                      res.name.toLowerCase().includes(roleSearch.toLowerCase()) ||
                      res.route.toLowerCase().includes(roleSearch.toLowerCase()) ||
                      res.description.toLowerCase().includes(roleSearch.toLowerCase()))
                );

                if (filteredResources.length === 0) return null;

                return (
                  <div key={category} className="rounded-xl border border-ink-200 bg-white overflow-hidden shadow-2xs">
                    {/* Category Header */}
                    <div className="bg-ink-50/90 px-3.5 py-2 border-b border-ink-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-ink-800">
                          {category}
                        </span>
                        <span className="text-[10px] font-mono text-ink-500 bg-ink-100 px-1.5 py-0.2 rounded">
                          {filteredResources.length} {filteredResources.length === 1 ? "menu" : "menus"}
                        </span>
                      </div>

                      {roleModalMode !== "view" && (
                        <div className="flex items-center gap-2 text-[10.5px]">
                          <span className="text-ink-400 font-medium">Batch:</span>
                          <button
                            type="button"
                            onClick={() => {
                              filteredResources.forEach((res) => setRowPreset(res, "full"));
                            }}
                            className="text-emerald-700 hover:underline font-semibold"
                          >
                            All Full
                          </button>
                          <span className="text-ink-300">&bull;</span>
                          <button
                            type="button"
                            onClick={() => {
                              filteredResources.forEach((res) => setRowPreset(res, "read"));
                            }}
                            className="text-sky-700 hover:underline font-semibold"
                          >
                            All Read
                          </button>
                          <span className="text-ink-300">&bull;</span>
                          <button
                            type="button"
                            onClick={() => {
                              filteredResources.forEach((res) => setRowPreset(res, "none"));
                            }}
                            className="text-ink-500 hover:underline"
                          >
                            Clear
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-ink-100 bg-slate-50/50 text-[11px] font-semibold text-ink-700">
                            <th className="py-2 px-3 w-[40%]">Page / Menu Item</th>
                            <th className="py-2 px-2 text-center w-[12%]">
                              <span className="inline-flex items-center gap-1 text-sky-700 font-bold">
                                Read (R)
                              </span>
                            </th>
                            <th className="py-2 px-2 text-center w-[12%]">
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                                Write (W)
                              </span>
                            </th>
                            <th className="py-2 px-2 text-center w-[12%]">
                              <span className="inline-flex items-center gap-1 text-amber-700 font-bold">
                                Update (U)
                              </span>
                            </th>
                            <th className="py-2 px-2 text-center w-[12%]">
                              <span className="inline-flex items-center gap-1 text-rose-700 font-bold">
                                Delete (D)
                              </span>
                            </th>
                            <th className="py-2 px-3 text-right w-[12%]">Quick Access</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-ink-100">
                          {filteredResources.map((res) => {
                            const hasRead = roleForm.capabilities.includes(`${res.id}:read`);
                            const hasCreate = roleForm.capabilities.includes(`${res.id}:create`);
                            const hasUpdate = roleForm.capabilities.includes(`${res.id}:update`);
                            const hasDelete = roleForm.capabilities.includes(`${res.id}:delete`);

                            const supportsCreate = res.supportedActions.includes("create");
                            const supportsUpdate = res.supportedActions.includes("update");
                            const supportsDelete = res.supportedActions.includes("delete");

                            const isFull =
                              hasRead &&
                              (!supportsCreate || hasCreate) &&
                              (!supportsUpdate || hasUpdate) &&
                              (!supportsDelete || hasDelete);

                            return (
                              <tr
                                key={res.id}
                                className={`transition-colors ${
                                  hasRead ? "bg-white hover:bg-slate-50/80" : "bg-slate-50/40 opacity-70 hover:opacity-100"
                                }`}
                              >
                                {/* Resource name & description */}
                                <td className="py-2.5 px-3">
                                  <div className="space-y-0.5">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-bold text-ink-900 text-xs">{res.name}</span>
                                      <code className="text-[10px] font-mono text-ink-500 bg-ink-100 px-1 py-0.2 rounded">
                                        {res.route}
                                      </code>
                                    </div>
                                    <p className="text-[11px] text-ink-500 line-clamp-1">{res.description}</p>
                                  </div>
                                </td>

                                {/* Read Checkbox */}
                                <td className="py-2 px-2 text-center">
                                  <label className="inline-flex items-center justify-center cursor-pointer">
                                    <input
                                      type="checkbox"
                                      disabled={roleModalMode === "view"}
                                      checked={hasRead}
                                      onChange={() => togglePerm(res.id, "read")}
                                      className="h-4 w-4 rounded border-sky-300 text-sky-600 focus:ring-sky-500"
                                      title={res.actionLabels?.read || "Read permission"}
                                    />
                                  </label>
                                </td>

                                {/* Create / Write Checkbox */}
                                <td className="py-2 px-2 text-center">
                                  {supportsCreate ? (
                                    <label className="inline-flex items-center justify-center cursor-pointer">
                                      <input
                                        type="checkbox"
                                        disabled={roleModalMode === "view"}
                                        checked={hasCreate}
                                        onChange={() => togglePerm(res.id, "create")}
                                        className="h-4 w-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                                        title={res.actionLabels?.create || "Write / Create permission"}
                                      />
                                    </label>
                                  ) : (
                                    <span className="text-ink-300 font-mono text-xs select-none">&mdash;</span>
                                  )}
                                </td>

                                {/* Update Checkbox */}
                                <td className="py-2 px-2 text-center">
                                  {supportsUpdate ? (
                                    <label className="inline-flex items-center justify-center cursor-pointer">
                                      <input
                                        type="checkbox"
                                        disabled={roleModalMode === "view"}
                                        checked={hasUpdate}
                                        onChange={() => togglePerm(res.id, "update")}
                                        className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                                        title={res.actionLabels?.update || "Update permission"}
                                      />
                                    </label>
                                  ) : (
                                    <span className="text-ink-300 font-mono text-xs select-none">&mdash;</span>
                                  )}
                                </td>

                                {/* Delete Checkbox */}
                                <td className="py-2 px-2 text-center">
                                  {supportsDelete ? (
                                    <label className="inline-flex items-center justify-center cursor-pointer">
                                      <input
                                        type="checkbox"
                                        disabled={roleModalMode === "view"}
                                        checked={hasDelete}
                                        onChange={() => togglePerm(res.id, "delete")}
                                        className="h-4 w-4 rounded border-rose-300 text-rose-600 focus:ring-rose-500"
                                        title={res.actionLabels?.delete || "Delete permission"}
                                      />
                                    </label>
                                  ) : (
                                    <span className="text-ink-300 font-mono text-xs select-none">&mdash;</span>
                                  )}
                                </td>

                                {/* Row Presets */}
                                <td className="py-2 px-3 text-right">
                                  {roleModalMode !== "view" ? (
                                    <div className="inline-flex items-center rounded-md border border-ink-200 bg-ink-50 p-0.5 text-[10px]">
                                      <button
                                        type="button"
                                        onClick={() => setRowPreset(res, "full")}
                                        className={`px-1.5 py-0.5 rounded font-medium transition-colors ${
                                          isFull
                                            ? "bg-emerald-600 text-white shadow-2xs font-bold"
                                            : "text-ink-600 hover:text-ink-900"
                                        }`}
                                        title="Grant full CRUD access to this page"
                                      >
                                        Full
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setRowPreset(res, "read")}
                                        className={`px-1.5 py-0.5 rounded font-medium transition-colors ${
                                          hasRead && !hasCreate && !hasUpdate && !hasDelete
                                            ? "bg-sky-600 text-white shadow-2xs font-bold"
                                            : "text-ink-600 hover:text-ink-900"
                                        }`}
                                        title="Grant read-only access to this page"
                                      >
                                        Read
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setRowPreset(res, "none")}
                                        className={`px-1.5 py-0.5 rounded font-medium transition-colors ${
                                          !hasRead
                                            ? "bg-ink-400 text-white shadow-2xs font-bold"
                                            : "text-ink-600 hover:text-ink-900"
                                        }`}
                                        title="Revoke all access to this page"
                                      >
                                        None
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-[11px] font-mono text-ink-500 font-semibold">
                                      {isFull ? "Full CRUD" : hasRead ? "Custom" : "No Access"}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              }
            )}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-ink-100 flex-wrap gap-2">
            <span className="text-xs text-ink-500 font-mono">
              {roleForm.capabilities.filter((c) => c.includes(":")).length} Granular Permissions Active
            </span>

            <div className="flex items-center gap-2">
              <Button variant="outline" type="button" onClick={() => setRoleModalOpen(false)}>
                {roleModalMode === "view" ? "Close" : "Cancel"}
              </Button>
              {roleModalMode !== "view" && (
                <Button variant="primary" type="submit" loading={roleLoading}>
                  {roleModalMode === "create" ? "Create Custom Role" : "Save Security Configuration"}
                </Button>
              )}
            </div>
          </div>
        </form>
      </Dialog>

      {/* 3. Delete Role Modal */}
      <Dialog
        open={Boolean(deleteRoleTarget)}
        onClose={() => setDeleteRoleTarget(null)}
        title="Confirm Role Deletion"
      >
        <div className="space-y-3 text-xs">
          <p className="text-ink-700">
            Are you sure you want to delete the custom role{" "}
            <strong className="text-ink-900">{deleteRoleTarget?.name}</strong>?
          </p>

          {(deleteRoleTarget?.user_count ?? 0) > 0 ? (
            <Alert tone="danger">
              There are currently <strong>{deleteRoleTarget?.user_count}</strong> user(s) assigned to this role. You must reassign those users to another role before deleting.
            </Alert>
          ) : (
            <p className="text-ink-500">
              This action cannot be undone. Users will no longer be able to receive this role.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-ink-100">
            <Button variant="outline" onClick={() => setDeleteRoleTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={(deleteRoleTarget?.user_count ?? 0) > 0}
              loading={deleteRoleLoading}
              onClick={handleDeleteRole}
            >
              Delete Role
            </Button>
          </div>
        </div>
      </Dialog>

      {/* One-time passcode for the admin to hand over */}
      <Dialog open={Boolean(passcodeInfo)} onClose={() => setPasscodeInfo(null)} title="Passcode for first sign-in">
        {passcodeInfo && (
          <div className="space-y-4 text-sm">
            <p className="text-ink-700">
              Give this passcode to <strong>{passcodeInfo.email}</strong>. On the sign-in page they choose
              <strong> “New user / set password”</strong>, enter their e-mail and this passcode, and pick their own password.
            </p>
            <div className="flex items-center justify-center gap-3 rounded-xl border-2 border-dashed border-brand-300 bg-brand-50 py-5">
              <span className="font-mono text-3xl font-bold tracking-[0.35em] text-ink-900">{passcodeInfo.code}</span>
              <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(passcodeInfo.code).then(() => toast.success("Copied"), () => {})}>
                Copy
              </Button>
            </div>
            <p className="text-xs text-ink-500">
              Single use{passcodeInfo.expiresAt ? `, valid until ${new Date(passcodeInfo.expiresAt).toLocaleDateString()}` : ""}. It stays visible in the
              user list until the password is set. Five wrong tries lock it – then issue a new one.
            </p>
            <div className="flex justify-end">
              <Button onClick={() => setPasscodeInfo(null)}>Done</Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* 4. Reset Password Modal */}
      <Dialog
        open={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
        title={`Reset Password: ${resetTarget?.email}`}
      >
        <form onSubmit={handleResetPassword} className="space-y-4">
          <p className="text-xs text-ink-600">
            Enter a new password for <strong className="text-ink-900">{resetTarget?.email}</strong>. The user can use this password to sign in immediately.
          </p>

          <Field label="New Password *" hint="Must be at least 6 characters">
            <Input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
            />
          </Field>

          <Field label="Confirm Password *">
            <Input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
            />
          </Field>

          <div className="flex justify-end gap-2 pt-4 border-t border-ink-100">
            <Button variant="outline" type="button" onClick={() => setResetTarget(null)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={resetLoading}>
              Save New Password
            </Button>
          </div>
        </form>
      </Dialog>

      {/* 5. Delete User Confirmation Modal */}
      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Confirm User Deletion"
      >
        <div className="space-y-3 text-xs">
          <p className="text-ink-700">
            Are you sure you want to permanently delete the user account for{" "}
            <strong className="text-ink-900">{deleteTarget?.email}</strong>?
          </p>
          <p className="text-ink-500">
            This will remove their login access and history. Historical CMR consignment notes previously issued by this user will remain preserved in the audit log.
          </p>
          <div className="flex justify-end gap-2 pt-3 border-t border-ink-100">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={deleteLoading} onClick={handleDeleteUser}>
              Delete Account
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

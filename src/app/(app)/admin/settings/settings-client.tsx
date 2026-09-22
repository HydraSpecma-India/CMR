"use client";

import { useState, useEffect } from "react";
import {
  PageHeader,
  Card,
  CardHeader,
  CardBody,
  Badge,
  Button,
  Input,
  Select,
  Field,
  Label,
  Alert,
} from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/utils/fetcher";
import { KeyRound, Database, Share2, Cog, RefreshCw, CheckCircle2, AlertCircle, Hash, Send, Building2, Plus, Trash2, Network } from "lucide-react";
import { CmrNumberingPanel } from "./cmr-numbering-panel";

interface ConfigState {
  entra: {
    clientId: string;
    clientSecret: string;
    hasSecret: boolean;
    tenantId: string;
    issuer: string;
    adminEmails: string;
    devBypass: boolean;
  };
  d365: {
    connectionSource: "coc" | "own";
    mode: "mock" | "live";
    baseUrl: string;
    tenantId: string;
    clientId: string;
    clientSecret: string;
    hasSecret: boolean;
    company: string;
    packingSlipHeaderEntity: string;
    packingSlipLineEntity: string;
    salesOrderEntity?: string;
  };
  sharepoint: {
    mode: "mock" | "live";
    tenantId: string;
    clientId: string;
    clientSecret: string;
    hasSecret: boolean;
    siteId: string;
    driveId: string;
    rootFolder: string;
  };
  app: {
    name: string;
    url: string;
    automationApiKey: string;
    hasApiKey: boolean;
    logLevel: "debug" | "info" | "warn" | "error";
    numberFormat: string;
    numberAuthority: "app" | "d365";
    oneCmrPerPackingSlip: boolean;
    signatureRequired: boolean;
    loginRedirectUrl: string;
    sessionTimeoutMinutes: number;
  };
  teams?: {
    enabled: boolean;
    webhookUrl: string;
    companyWebhooks?: Record<string, string>;
  };
}

export function SettingsClient({ initialConfig }: { initialConfig: ConfigState }) {
  const [config, setConfig] = useState<ConfigState>(initialConfig);
  const [activeTab, setActiveTab] = useState<"entra" | "d365" | "sharepoint" | "app" | "sequences" | "teams" | "architecture">("d365");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [availableCompanies, setAvailableCompanies] = useState<{ code: string; name: string }[]>([]);
  const [newCompanyCode, setNewCompanyCode] = useState("");
  const [newCompanyWebhook, setNewCompanyWebhook] = useState("");

  useEffect(() => {
    api<{ ok: boolean; companies: { code: string; name: string }[] }>("/api/d365/companies")
      .then((res) => {
        if (res.ok && res.companies) {
          setAvailableCompanies(res.companies);
        }
      })
      .catch(() => {});
  }, []);

  const saveConfig = async (section: "entra" | "d365" | "sharepoint" | "app" | "teams") => {
    setSaving(true);
    setTestResult(null);
    try {
      const payload: Record<string, unknown> = {};
      payload[section] = config[section];

      const res = await api<{ ok: boolean; count: number }>("/api/admin/config", {
        method: "PUT",
        json: payload,
      });

      if (res.ok) {
        toast.success("Settings saved successfully to Supabase!");
      }
    } catch (e) {
      toast.error("Failed to save settings", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async (target: "d365" | "sharepoint" | "teams", specificWebhookUrl?: string) => {
    const testKey = specificWebhookUrl ? `teams-${specificWebhookUrl}` : target;
    setTesting(testKey);
    setTestResult(null);
    try {
      const res = await api<{ ok: boolean; message?: string; error?: string }>("/api/admin/config/test", {
        method: "POST",
        json: { target, webhookUrl: target === "teams" ? (specificWebhookUrl || config.teams?.webhookUrl) : undefined },
      });
      if (res.ok) {
        setTestResult({ ok: true, message: res.message || "Connection succeeded!" });
        toast.success("Connection test passed!");
      } else {
        setTestResult({ ok: false, message: res.error || "Connection test failed." });
        toast.error("Connection test failed", res.error);
      }
    } catch (e) {
      const msg = (e as Error).message;
      setTestResult({ ok: false, message: msg });
      toast.error("Connection test failed", msg);
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="w-full pb-16">
      <PageHeader
        title="System Settings & Integrations"
        description="Configure Dynamics 365, Microsoft Entra SSO, SharePoint, and application rules. Settings are saved to Supabase and take effect immediately."
      />

      {/* Tabs */}
      <div className="mb-6 flex border-b border-ink-200">
        <button
          onClick={() => { setActiveTab("d365"); setTestResult(null); }}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "d365"
              ? "border-brand-500 text-brand-700"
              : "border-transparent text-ink-600 hover:text-ink-900"
          }`}
        >
          <Database className="h-4 w-4" />
          Dynamics 365 F&O
        </button>

        <button
          onClick={() => { setActiveTab("entra"); setTestResult(null); }}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "entra"
              ? "border-brand-500 text-brand-700"
              : "border-transparent text-ink-600 hover:text-ink-900"
          }`}
        >
          <KeyRound className="h-4 w-4" />
          Microsoft Entra ID (SSO)
        </button>

        <button
          onClick={() => { setActiveTab("sharepoint"); setTestResult(null); }}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "sharepoint"
              ? "border-brand-500 text-brand-700"
              : "border-transparent text-ink-600 hover:text-ink-900"
          }`}
        >
          <Share2 className="h-4 w-4" />
          SharePoint & Storage
        </button>

        <button
          onClick={() => { setActiveTab("app"); setTestResult(null); }}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "app"
              ? "border-brand-500 text-brand-700"
              : "border-transparent text-ink-600 hover:text-ink-900"
          }`}
        >
          <Cog className="h-4 w-4" />
          App & Document Rules
        </button>

        <button
          onClick={() => { setActiveTab("sequences"); setTestResult(null); }}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "sequences"
              ? "border-brand-500 text-brand-700"
              : "border-transparent text-ink-600 hover:text-ink-900"
          }`}
        >
          <Hash className="h-4 w-4" />
          Number Sequences
        </button>

        <button
          onClick={() => { setActiveTab("teams"); setTestResult(null); }}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "teams"
              ? "border-brand-500 text-brand-700"
              : "border-transparent text-ink-600 hover:text-ink-900"
          }`}
        >
          <Send className="h-4 w-4" />
          Teams Webhook
        </button>

      </div>

      {testResult && (
        <div className="mb-6">
          <Alert tone={testResult.ok ? "success" : "danger"} title={testResult.ok ? "Connection Successful" : "Connection Error"}>
            <div className="flex items-center gap-2">
              {testResult.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertCircle className="h-4 w-4 text-red-600" />}
              <span>{testResult.message}</span>
            </div>
          </Alert>
        </div>
      )}

      {/* D365FO Tab */}
      {activeTab === "d365" && (
        <Card>
          <CardHeader
            title="Dynamics 365 Finance & Operations Integration"
            description="Manage OData connection details for reading packing slips, sales orders, customers, products and carriers."
            actions={
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  loading={testing === "d365"}
                  onClick={() => testConnection("d365")}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Test Connection
                </Button>
                <Button size="sm" loading={saving} onClick={() => saveConfig("d365")}>
                  Save D365 Settings
                </Button>
              </div>
            }
          />
          <CardBody className="space-y-4">
            <div className="rounded-lg border border-brand-200 bg-brand-50/60 p-4 space-y-2">
              <Label>D365 connection</Label>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="d365Source"
                    checked={config.d365.connectionSource !== "own"}
                    onChange={() => setConfig({ ...config, d365: { ...config.d365, connectionSource: "coc" } })}
                    className="accent-brand-600"
                  />
                  <span className="font-medium">Same as COC app</span>
                  <Badge tone="success">recommended</Badge>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="d365Source"
                    checked={config.d365.connectionSource === "own"}
                    onChange={() => setConfig({ ...config, d365: { ...config.d365, connectionSource: "own" } })}
                    className="accent-brand-600"
                  />
                  <span className="font-medium">Own connection for CMR</span>
                </label>
              </div>
              {config.d365.connectionSource !== "own" && (
                <p className="text-xs text-ink-600">
                  Mode, base URL, tenant and client ID are read from the COC app&apos;s D365 settings and can only be changed there.
                  The client secret is taken from the COC settings if it is stored there, otherwise from this server&apos;s
                  <code className="mx-1">D365_CLIENT_SECRET</code> environment variable (use the same value as the COC server).
                  Legal entity and entities below stay CMR-specific.
                </p>
              )}
            </div>
            <div className="rounded-lg border border-ink-200 bg-ink-50 p-4">
              <Label>Integration Mode</Label>
              <div className="mt-2 flex gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="d365Mode"
                    value="mock"
                    checked={config.d365.mode === "mock"}
                    disabled={config.d365.connectionSource !== "own"}
                    onChange={() => setConfig({ ...config, d365: { ...config.d365, mode: "mock" } })}
                    className="accent-brand-600"
                  />
                  <span className="font-medium">Standard Catalog Mode</span>
                  <Badge tone="neutral">Built-in HydraSpecma catalog</Badge>
                </label>

                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="d365Mode"
                    value="live"
                    checked={config.d365.mode === "live"}
                    disabled={config.d365.connectionSource !== "own"}
                    onChange={() => setConfig({ ...config, d365: { ...config.d365, mode: "live" } })}
                    className="accent-brand-600"
                  />
                  <span className="font-medium">LIVE D365FO OData</span>
                  <Badge tone="success">Connects to your D365 tenant</Badge>
                </label>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="D365 Base URL" hint="e.g. https://<env>.operations.dynamics.com">
                <Input
                  value={config.d365.baseUrl}
                  placeholder="https://hydraspecma.operations.dynamics.com"
                  disabled={config.d365.connectionSource !== "own"}
                  onChange={(e) => setConfig({ ...config, d365: { ...config.d365, baseUrl: e.target.value } })}
                />
              </Field>

              <Field label="Legal Entity / Company" hint="Default legal entity in the CMR wizard">
                <Input
                  value={config.d365.company}
                  placeholder="e.g. HSDK"
                  onChange={(e) => setConfig({ ...config, d365: { ...config.d365, company: e.target.value } })}
                />
              </Field>

              <Field label="Azure Tenant ID" hint="Directory (tenant) ID">
                <Input
                  value={config.d365.tenantId}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  disabled={config.d365.connectionSource !== "own"}
                  onChange={(e) => setConfig({ ...config, d365: { ...config.d365, tenantId: e.target.value } })}
                />
              </Field>

              <Field label="Client ID" hint="Application (client) ID for D365 API">
                <Input
                  value={config.d365.clientId}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  disabled={config.d365.connectionSource !== "own"}
                  onChange={(e) => setConfig({ ...config, d365: { ...config.d365, clientId: e.target.value } })}
                />
              </Field>

              <div className="md:col-span-2">
                <Field
                  label="Client Secret"
                  hint={config.d365.hasSecret ? "(Secret currently saved. Enter new value to change.)" : "(No secret set)"}
                >
                  <Input
                    type="password"
                    value={config.d365.clientSecret}
                    placeholder={config.d365.hasSecret ? "••••••••••••" : "Enter D365 client secret"}
                    disabled={config.d365.connectionSource !== "own"}
                  onChange={(e) => setConfig({ ...config, d365: { ...config.d365, clientSecret: e.target.value } })}
                  />
                </Field>
              </div>

              <Field label="Packing slip header entity" hint="Default: CustPackingSlipJourBiEntities">
                <Input
                  value={config.d365.packingSlipHeaderEntity}
                  onChange={(e) => setConfig({ ...config, d365: { ...config.d365, packingSlipHeaderEntity: e.target.value } })}
                />
              </Field>

              <Field label="Packing slip line entity" hint="Default: CustPackingSlipTransBiEntities">
                <Input
                  value={config.d365.packingSlipLineEntity}
                  onChange={(e) => setConfig({ ...config, d365: { ...config.d365, packingSlipLineEntity: e.target.value } })}
                />
              </Field>

              <Field label="Sales order header entity" hint="Default: SalesOrderHeadersV2 (delivery address, Incoterms, carrier)">
                <Input
                  value={config.d365.salesOrderEntity || "SalesOrderHeadersV2"}
                  onChange={(e) => setConfig({ ...config, d365: { ...config.d365, salesOrderEntity: e.target.value } })}
                  placeholder="SalesOrderHeadersV2"
                />
              </Field>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Entra ID Tab */}
      {activeTab === "entra" && (
        <Card>
          <CardHeader
            title="Microsoft Entra ID (Azure AD SSO)"
            description="Configure single sign-on authentication for HydraSpecma users."
            actions={
              <Button size="sm" loading={saving} onClick={() => saveConfig("entra")}>
                Save Entra Settings
              </Button>
            }
          />
          <CardBody className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-amber-900">Development Sign-in Bypass</div>
                  <div className="text-xs text-amber-700">
                    Enables a one-click local login with role selection on preview and production without needing Entra ID setup.
                  </div>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={config.entra.devBypass}
                    onChange={(e) => setConfig({ ...config, entra: { ...config.entra, devBypass: e.target.checked } })}
                    className="h-5 w-5 rounded border-ink-300 accent-amber-600 cursor-pointer"
                  />
                  <span className="ml-2 text-sm font-medium text-amber-900">
                    {config.entra.devBypass ? "Enabled" : "Disabled"}
                  </span>
                </label>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Application (Client) ID">
                <Input
                  value={config.entra.clientId}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  onChange={(e) => setConfig({ ...config, entra: { ...config.entra, clientId: e.target.value } })}
                />
              </Field>

              <Field label="Directory (Tenant) ID">
                <Input
                  value={config.entra.tenantId}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  onChange={(e) => setConfig({ ...config, entra: { ...config.entra, tenantId: e.target.value } })}
                />
              </Field>

              <div className="md:col-span-2">
                <Field
                  label="Client Secret"
                  hint={config.entra.hasSecret ? "(Secret currently saved. Enter new value to change.)" : "(No secret set)"}
                >
                  <Input
                    type="password"
                    value={config.entra.clientSecret}
                    placeholder={config.entra.hasSecret ? "••••••••••••" : "Enter Entra ID client secret"}
                    onChange={(e) => setConfig({ ...config, entra: { ...config.entra, clientSecret: e.target.value } })}
                  />
                </Field>
              </div>

              <Field label="Custom Issuer URL" hint="Leave blank to auto-generate from Tenant ID">
                <Input
                  value={config.entra.issuer}
                  placeholder="https://login.microsoftonline.com/<tenant-id>/v2.0"
                  onChange={(e) => setConfig({ ...config, entra: { ...config.entra, issuer: e.target.value } })}
                />
              </Field>

              <Field label="Bootstrap Admin Emails" hint="Comma-separated emails granting Admin role">
                <Input
                  value={config.entra.adminEmails}
                  placeholder="manigandan.parthasarathi@hydraspecma.com"
                  onChange={(e) => setConfig({ ...config, entra: { ...config.entra, adminEmails: e.target.value } })}
                />
              </Field>
            </div>
          </CardBody>
        </Card>
      )}

      {/* SharePoint Tab */}
      {activeTab === "sharepoint" && (
        <Card>
          <CardHeader
            title="SharePoint & Document Storage"
            description="Manage Microsoft Graph API settings for storing finalized CMR PDF forms in SharePoint."
            actions={
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  loading={testing === "sharepoint"}
                  onClick={() => testConnection("sharepoint")}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Test Connection
                </Button>
                <Button size="sm" loading={saving} onClick={() => saveConfig("sharepoint")}>
                  Save SharePoint Settings
                </Button>
              </div>
            }
          />
          <CardBody className="space-y-4">
            <div className="rounded-lg border border-ink-200 bg-ink-50 p-4">
              <Label>Storage Mode</Label>
              <div className="mt-2 flex gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="spMode"
                    value="mock"
                    checked={config.sharepoint.mode === "mock"}
                    onChange={() => setConfig({ ...config, sharepoint: { ...config.sharepoint, mode: "mock" } })}
                    className="accent-brand-600"
                  />
                  <span className="font-medium">HydraSpecma Cloud Storage</span>
                  <Badge tone="info">Stores PDFs in secure cloud storage bucket</Badge>
                </label>

                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="spMode"
                    value="live"
                    checked={config.sharepoint.mode === "live"}
                    onChange={() => setConfig({ ...config, sharepoint: { ...config.sharepoint, mode: "live" } })}
                    className="accent-brand-600"
                  />
                  <span className="font-medium">LIVE SharePoint via Graph API</span>
                  <Badge tone="success">Direct upload to company document library</Badge>
                </label>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Azure Tenant ID">
                <Input
                  value={config.sharepoint.tenantId}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  onChange={(e) => setConfig({ ...config, sharepoint: { ...config.sharepoint, tenantId: e.target.value } })}
                />
              </Field>

              <Field label="Application (Client) ID">
                <Input
                  value={config.sharepoint.clientId}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  onChange={(e) => setConfig({ ...config, sharepoint: { ...config.sharepoint, clientId: e.target.value } })}
                />
              </Field>

              <div className="md:col-span-2">
                <Field
                  label="Client Secret"
                  hint={config.sharepoint.hasSecret ? "(Secret currently saved. Enter new value to change.)" : "(No secret set)"}
                >
                  <Input
                    type="password"
                    value={config.sharepoint.clientSecret}
                    placeholder={config.sharepoint.hasSecret ? "••••••••••••" : "Enter Graph client secret"}
                    onChange={(e) => setConfig({ ...config, sharepoint: { ...config.sharepoint, clientSecret: e.target.value } })}
                  />
                </Field>
              </div>

              <Field label="SharePoint Site ID" hint="hostname,siteCollectionId,siteId">
                <Input
                  value={config.sharepoint.siteId}
                  placeholder="hydraspecma.sharepoint.com,uuid,uuid"
                  onChange={(e) => setConfig({ ...config, sharepoint: { ...config.sharepoint, siteId: e.target.value } })}
                />
              </Field>

              <Field label="Document Library / Drive ID">
                <Input
                  value={config.sharepoint.driveId}
                  placeholder="b!..."
                  onChange={(e) => setConfig({ ...config, sharepoint: { ...config.sharepoint, driveId: e.target.value } })}
                />
              </Field>

              <Field label="Root Folder" hint="Default: CMR">
                <Input
                  value={config.sharepoint.rootFolder}
                  placeholder="CMR"
                  onChange={(e) => setConfig({ ...config, sharepoint: { ...config.sharepoint, rootFolder: e.target.value } })}
                />
              </Field>
            </div>
          </CardBody>
        </Card>
      )}

      {/* App & Document Rules Tab */}
      {activeTab === "app" && (
        <Card>
          <CardHeader
            title="Application & Document Rules"
            description="Numbering formats, quantity policies, and branding."
            actions={
              <Button size="sm" loading={saving} onClick={() => saveConfig("app")}>
                Save Rules
              </Button>
            }
          />
          <CardBody className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Application Name">
                <Input
                  value={config.app.name}
                  onChange={(e) => setConfig({ ...config, app: { ...config.app, name: e.target.value } })}
                />
              </Field>

              <Field label="Public Application URL">
                <Input
                  value={config.app.url}
                  placeholder="https://cmr.hydraspecma.com"
                  onChange={(e) => setConfig({ ...config, app: { ...config.app, url: e.target.value } })}
                />
              </Field>

              <Field label="Login Redirect URL" hint="Sign-out & session-timeout go here. Blank = this site's /signin">
                <Input
                  value={config.app.loginRedirectUrl ?? ""}
                  placeholder="https://cmr.hydraspecma.com/signin"
                  onChange={(e) => setConfig({ ...config, app: { ...config.app, loginRedirectUrl: e.target.value } })}
                />
              </Field>

              <Field label="Session Timeout (minutes)" hint="Inactivity auto sign-out, 5–480">
                <Input
                  type="number"
                  min={5}
                  max={480}
                  value={config.app.sessionTimeoutMinutes ?? 30}
                  onChange={(e) => setConfig({ ...config, app: { ...config.app, sessionTimeoutMinutes: Number(e.target.value) || 30 } })}
                />
              </Field>

              <Field label="CMR Number Format Pattern" hint="Tokens: {yyyy}, {seq:4}">
                <Input
                  value={config.app.numberFormat}
                  placeholder="CMR-{yyyy}-{seq:4}"
                  onChange={(e) => setConfig({ ...config, app: { ...config.app, numberFormat: e.target.value } })}
                />
              </Field>

              <Field label="Number Authority" hint="Who issues official CMR number">
                <select
                  value={config.app.numberAuthority}
                  onChange={(e) => setConfig({ ...config, app: { ...config.app, numberAuthority: e.target.value as "app" | "d365" } })}
                  className="w-full rounded-md border border-ink-300 bg-white px-2.5 h-9 text-sm text-ink-900"
                >
                  <option value="app">App (Automatic sequential number)</option>
                  <option value="d365">Dynamics 365 (Assigned by D365)</option>
                </select>
              </Field>

              <div className="md:col-span-2 space-y-3 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.app.oneCmrPerPackingSlip}
                    onChange={(e) => setConfig({ ...config, app: { ...config.app, oneCmrPerPackingSlip: e.target.checked } })}
                    className="h-4 w-4 rounded border-ink-300 accent-ink-900"
                  />
                  <span className="text-sm text-ink-800 font-medium">One CMR per packing slip</span>
                  <span className="text-xs text-ink-500">(Blocks a second CMR for the same packing slip until the first is cancelled)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.app.signatureRequired}
                    onChange={(e) => setConfig({ ...config, app: { ...config.app, signatureRequired: e.target.checked } })}
                    className="h-4 w-4 rounded border-ink-300 accent-ink-900"
                  />
                  <span className="text-sm text-ink-800 font-medium">Require Digital Signature for Completion</span>
                  <span className="text-xs text-ink-500">(the sender must sign box 22 digitally before a CMR can be issued)</span>
                </label>
              </div>

              <div className="md:col-span-2 pt-2">
                <Field
                  label="Automation API Key (Power Automate)"
                  hint={config.app.hasApiKey ? "(API key set. Enter new value to rotate)" : "(Optional)"}
                >
                  <Input
                    type="password"
                    value={config.app.automationApiKey}
                    placeholder={config.app.hasApiKey ? "••••••••••••" : "Enter API key for automated headless requests"}
                    onChange={(e) => setConfig({ ...config, app: { ...config.app, automationApiKey: e.target.value } })}
                  />
                </Field>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {activeTab === "sequences" && (
        <>
          <CmrNumberingPanel />
        </>
      )}

      {activeTab === "teams" && (
        <Card>
          <CardHeader
            title="Microsoft Teams Webhook Integration"
            description="Automatically post completed CMR consignment notes with PDF file content to a Microsoft Teams channel via Power Automate webhook."
            actions={
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  loading={testing === "teams"}
                  onClick={() => testConnection("teams")}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Test Connection
                </Button>
                <Button size="sm" loading={saving} onClick={() => saveConfig("teams")}>
                  Save Teams Settings
                </Button>
              </div>
            }
          />
          <CardBody className="space-y-6">
            <div className="rounded-lg border border-ink-200 bg-ink-50 p-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.teams?.enabled ?? true}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      teams: {
                        enabled: e.target.checked,
                        webhookUrl: config.teams?.webhookUrl ?? "",
                      },
                    })
                  }
                  className="h-4 w-4 rounded border-ink-300 accent-ink-900"
                />
                <div>
                  <span className="text-sm font-medium text-ink-900">Enable Automated Teams Notification</span>
                  <p className="text-xs text-ink-500">
                    When enabled, generating a CMR will automatically trigger the Power Automate workflow to post the CMR details and PDF to your Teams channel.
                  </p>
                </div>
              </label>
            </div>

            <div className="space-y-4">
              <Field
                label="Global / Default Power Automate Webhook URL"
                hint="Fallback HTTP POST trigger URL used for all companies without a custom webhook"
              >
                <Input
                  type="url"
                  value={config.teams?.webhookUrl ?? ""}
                  placeholder="https://...powerautomate.com/.../triggers/manual/paths/invoke?..."
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      teams: {
                        enabled: config.teams?.enabled ?? true,
                        webhookUrl: e.target.value,
                        companyWebhooks: config.teams?.companyWebhooks || {},
                      },
                    })
                  }
                />
              </Field>

              {/* Company-Specific Teams Webhooks Section */}
              <div className="pt-4 border-t border-ink-200">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="text-sm font-semibold text-ink-900 flex items-center gap-1.5">
                      <Building2 className="h-4 w-4 text-brand-600" />
                      Company-Specific Teams Webhooks
                    </h3>
                    <p className="text-xs text-ink-500">
                      Configure separate Microsoft Teams channels for each company / legal entity (e.g. one logistics channel per country). Orders for that company will dispatch directly to its channel. If not configured, it falls back to the Global Webhook above.
                    </p>
                  </div>
                </div>

                {/* List of configured company webhooks */}
                <div className="space-y-3 mt-3">
                  {Object.entries(config.teams?.companyWebhooks || {}).map(([compCode, url]) => {
                    const compMeta = availableCompanies.find((c) => c.code === compCode);
                    const isTestingThis = testing === `teams-${url}`;
                    return (
                      <div key={compCode} className="flex flex-col sm:flex-row items-start sm:items-center gap-2 p-3 bg-ink-50 rounded-lg border border-ink-200 text-xs">
                        <div className="w-48 shrink-0">
                          <span className="font-bold font-mono text-brand-800 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                            {compCode}
                          </span>
                          <span className="ml-1.5 text-ink-700 font-medium truncate block sm:inline">
                            {compMeta ? compMeta.name : compCode}
                          </span>
                        </div>
                        <Input
                          type="url"
                          className="flex-1 bg-white text-xs font-mono"
                          value={url}
                          placeholder="https://...powerautomate.com/..."
                          onChange={(e) => {
                            const updated = { ...(config.teams?.companyWebhooks || {}), [compCode]: e.target.value };
                            setConfig({
                              ...config,
                              teams: {
                                enabled: config.teams?.enabled ?? true,
                                webhookUrl: config.teams?.webhookUrl ?? "",
                                companyWebhooks: updated,
                              },
                            });
                          }}
                        />
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            loading={isTestingThis}
                            onClick={() => testConnection("teams", url)}
                            className="text-xs gap-1"
                          >
                            <Send className="h-3 w-3 text-indigo-600" /> Test
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const updated = { ...(config.teams?.companyWebhooks || {}) };
                              delete updated[compCode];
                              setConfig({
                                ...config,
                                teams: {
                                  enabled: config.teams?.enabled ?? true,
                                  webhookUrl: config.teams?.webhookUrl ?? "",
                                  companyWebhooks: updated,
                                },
                              });
                            }}
                            className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Add New Company Webhook Card/Form */}
                  <div className="p-3 bg-brand-50/50 rounded-lg border border-brand-200 text-xs space-y-2">
                    <span className="font-semibold text-ink-900 block">Add Company Webhook:</span>
                    <div className="grid sm:grid-cols-12 gap-2">
                      <div className="sm:col-span-4">
                        <Select
                          value={newCompanyCode}
                          onChange={(e) => setNewCompanyCode(e.target.value)}
                          className="w-full text-xs bg-white"
                        >
                          <option value="">-- Select Company --</option>
                          {availableCompanies
                            .filter((c) => !(config.teams?.companyWebhooks || {})[c.code])
                            .map((c) => (
                              <option key={c.code} value={c.code}>
                                {c.code} - {c.name}
                              </option>
                            ))}
                        </Select>
                      </div>
                      <div className="sm:col-span-6">
                        <Input
                          type="url"
                          value={newCompanyWebhook}
                          onChange={(e) => setNewCompanyWebhook(e.target.value)}
                          placeholder="https://...powerautomate.com/..."
                          className="w-full text-xs font-mono bg-white"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={!newCompanyCode || !newCompanyWebhook}
                          onClick={() => {
                            if (!newCompanyCode || !newCompanyWebhook) return;
                            const updated = {
                              ...(config.teams?.companyWebhooks || {}),
                              [newCompanyCode]: newCompanyWebhook.trim(),
                            };
                            setConfig({
                              ...config,
                              teams: {
                                enabled: config.teams?.enabled ?? true,
                                webhookUrl: config.teams?.webhookUrl ?? "",
                                companyWebhooks: updated,
                              },
                            });
                            setNewCompanyCode("");
                            setNewCompanyWebhook("");
                            toast.success(`Added webhook for ${newCompanyCode}. Click "Save Teams Settings" to save.`);
                          }}
                          className="w-full text-xs gap-1"
                        >
                          <Plus className="h-3 w-3" /> Add
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-brand-100 bg-brand-50 p-4 text-xs text-brand-800 space-y-2">
                <p className="font-semibold text-brand-900">Payload Details Sent to Webhook:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Metadata:</strong> <code>cmrNumber</code>, <code>company</code>, <code>packingSlipId</code>, <code>salesOrder</code>, <code>consigneeName</code>, <code>deliveryPlace</code>, <code>carrierName</code>, <code>vehicleRegistration</code>, <code>takingOverDate</code>, <code>issuedBy</code>, <code>issueDate</code>.</li>
                  <li><strong>Direct File:</strong> <code>fileName</code>, <code>fileContent</code> (Base64-encoded PDF), and <code>fileContentBase64</code>.</li>
                  <li><strong>Power Automate File Object:</strong> <code>file: {"{"} name, contentBytes, "$content-type": "application/pdf" {"}"}</code>.</li>
                  <li><strong>Formatted Notification:</strong> <code>text</code> (Markdown message) and <code>summary</code>.</li>
                </ul>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

    </div>
  );
}

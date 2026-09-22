import { NextResponse } from "next/server";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { getActiveConfig, invalidateConfigCache } from "@/lib/config";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { logger } from "@/lib/logging/logger";

function maskSecret(val: string): string {
  if (!val || val.length === 0) return "";
  if (val.length <= 6) return "••••••";
  return "••••••••" + val.slice(-4);
}

export async function GET() {
  const session = await requireSession();
  requireRole(session, ["Admin"]);

  const config = await getActiveConfig();

  return NextResponse.json({
    ok: true,
    config: {
      entra: {
        clientId: config.entra.clientId,
        clientSecret: maskSecret(config.entra.clientSecret),
        hasSecret: Boolean(config.entra.clientSecret),
        tenantId: config.entra.tenantId,
        issuer: config.entra.issuer,
        adminEmails: config.entra.adminEmails,
        devBypass: config.entra.devBypass,
      },
      d365: {
        connectionSource: config.d365.connectionSource,
        mode: config.d365.mode,
        baseUrl: config.d365.baseUrl,
        tenantId: config.d365.tenantId,
        clientId: config.d365.clientId,
        clientSecret: maskSecret(config.d365.clientSecret),
        hasSecret: Boolean(config.d365.clientSecret),
        company: config.d365.company,
        packingSlipHeaderEntity: config.d365.packingSlipHeaderEntity,
        packingSlipLineEntity: config.d365.packingSlipLineEntity,
      },
      sharepoint: {
        mode: config.sharepoint.mode,
        tenantId: config.sharepoint.tenantId,
        clientId: config.sharepoint.clientId,
        clientSecret: maskSecret(config.sharepoint.clientSecret),
        hasSecret: Boolean(config.sharepoint.clientSecret),
        siteId: config.sharepoint.siteId,
        driveId: config.sharepoint.driveId,
        rootFolder: config.sharepoint.rootFolder,
      },
      app: {
        name: config.app.name,
        url: config.app.url,
        automationApiKey: maskSecret(config.app.automationApiKey),
        hasApiKey: Boolean(config.app.automationApiKey),
        logLevel: config.app.logLevel,
        numberFormat: config.app.numberFormat,
        numberAuthority: config.app.numberAuthority,
        oneCmrPerPackingSlip: config.app.oneCmrPerPackingSlip,
        signatureRequired: config.app.signatureRequired,
        loginRedirectUrl: config.app.loginRedirectUrl,
        sessionTimeoutMinutes: config.app.sessionTimeoutMinutes,
      },
      teams: {
        enabled: config.teams.enabled,
        webhookUrl: config.teams.webhookUrl,
        companyWebhooks: config.teams.companyWebhooks || {},
      },
    },
  });
}

export async function PUT(req: Request) {
  const session = await requireSession();
  requireRole(session, ["Admin"]);

  const body = await req.json();
  const { entra, d365, sharepoint, app, teams } = body;

  const updates: Array<{ key: string; value: unknown; description?: string }> = [];

  // Helper: only update secret if provided and not masked
  const shouldUpdateSecret = (secretVal: unknown) => {
    return typeof secretVal === "string" && secretVal.trim().length > 0 && !secretVal.startsWith("••••");
  };

  if (entra) {
    if (entra.clientId !== undefined) updates.push({ key: "auth.entra.clientId", value: entra.clientId.trim() });
    if (shouldUpdateSecret(entra.clientSecret)) updates.push({ key: "auth.entra.clientSecret", value: entra.clientSecret.trim() });
    if (entra.tenantId !== undefined) updates.push({ key: "auth.entra.tenantId", value: entra.tenantId.trim() });
    if (entra.issuer !== undefined) updates.push({ key: "auth.entra.issuer", value: entra.issuer.trim() });
    if (entra.adminEmails !== undefined) updates.push({ key: "auth.adminEmails", value: entra.adminEmails.trim() });
    if (entra.devBypass !== undefined) updates.push({ key: "auth.devBypass", value: Boolean(entra.devBypass) });
  }

  if (d365) {
    if (d365.connectionSource !== undefined) updates.push({ key: "d365.connectionSource", value: d365.connectionSource === "own" ? "own" : "coc" });
    // while the connection is shared with COC, connection fields are read-only here (changed in the COC app)
    const shared = (d365.connectionSource ?? (await getActiveConfig()).d365.connectionSource) !== "own";
    if (shared) {
      delete d365.mode; delete d365.baseUrl; delete d365.tenantId; delete d365.clientId; delete d365.clientSecret;
    }
    if (d365.mode !== undefined) updates.push({ key: "d365.mode", value: d365.mode === "live" ? "live" : "mock" });
    if (d365.baseUrl !== undefined) updates.push({ key: "d365.baseUrl", value: d365.baseUrl.trim() });
    if (d365.tenantId !== undefined) updates.push({ key: "d365.tenantId", value: d365.tenantId.trim() });
    if (d365.clientId !== undefined) updates.push({ key: "d365.clientId", value: d365.clientId.trim() });
    if (shouldUpdateSecret(d365.clientSecret)) updates.push({ key: "d365.clientSecret", value: d365.clientSecret.trim() });
    if (d365.company !== undefined) updates.push({ key: "d365.company", value: d365.company.trim() });
    if (d365.packingSlipHeaderEntity !== undefined) updates.push({ key: "d365.packingSlipHeaderEntity", value: d365.packingSlipHeaderEntity.trim() });
    if (d365.packingSlipLineEntity !== undefined) updates.push({ key: "d365.packingSlipLineEntity", value: d365.packingSlipLineEntity.trim() });
  }

  if (sharepoint) {
    if (sharepoint.mode !== undefined) updates.push({ key: "sharepoint.mode", value: sharepoint.mode === "live" ? "live" : "mock" });
    if (sharepoint.tenantId !== undefined) updates.push({ key: "sharepoint.tenantId", value: sharepoint.tenantId.trim() });
    if (sharepoint.clientId !== undefined) updates.push({ key: "sharepoint.clientId", value: sharepoint.clientId.trim() });
    if (shouldUpdateSecret(sharepoint.clientSecret)) updates.push({ key: "sharepoint.clientSecret", value: sharepoint.clientSecret.trim() });
    if (sharepoint.siteId !== undefined) updates.push({ key: "sharepoint.siteId", value: sharepoint.siteId.trim() });
    if (sharepoint.driveId !== undefined) updates.push({ key: "sharepoint.driveId", value: sharepoint.driveId.trim() });
    if (sharepoint.rootFolder !== undefined) updates.push({ key: "sharepoint.rootFolder", value: sharepoint.rootFolder.trim() });
  }

  if (app) {
    if (app.name !== undefined) updates.push({ key: "app.name", value: app.name.trim() });
    if (app.url !== undefined) updates.push({ key: "app.url", value: app.url.trim() });
    if (shouldUpdateSecret(app.automationApiKey)) updates.push({ key: "app.automationApiKey", value: app.automationApiKey.trim() });
    if (app.logLevel !== undefined) updates.push({ key: "app.logLevel", value: app.logLevel });
    if (app.numberFormat !== undefined) updates.push({ key: "cmr.numberFormat", value: app.numberFormat.trim() });
    if (app.numberAuthority !== undefined) updates.push({ key: "cmr.numberAuthority", value: app.numberAuthority });
    if (app.oneCmrPerPackingSlip !== undefined) updates.push({ key: "cmr.oneCmrPerPackingSlip", value: Boolean(app.oneCmrPerPackingSlip) });
    if (app.signatureRequired !== undefined) updates.push({ key: "signature.required", value: Boolean(app.signatureRequired) });
    if (app.loginRedirectUrl !== undefined) {
      const v = String(app.loginRedirectUrl).trim();
      if (v && !/^https?:\/\//i.test(v) && !v.startsWith("/")) {
        return NextResponse.json({ error: { code: "VALIDATION", message: "Login redirect URL must start with https:// or /" } }, { status: 400 });
      }
      updates.push({ key: "auth.loginRedirectUrl", value: v, description: "Browser redirect after sign-out / session timeout" });
    }
    if (app.sessionTimeoutMinutes !== undefined) {
      const n = Math.round(Number(app.sessionTimeoutMinutes));
      if (Number.isFinite(n)) updates.push({ key: "auth.sessionTimeoutMinutes", value: Math.min(480, Math.max(5, n)), description: "Inactivity timeout (minutes)" });
    }
  }

  if (teams) {
    if (teams.enabled !== undefined) updates.push({ key: "teams.enabled", value: Boolean(teams.enabled) });
    if (teams.webhookUrl !== undefined) updates.push({ key: "teams.webhookUrl", value: teams.webhookUrl.trim() });
    if (teams.companyWebhooks !== undefined) updates.push({ key: "teams.companyWebhooks", value: teams.companyWebhooks });
  }

  const sb = supabaseAdmin();
  for (const item of updates) {
    const { error } = await sb.from("cmr_app_settings").upsert({
      key: item.key,
      value: item.value,
      updated_at: new Date().toISOString(),
      updated_by: session.user.id && /^[0-9a-f-]{36}$/i.test(session.user.id) ? session.user.id : null,
    });
    if (error) {
      logger.error("Failed to upsert setting", { key: item.key, error: error.message });
      return NextResponse.json({ ok: false, error: `Failed to save ${item.key}: ${error.message}` }, { status: 500 });
    }
  }

  invalidateConfigCache();
  logger.info("Admin updated system settings", { updatedCount: updates.length, user: session.user.email });

  return NextResponse.json({ ok: true, count: updates.length });
}

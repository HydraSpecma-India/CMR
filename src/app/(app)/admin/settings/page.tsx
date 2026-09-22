import { requireCapability } from "@/lib/auth/guards";
import { getActiveConfig } from "@/lib/config";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "System Settings" };

function mask(str: string): string {
  if (!str || str.length === 0) return "";
  return "••••••••";
}

export default async function SettingsPage() {
  await requireCapability("manageSettings");
  const config = await getActiveConfig();

  const clientConfig = {
    entra: {
      clientId: config.entra.clientId,
      clientSecret: mask(config.entra.clientSecret),
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
      clientSecret: mask(config.d365.clientSecret),
      hasSecret: Boolean(config.d365.clientSecret),
      company: config.d365.company,
      packingSlipHeaderEntity: config.d365.packingSlipHeaderEntity,
      packingSlipLineEntity: config.d365.packingSlipLineEntity,
      salesOrderEntity: config.d365.salesOrderEntity,
    },
    sharepoint: {
      mode: config.sharepoint.mode,
      tenantId: config.sharepoint.tenantId,
      clientId: config.sharepoint.clientId,
      clientSecret: mask(config.sharepoint.clientSecret),
      hasSecret: Boolean(config.sharepoint.clientSecret),
      siteId: config.sharepoint.siteId,
      driveId: config.sharepoint.driveId,
      rootFolder: config.sharepoint.rootFolder,
    },
    app: {
      name: config.app.name,
      url: config.app.url,
      automationApiKey: mask(config.app.automationApiKey),
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
  };

  return <SettingsClient initialConfig={clientConfig} />;
}

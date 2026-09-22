import { getActiveConfig, DEFAULT_TEAMS_WEBHOOK_URL } from "@/lib/config";
import { logger } from "@/lib/logging/logger";

export { DEFAULT_TEAMS_WEBHOOK_URL };

export interface SendCmrTeamsParams {
  cmrId?: string | null;
  cmrNumber: string;
  company?: string | null;
  packingSlipId: string;
  salesOrder?: string | null;
  consigneeName?: string | null;
  deliveryPlace?: string | null;
  carrierName?: string | null;
  vehicleRegistration?: string | null;
  takingOverDate?: string | null;
  totalPackages?: string | null;
  totalGrossWeight?: string | null;
  issuedBy?: string | null;
  issueDate?: string | null;
  pdfBytes?: Uint8Array | null;
  storagePath?: string | null;
}

export interface TeamsSendResult {
  ok: boolean;
  status: number;
  message: string;
}

export class TeamsService {
  /**
   * Tests the connection to the configured Power Automate / Teams webhook.
   */
  static async testConnection(webhookUrlOverride?: string): Promise<TeamsSendResult> {
    const config = await getActiveConfig();
    const url = webhookUrlOverride || config.teams.webhookUrl || DEFAULT_TEAMS_WEBHOOK_URL;

    if (!url || !url.startsWith("http")) {
      throw new Error("Invalid or empty Teams webhook URL configured.");
    }

    const testPayload = {
      test: true,
      title: "CMR Platform - Teams Webhook Test",
      message: "This is a test notification from the HydraSpecma CMR Platform.",
      text: "This is a test notification from the HydraSpecma CMR Platform.",
      summary: "Connection test from CMR Platform",
      timestamp: new Date().toISOString(),
      fileName: "test-notification.txt",
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testPayload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok && res.status !== 202 && res.status !== 200 && res.status !== 204) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Webhook responded with status ${res.status} ${res.statusText}: ${errText}`);
      }

      return {
        ok: true,
        status: res.status,
        message: `Successfully connected to Teams webhook! (Status: ${res.status} ${res.statusText})`,
      };
    } catch (e) {
      const err = e as Error;
      clearTimeout(timeout);
      if (err.name === "AbortError") {
        throw new Error("Connection timed out after 15 seconds.");
      }
      throw err;
    }
  }

  /**
   * Sends the generated CMR PDF and its key details to Microsoft Teams via the Power Automate webhook.
   */
  static async sendCmrToTeams(params: SendCmrTeamsParams): Promise<TeamsSendResult> {
    const config = await getActiveConfig();

    if (!config.teams.enabled) {
      logger.info("Teams webhook integration is disabled in settings, skipping notification.");
      return { ok: true, status: 200, message: "Teams webhook integration is disabled" };
    }

    const compCode = (params.company || "").trim().toUpperCase();
    const companyWebhook = compCode && config.teams.companyWebhooks?.[compCode];
    const url = (companyWebhook && companyWebhook.startsWith("http"))
      ? companyWebhook
      : (config.teams.webhookUrl || DEFAULT_TEAMS_WEBHOOK_URL);

    if (!url || !url.startsWith("http")) {
      throw new Error("No valid Teams webhook URL configured.");
    }

    const cmrNum = params.cmrNumber;
    const fileName = `${cmrNum}.pdf`;
    const issueDateStr = params.issueDate || new Date().toISOString().slice(0, 10);
    const issuedByStr = params.issuedBy || "CMR Platform";

    const baseUrl = (config.app.url || "").replace(/\/$/, "");
    const pdfUrl = params.cmrId && baseUrl ? `${baseUrl}/api/cmr/${params.cmrId}/pdf` : "";
    const cmrUrl = params.cmrId && baseUrl ? `${baseUrl}/cmr/${params.cmrId}` : "";

    const facts: Array<{ title: string; value: string }> = [
      { title: "CMR No.:", value: cmrNum },
      { title: "Legal entity:", value: params.company || "–" },
      { title: "Packing slip:", value: params.packingSlipId },
      { title: "Sales order:", value: params.salesOrder || "–" },
      { title: "Consignee:", value: params.consigneeName || "–" },
      { title: "Place of delivery:", value: params.deliveryPlace || "–" },
      { title: "Carrier:", value: params.carrierName || "–" },
      { title: "Vehicle:", value: params.vehicleRegistration || "–" },
      { title: "Taking over:", value: params.takingOverDate || "–" },
      { title: "Packages / weight:", value: `${params.totalPackages || "–"} / ${params.totalGrossWeight ? params.totalGrossWeight + " kg" : "–"}` },
      { title: "Issued by:", value: issuedByStr },
      { title: "Date:", value: issueDateStr },
    ];

    const cardActions: Array<Record<string, unknown>> = [];
    if (pdfUrl) cardActions.push({ type: "Action.OpenUrl", title: "View / download PDF", url: pdfUrl });
    if (cmrUrl) cardActions.push({ type: "Action.OpenUrl", title: "Open CMR", url: cmrUrl });

    const markdownMessage = [
      `### CMR consignment note issued`,
      ...facts.map((f) => `**${f.title}** ${f.value}`),
      [pdfUrl ? `[View / download PDF](${pdfUrl})` : "", cmrUrl ? `[Open CMR](${cmrUrl})` : ""].filter(Boolean).join("  |  "),
    ]
      .filter(Boolean)
      .join("\n");

    const adaptiveCard: Record<string, unknown> = {
      type: "AdaptiveCard",
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      version: "1.4",
      body: [
        { type: "TextBlock", text: "CMR consignment note issued", weight: "Bolder", size: "Medium", color: "Good" },
        { type: "FactSet", facts },
      ],
    };
    if (cardActions.length > 0) adaptiveCard.actions = cardActions;

    const payload: Record<string, unknown> = {
      cmrNumber: cmrNum,
      company: params.company || "",
      packingSlipId: params.packingSlipId,
      salesOrder: params.salesOrder || "",
      consigneeName: params.consigneeName || "",
      deliveryPlace: params.deliveryPlace || "",
      carrierName: params.carrierName || "",
      vehicleRegistration: params.vehicleRegistration || "",
      takingOverDate: params.takingOverDate || "",
      issuedBy: issuedByStr,
      issueDate: issueDateStr,
      storagePath: params.storagePath || "",
      title: `CMR consignment note ${cmrNum}`,
      summary: `CMR ${cmrNum} issued for packing slip ${params.packingSlipId}`,
      message: markdownMessage,
      text: markdownMessage,
      adaptiveCard,
      adaptiveCardJson: JSON.stringify(adaptiveCard),
      fileName,
      contentType: "application/pdf",
      pdfUrl,
      downloadUrl: pdfUrl,
      cmrUrl,
    };

    // Always include fileContent, content, and file object for SharePoint "Create file" in Power Automate.
    // Power Automate HTTP trigger supports payloads up to 100MB, allowing SharePoint to store the complete PDF.
    if (params.pdfBytes && params.pdfBytes.length > 0) {
      const base64Pdf = Buffer.from(params.pdfBytes).toString("base64");
      payload.fileContent = base64Pdf;
      payload.fileContentBase64 = base64Pdf;
      payload.content = base64Pdf;
      payload.file = {
        name: fileName,
        content: base64Pdf,
        contentBytes: base64Pdf,
        "$content-type": "application/pdf",
        "$content": base64Pdf,
      };
      payload.attachments = [
        {
          name: fileName,
          content: base64Pdf,
          contentBytes: base64Pdf,
          contentType: "application/pdf",
        },
      ];
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok && res.status !== 202 && res.status !== 200 && res.status !== 204) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Teams webhook error (${res.status} ${res.statusText}): ${errText}`);
      }

      logger.info("CMR successfully sent to Teams channel", {
        cmrNumber: cmrNum,
        status: res.status,
      });

      return {
        ok: true,
        status: res.status,
        message: `Successfully posted ${cmrNum} to Teams channel!`,
      };
    } catch (e) {
      const err = e as Error;
      clearTimeout(timeout);
      logger.error("Failed to send CMR to Teams webhook", {
        cmrNumber: cmrNum,
        error: err.message,
      });
      throw err;
    }
  }
}

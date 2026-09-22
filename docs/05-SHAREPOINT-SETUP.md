# SharePoint / Microsoft Graph setup guide

Goal: the server (Vercel) uploads the final CMR PDF into a SharePoint document library and stores the resulting URL. The browser never talks to Graph.

## 1. Create the site and library
1. SharePoint admin center → **Sites → Active sites → + Create → Team site** (or use an existing site, e.g. `https://<tenant>.sharepoint.com/sites/Quality`).
2. In the site: **Site contents → + New → Document library** → name `CMR` (this is the *drive*).
3. Optional: inside `CMR` create top-level folders (`2026`, …). The app creates missing folders automatically following the pattern in **Admin → SharePoint Configuration** (default `CMR/{yyyy}/{ItemNumber}/`), so this step is optional.
4. Optional metadata columns on the library (the app can set them via Graph `listItem/fields` in a later phase): `CMRNumber`, `ProductionOrder`, `CustomerPO`, `SerialNumber`, `ItemNumber`.

## 2. Entra app registration (one app can serve Graph *and* D365FO, or use two)
1. Entra admin center → **App registrations → New registration**
   * Name: `HSIN CMR Platform (server)`
   * Supported account types: single tenant
   * Redirect URI: *(none needed for the client-credentials app)*
2. Copy **Application (client) ID** → `AZURE_CLIENT_ID`, **Directory (tenant) ID** → `AZURE_TENANT_ID`.
3. **Certificates & secrets → New client secret** (choose 12–24 months, set a calendar reminder) → value → `AZURE_CLIENT_SECRET`. The value is shown once.

## 3. Graph API permissions (Application permissions, not Delegated)
**Recommended (least privilege):** `Sites.Selected`
* API permissions → Add → Microsoft Graph → Application → `Sites.Selected` → **Grant admin consent**.
* `Sites.Selected` alone grants nothing; you must then grant the app access to the specific site (step 4).

**Alternative (simpler, broader):** `Sites.ReadWrite.All` → grant admin consent. No per-site grant needed. Use only if your security policy allows.

## 4. Grant the app access to the site (only for Sites.Selected)
Needs a one-off call by a Global/SharePoint admin using Graph Explorer (https://developer.microsoft.com/graph/graph-explorer), PowerShell (`Grant-PnPAzureADAppSitePermission`) or an admin-consented tool:

```http
POST https://graph.microsoft.com/v1.0/sites/{SITE_ID}/permissions
Content-Type: application/json

{
  "roles": ["write"],
  "grantedToIdentities": [{ "application": { "id": "<AZURE_CLIENT_ID>", "displayName": "HSIN CMR Platform (server)" } }]
}
```

## 5. Find the IDs
**Site ID** — in Graph Explorer (signed in as an admin) run:
```
GET https://graph.microsoft.com/v1.0/sites/<tenant>.sharepoint.com:/sites/<SiteName>
```
The response `id` looks like `hydraspecma.sharepoint.com,1b2c…,9f8e…` → `SHAREPOINT_SITE_ID` (keep the whole comma-separated value).

**Drive ID** (the document library):
```
GET https://graph.microsoft.com/v1.0/sites/{SITE_ID}/drives
```
Pick the drive whose `name` is `CMR` → `id` (starts with `b!…`) → `SHAREPOINT_DRIVE_ID`.

**Folder / item IDs** (only if you want to pin a fixed root folder):
```
GET https://graph.microsoft.com/v1.0/drives/{DRIVE_ID}/root:/CMR/2026
```
→ `id` of the folder. The app normally addresses folders by *path* (`root:/CMR/2026/1070.0049:`) so IDs are not required.

Once the env vars are set, **Admin → SharePoint Configuration → Test connection** performs `GET /sites/{id}` → `GET /drives/{id}` → `GET /drives/{id}/root/children` and shows what it could reach.

## 6. How the app uploads
```
PUT https://graph.microsoft.com/v1.0/drives/{DRIVE_ID}/root:/CMR/2026/1070.0049/CMR-2026-1392.pdf:/content
Authorization: Bearer <app token, scope https://graph.microsoft.com/.default>
Content-Type: application/pdf
<bytes>
```
* ≤ 4 MB: single PUT (`@microsoft.graph.conflictBehavior=replace` via query string so retries overwrite the same file).
* > 4 MB: `POST …:/createUploadSession` then chunked PUTs (the app handles it).
* Missing folders are created with `POST /drives/{id}/items/{parentId}/children { "name": "...", "folder": {} }` — done by path segment, tolerating `nameAlreadyExists`.

## 7. Retrieve the URL / create a view link
The upload response contains `id`, `webUrl`, `eTag`, `size`. `webUrl` is stored as `cmr_documents.sharepoint_url` and posted to D365FO. It requires the viewer to have SharePoint permission on the library (normal for internal users).
Optional organisation-wide view link:
```
POST /drives/{DRIVE_ID}/items/{ITEM_ID}/createLink
{ "type": "view", "scope": "organization" }
```
→ `link.webUrl`. Enable via **Admin → SharePoint Configuration → "Create organisation view link"**.

## 8. Environment variables
```
AZURE_TENANT_ID=            # Directory (tenant) ID
AZURE_CLIENT_ID=            # Application (client) ID
AZURE_CLIENT_SECRET=        # client secret value
SHAREPOINT_SITE_ID=         # hostname,siteCollectionId,siteId
SHAREPOINT_DRIVE_ID=        # b!…
SHAREPOINT_ROOT_FOLDER=CMR  # optional, default CMR
STORAGE_MODE=live|mock      # mock keeps PDFs in Supabase Storage and marks the CMR "UPLOADED (mock)" — for development only
```
Set them in **Vercel → Project → Settings → Environment Variables** (Production + Preview), never in the repo.

## 9. Troubleshooting
| Symptom | Cause |
|---|---|
| `401 InvalidAuthenticationToken` | wrong tenant/client/secret or expired secret |
| `403 accessDenied` with Sites.Selected | step 4 not done for this site, or role `read` instead of `write` |
| `404 itemNotFound` on drive | `SHAREPOINT_DRIVE_ID` belongs to another site; re-run `GET /sites/{id}/drives` |
| `423 resourceLocked` | file is checked out / library requires check-out → disable "Require check out" in library settings |

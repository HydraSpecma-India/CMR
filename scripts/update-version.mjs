import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const versionFile = path.join(rootDir, "src", "lib", "version.ts");
const packageFile = path.join(rootDir, "package.json");

let commitCount = 0;
try {
  const countStr = execSync("git rev-list --count HEAD", { cwd: rootDir, encoding: "utf8" }).trim();
  commitCount = parseInt(countStr, 10);
} catch {
  // Git not available (e.g. running in deployed container without .git)
}

if (commitCount > 0) {
  let hasChanges = false;
  try {
    const status = execSync("git status --porcelain", { cwd: rootDir, encoding: "utf8" }).trim();
    hasChanges = status.length > 0;
  } catch {}

  const targetCount = hasChanges ? commitCount + 1 : commitCount;
  const padded = String(targetCount).padStart(3, "0");
  const versionNum = "1.00" + padded;
  const versionWithV = "v" + versionNum;

  const content = 'export const APP_VERSION = "' + versionWithV + '";\nexport const APP_VERSION_RAW = "' + versionNum + '";\nexport const COMMIT_COUNT = ' + targetCount + ';\n';
  fs.writeFileSync(versionFile, content, "utf8");

  try {
    const pkg = JSON.parse(fs.readFileSync(packageFile, "utf8"));
    if (pkg.version !== versionNum) {
      pkg.version = versionNum;
      fs.writeFileSync(packageFile, JSON.stringify(pkg, null, 2) + "\n", "utf8");
    }
  } catch (err) {
    console.warn("Failed to update package.json version:", err);
  }

  console.log("[version] Updated to " + versionWithV + " (" + versionNum + ") [Commit #" + targetCount + "]");
} else {
  console.log("[version] Preserving existing version (git commit count not accessible).");
}

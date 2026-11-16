// Writes THIRD-PARTY-NOTICES.txt to stdout: the licence text of every package reachable from the
// ones the renderer bundles (react, react-dom, react-markdown, remark-gfm) or the main process ships.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const projectRoot = process.cwd();
const bundledPackages = ["react", "react-dom", "react-markdown", "remark-gfm", "@electron-toolkit/utils"];
const noticesByPackageId = new Map(); // "name@version" -> { name, version, license, text }

/** The folder Node would resolve `packageName` to from `fromDir`: the nearest node_modules that holds it, up to the project root. */
function findPackageDir(packageName, fromDir) {
  let searchDir = fromDir;
  for (;;) {
    const candidate = join(searchDir, "node_modules", packageName);
    if (existsSync(join(candidate, "package.json"))) return candidate;
    if (searchDir === projectRoot) return null;
    searchDir = join(searchDir, "..");
  }
}

/** Records the notice of `packageName` and of every package it depends on. */
function collectNotices(packageName, fromDir) {
  const packageDir = findPackageDir(packageName, fromDir);
  if (!packageDir) throw new Error(`missing ${packageName} from ${fromDir}`);
  const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
  const packageId = `${manifest.name}@${manifest.version}`;
  if (noticesByPackageId.has(packageId)) return;
  const licenceFile = readdirSync(packageDir).find((fileName) => /^(licen[cs]e|copying)(\.|$)/i.test(fileName));
  noticesByPackageId.set(packageId, {
    name: manifest.name,
    version: manifest.version,
    license: manifest.license ?? "?",
    text: licenceFile ? readFileSync(join(packageDir, licenceFile), "utf8").trim() : null,
  });
  for (const dependency of Object.keys(manifest.dependencies ?? {})) collectNotices(dependency, packageDir);
}
for (const packageName of bundledPackages) collectNotices(packageName, projectRoot);

const notices = [...noticesByPackageId.values()].sort((a, b) => a.name.localeCompare(b.name));
const RULE = "=".repeat(72);
const lines = [
  "Third-party notices",
  "",
  "RequestTracker bundles the npm packages below into its renderer and main process. Each is used under its own licence, reproduced here.",
  "Electron, Chromium and Node.js ship with their own notices, which electron-builder places next to the exe as LICENSE.electron.txt and LICENSES.chromium.html.",
  "",
];
for (const notice of notices) {
  lines.push(RULE, `${notice.name} ${notice.version} (${notice.license})`, RULE, "", notice.text ?? `(no licence file in the package; licence field: ${notice.license})`, "");
}
process.stdout.write(lines.join("\n") + "\n");

const licences = [...new Set(notices.map((notice) => notice.license))].join(", ");
const namesWithoutText = notices.filter((notice) => !notice.text).map((notice) => notice.name).join(", ") || "none";
console.error(`${notices.length} packages; licences: ${licences}; without text: ${namesWithoutText}`);

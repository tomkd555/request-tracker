// Writes THIRD-PARTY-NOTICES.txt to stdout: the licence text of every package reachable from the
// ones the renderer bundles (react, react-dom, react-markdown, remark-gfm) or the main process ships.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const roots = ["react", "react-dom", "react-markdown", "remark-gfm", "@electron-toolkit/utils"];
const seen = new Map();

function dir(name, from) {
  let d = from;
  for (;;) {
    const p = join(d, "node_modules", name);
    if (existsSync(join(p, "package.json"))) return p;
    if (d === root) return null;
    d = join(d, "..");
  }
}
function visit(name, from) {
  const p = dir(name, from);
  if (!p) throw new Error(`missing ${name} from ${from}`);
  const pkg = JSON.parse(readFileSync(join(p, "package.json"), "utf8"));
  const key = `${pkg.name}@${pkg.version}`;
  if (seen.has(key)) return;
  const lic = readdirSync(p).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f));
  seen.set(key, { name: pkg.name, version: pkg.version, license: pkg.license ?? "?", text: lic ? readFileSync(join(p, lic), "utf8").trim() : null });
  for (const d of Object.keys(pkg.dependencies ?? {})) visit(d, p);
}
for (const r of roots) visit(r, root);

const rows = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
const out = [
  "Third-party notices",
  "",
  "RequestTracker bundles the npm packages below into its renderer and main process. Each is used under its own licence, reproduced here.",
  "Electron, Chromium and Node.js ship with their own notices, which electron-builder places next to the exe as LICENSE.electron.txt and LICENSES.chromium.html.",
  "",
];
for (const r of rows) {
  out.push("=".repeat(72), `${r.name} ${r.version} (${r.license})`, "=".repeat(72), "", r.text ?? `(no licence file in the package; licence field: ${r.license})`, "");
}
process.stdout.write(out.join("\n") + "\n");
console.error(`${rows.length} packages; licences: ${[...new Set(rows.map((r) => r.license))].join(", ")}; without text: ${rows.filter((r) => !r.text).map((r) => r.name).join(", ") || "none"}`);

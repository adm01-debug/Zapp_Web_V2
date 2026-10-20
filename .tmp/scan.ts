import { scanProject } from "../src/__tests__/a11y/scan-icon-buttons";
import * as fs from "node:fs";

const root = process.cwd();
const all = scanProject(root);
const alvo = all.filter(
  (f) => f.file.startsWith("src/components/mobile/") || f.file.startsWith("src/components/inbox/"),
);
console.log("TOTAL projeto:", all.length, "em", new Set(all.map((f) => f.file)).size, "arquivos");
console.log("ALVO mobile+inbox:", alvo.length);
for (const f of alvo) {
  console.log(`${f.file}:${f.line}:${f.column}  ${f.snippet.slice(0, 160)}`);
}
const pasta = new Map<string, number>();
for (const f of all) {
  const p = f.file.split("/").slice(0, 3).join("/");
  pasta.set(p, (pasta.get(p) ?? 0) + 1);
}
console.log("--- por pasta (topo) ---");
for (const [k, v] of [...pasta.entries()].sort((a, b) => b[1] - a[1])) console.log(v, k);

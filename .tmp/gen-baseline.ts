import { scanProject, toKeyCounts } from "../src/__tests__/a11y/scan-icon-buttons";
import * as fs from "node:fs";
import * as path from "node:path";

const root = process.cwd();
const findings = scanProject(root);
console.log("total", findings.length);
const files = new Set(findings.map((f) => f.file));
console.log("arquivos", files.size);
const byLine = toKeyCounts(findings);
console.log("chaves", byLine.size);

// grava a linha de base
const out = path.join(root, "src/__tests__/a11y/icon-buttons-baseline.json");
fs.writeFileSync(out, JSON.stringify({ findings }, null, 2) + "\n");
console.log("gravado", out);

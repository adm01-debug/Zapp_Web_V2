import { scanProject } from "../src/__tests__/a11y/scan-icon-buttons";
import * as fs from "node:fs";

const findings = scanProject(process.cwd()).map((f) => ({
  file: f.file,
  line: f.line,
  column: f.column,
  tag: f.tag,
  snippet: f.snippet,
}));
const out = JSON.stringify({ findings }, null, 2) + "\n";
fs.writeFileSync("src/__tests__/a11y/icon-buttons-baseline.json", out, "utf8");
console.log("baseline gravada:", findings.length, "ocorrências em", new Set(findings.map((f) => f.file)).size, "arquivos");

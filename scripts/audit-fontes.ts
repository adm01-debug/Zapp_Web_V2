import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, extname } from "path";

const SYSTEM_STACK = new Set([
  "system-ui",
  "-apple-system",
  "segoe ui",
  "sans-serif",
  "ui-monospace",
  "monospace",
]);

export interface FontFinding {
  file: string;
  line: number;
  fontFamily: string;
  deviations: string[];
  status: "ok" | "deviation";
}

export function extractFontFamiliesFromCSS(
  content: string,
  filePath: string
): FontFinding[] {
  const findings: FontFinding[] = [];
  const regex = /font-family\s*:\s*([^;"'>]+)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const fontFamily = match[1].trim();
    const fonts = fontFamily
      .split(",")
      .map((f) => f.trim().replace(/['"]/g, "").toLowerCase());
    const deviations = fonts.filter((f) => !SYSTEM_STACK.has(f));
    findings.push({
      file: filePath,
      line: content.substring(0, match.index).split("\n").length,
      fontFamily,
      deviations,
      status: deviations.length === 0 ? "ok" : "deviation",
    });
  }
  return findings;
}

export function extractFontFamiliesFromJS(
  content: string,
  filePath: string
): FontFinding[] {
  const findings: FontFinding[] = [];
  const regex = /setFont\s*\(\s*["']([^"']+)["']/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const fontName = match[1].trim().toLowerCase();
    const deviations = !SYSTEM_STACK.has(fontName) ? [fontName] : [];
    findings.push({
      file: filePath,
      line: content.substring(0, match.index).split("\n").length,
      fontFamily: fontName,
      deviations,
      status: deviations.length === 0 ? "ok" : "deviation",
    });
  }
  return findings;
}

function findHtmlFiles(dir: string): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findHtmlFiles(fullPath));
    } else if (
      entry.isFile() &&
      (extname(entry.name) === ".html" || extname(entry.name) === ".htm")
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

export function auditFonts(rootDir: string): FontFinding[] {
  const findings: FontFinding[] = [];

  const talkxDir = join(rootDir, "docs", "talkx");
  if (existsSync(talkxDir)) {
    for (const file of findHtmlFiles(talkxDir)) {
      const content = readFileSync(file, "utf-8");
      findings.push(...extractFontFamiliesFromCSS(content, file));
    }
  }

  const publicDir = join(rootDir, "public");
  if (existsSync(publicDir)) {
    for (const file of findHtmlFiles(publicDir)) {
      const content = readFileSync(file, "utf-8");
      findings.push(...extractFontFamiliesFromCSS(content, file));
    }
  }

  const auditPdfPath = join(rootDir, "generate_audit_pdf.ts");
  if (existsSync(auditPdfPath)) {
    const content = readFileSync(auditPdfPath, "utf-8");
    findings.push(...extractFontFamiliesFromJS(content, auditPdfPath));
  }

  return findings;
}

// Self-execution removed: tests import functions directly
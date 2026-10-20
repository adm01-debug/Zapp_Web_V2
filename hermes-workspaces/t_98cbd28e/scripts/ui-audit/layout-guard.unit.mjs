import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const GUARD = fileURLToPath(new URL("./layout-guard.mjs", import.meta.url));

function runGuard(files) {
  const root = mkdtempSync(path.join(tmpdir(), "layout-guard-"));
  try {
    for (const [relativePath, source] of Object.entries(files)) {
      const target = path.join(root, relativePath);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, source);
    }

    try {
      return {
        status: 0,
        output: execFileSync(process.execPath, [GUARD], {
          cwd: root,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        }),
      };
    } catch (error) {
      return {
        status: error.status,
        output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
      };
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const lazyImport = (component) =>
  `export const Fixture = lazy(() => import("@/components/${component}"));\n`;

test("audita a raiz real de uma view reexportada por alias", () => {
  const result = runGuard({
    "src/pages/lazyViews.ts": lazyImport("AliasView"),
    "src/components/AliasView.tsx":
      'export { TargetView as AliasView } from "./TargetView";\n',
    "src/components/TargetView.tsx":
      'export function TargetView() {\n  return <main className="w-full min-w-0">ok</main>;\n}\n',
  });

  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /0 violations across 1 view files/);
});

test("nao confunde min-h-full com o token h-full", () => {
  const result = runGuard({
    "src/pages/lazyViews.ts": lazyImport("MinHeightView"),
    "src/components/MinHeightView.tsx":
      'export function MinHeightView() {\n  return <main className="min-h-full">ok</main>;\n}\n',
  });

  assert.equal(result.status, 0, result.output);
});

test("continua rejeitando h-full sem largura", () => {
  const result = runGuard({
    "src/pages/lazyViews.ts": lazyImport("NarrowView"),
    "src/components/NarrowView.tsx":
      'export function NarrowView() {\n  return <main className="h-full">erro</main>;\n}\n',
  });

  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /VIOLATION \[h-full without w-full\/flex-1\]/);
});

test("aplica as regras na raiz do alvo reexportado", () => {
  const result = runGuard({
    "src/pages/lazyViews.ts": lazyImport("AliasView"),
    "src/components/AliasView.tsx":
      'export { TargetView as AliasView } from "./TargetView";\n',
    "src/components/TargetView.tsx":
      'export function TargetView() {\n  return <main className="h-full">erro</main>;\n}\n',
  });

  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /VIOLATION \[h-full without w-full\/flex-1\]/);
});

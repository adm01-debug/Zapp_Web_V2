#!/usr/bin/env node
// Unit tests for a11y-button-name-ratchet.mjs.
// Uses fixture files in a temp directory to exercise red and green cases.

import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(AQUI, "a11y-button-name-ratchet.mjs");
const MAX_BUFFER = 8 * 1024 * 1024;

function fixture() {
  return mkdtempSync(path.join(tmpdir(), "a11y-ratchet-"));
}

// Create a minimal src/ tree with the given file contents.
function preparar({ files = {}, baseline = 0 } = {}) {
  const root = fixture();
  mkdirSync(path.join(root, "src"), { recursive: true });
  mkdirSync(path.join(root, "scripts", "ci"), { recursive: true });
  for (const [relPath, content] of Object.entries(files)) {
    const full = path.join(root, "src", relPath);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content, "utf8");
  }
  writeFileSync(
    path.join(root, "scripts", "ci", "a11y-button-name-baseline.json"),
    JSON.stringify({ baseline, generatedAt: "2026-10-09", schemaVersion: 1 }, null, 2) + "\n",
    "utf8",
  );
  // Copy the script into the fixture's scripts/ci/
  cpSync(SCRIPT, path.join(root, "scripts", "ci", "a11y-button-name-ratchet.mjs"));
  return root;
}

function executar(root) {
  const resultado = spawnSync(process.execPath, ["scripts/ci/a11y-button-name-ratchet.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
  });
  return { status: resultado.status, stdout: resultado.stdout ?? "", stderr: resultado.stderr ?? "" };
}

// --- RED FIXTURES (should fail, exit 1) ---

test("Button size=icon sem aria-label falha (red fixture)", () => {
  const root = preparar({
    files: {
      "components/IconButton.tsx": `
import { Button } from "@/components/ui/button";
export function IconButton() {
  return <Button size="icon"><ChevronRight /></Button>;
}
      `.trim(),
    },
    baseline: 0,
  });
  try {
    const { status, stdout, stderr } = executar(root);
    assert.equal(status, 1, "deve falhar com exit 1");
    assert.match(stdout, /a11y button-name violations: 1/);
    assert.match(stderr, /new a11y button-name violation/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("SelectTrigger sem nome acessivel falha (red fixture)", () => {
  const root = preparar({
    files: {
      "components/SearchSelect.tsx": `
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
export function SearchSelect() {
  return <Select><SelectTrigger><SelectValue /></SelectTrigger></Select>;
}
      `.trim(),
    },
    baseline: 0,
  });
  try {
    const { status, stdout, stderr } = executar(root);
    assert.equal(status, 1, "deve falhar com exit 1");
    assert.match(stdout, /a11y button-name violations: 1/);
    assert.match(stderr, /select-trigger-no-accessible-name/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("TabsTrigger com sr-only passa (green fixture)", () => {
  const root = preparar({
    files: {
      "components/TabsDemo.tsx": `
import { Tabs, TabsTrigger, TabsContent } from "@/components/ui/tabs";
export function TabsDemo() {
  return (
    <Tabs>
      <TabsTrigger value="tab1"><span className="sr-only">Tab 1</span></TabsTrigger>
      <TabsContent value="tab1">Content</TabsContent>
    </Tabs>
  );
}
      `.trim(),
    },
    baseline: 0,
  });
  try {
    const { status, stdout } = executar(root);
    assert.equal(status, 0, "TabsTrigger com sr-only deve passar");
    assert.match(stdout, /a11y button-name violations: 0/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("TabsTrigger sem acessible name falha (red fixture)", () => {
  const root = preparar({
    files: {
      "components/TabsDemo.tsx": `
import { Tabs, TabsTrigger, TabsContent } from "@/components/ui/tabs";
export function TabsDemo() {
  return (
    <Tabs>
      <TabsTrigger value="tab1" />
      <TabsContent value="tab1">Content</TabsContent>
    </Tabs>
  );
}
      `.trim(),
    },
    baseline: 0,
  });
  try {
    const { status, stdout, stderr } = executar(root);
    assert.equal(status, 1, "deve falhar com exit 1");
    assert.match(stdout, /a11y button-name violations: 1/);
    assert.match(stderr, /tabs-trigger-no-accessible-name/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Button size=icon depois de onClick arrow sem nome falha (red fixture)", () => {
  const root = preparar({
    files: {
      "components/IconButton.tsx": `
import { Button } from "@/components/ui/button";
export function IconButton() {
  return <Button onClick={() => save()} size="icon"><Save /></Button>;
}
      `.trim(),
    },
    baseline: 0,
  });
  try {
    const { status, stdout, stderr } = executar(root);
    assert.equal(status, 1, "deve falhar com exit 1");
    assert.match(stdout, /a11y button-name violations: 1/);
    assert.match(stderr, /button-icon-no-accessible-name/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- GREEN FIXTURES (should pass, exit 0) ---

test("Button size=icon com aria-label passa (green fixture)", () => {
  const root = preparar({
    files: {
      "components/IconButton.tsx": `
import { Button } from "@/components/ui/button";
export function IconButton() {
  return <Button size="icon" aria-label="Voltar"><ArrowLeft /></Button>;
}
      `.trim(),
    },
    baseline: 0,
  });
  try {
    const { status, stdout } = executar(root);
    assert.equal(status, 0, "deve passar com exit 0");
    assert.match(stdout, /a11y button-name violations: 0/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Button size=icon com title passa (green fixture)", () => {
  const root = preparar({
    files: {
      "components/IconButton.tsx": `
import { Button } from "@/components/ui/button";
export function IconButton() {
  return <Button size="icon" title="Fechar"><X /></Button>;
}
      `.trim(),
    },
    baseline: 0,
  });
  try {
    const { status, stdout } = executar(root);
    assert.equal(status, 0, "deve passar com exit 0");
    assert.match(stdout, /a11y button-name violations: 0/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Button size=icon com sr-only passa (green fixture)", () => {
  const root = preparar({
    files: {
      "components/IconButton.tsx": `
import { Button } from "@/components/ui/button";
export function IconButton() {
  return <Button size="icon"><ChevronRight /><span className="sr-only">Voltar</span></Button>;
}
      `.trim(),
    },
    baseline: 0,
  });
  try {
    const { status, stdout } = executar(root);
    assert.equal(status, 0, "deve passar com exit 0");
    assert.match(stdout, /a11y button-name violations: 0/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("SelectTrigger com aria-label passa (green fixture)", () => {
  const root = preparar({
    files: {
      "components/SearchSelect.tsx": `
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
export function SearchSelect() {
  return <Select><SelectTrigger aria-label="Pesquisar"><SelectValue /></SelectTrigger></Select>;
}
      `.trim(),
    },
    baseline: 0,
  });
  try {
    const { status, stdout } = executar(root);
    assert.equal(status, 0, "deve passar com exit 0");
    assert.match(stdout, /a11y button-name violations: 0/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("TabsTrigger com aria-label passa (green fixture)", () => {
  const root = preparar({
    files: {
      "components/TabsDemo.tsx": `
import { Tabs, TabsTrigger, TabsContent } from "@/components/ui/tabs";
export function TabsDemo() {
  return (
    <Tabs>
      <TabsTrigger value="tab1" aria-label="Visao Geral">Geral</TabsTrigger>
      <TabsContent value="tab1">Content</TabsContent>
    </Tabs>
  );
}
      `.trim(),
    },
    baseline: 0,
  });
  try {
    const { status, stdout } = executar(root);
    assert.equal(status, 0, "deve passar com exit 0");
    assert.match(stdout, /a11y button-name violations: 0/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Button size=icon com aria-label depois de onClick arrow passa (green fixture)", () => {
  const root = preparar({
    files: {
      "components/IconButton.tsx": `
import { Button } from "@/components/ui/button";
export function IconButton() {
  return <Button onClick={() => save()} size="icon" aria-label="Salvar"><Save /></Button>;
}
      `.trim(),
    },
    baseline: 0,
  });
  try {
    const { status, stdout } = executar(root);
    assert.equal(status, 0, "deve passar com exit 0");
    assert.match(stdout, /a11y button-name violations: 0/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Button size=icon com aria-label em expressao passa (green fixture)", () => {
  const root = preparar({
    files: {
      "components/IconButton.tsx": `
import { Button } from "@/components/ui/button";
export function IconButton() {
  return <Button size="icon" aria-label={t("Salvar")}><Save /></Button>;
}
      `.trim(),
    },
    baseline: 0,
  });
  try {
    const { status, stdout } = executar(root);
    assert.equal(status, 0, "deve passar com exit 0");
    assert.match(stdout, /a11y button-name violations: 0/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Button size=icon com title em expressao passa (green fixture)", () => {
  const root = preparar({
    files: {
      "components/IconButton.tsx": `
import { Button } from "@/components/ui/button";
export function IconButton() {
  return <Button size="icon" title={label}><Save /></Button>;
}
      `.trim(),
    },
    baseline: 0,
  });
  try {
    const { status, stdout } = executar(root);
    assert.equal(status, 0, "deve passar com exit 0");
    assert.match(stdout, /a11y button-name violations: 0/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("SelectTrigger com aria-labelledby em expressao passa (green fixture)", () => {
  const root = preparar({
    files: {
      "components/SearchSelect.tsx": `
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
export function SearchSelect() {
  return <Select><SelectTrigger aria-labelledby={id}><SelectValue /></SelectTrigger></Select>;
}
      `.trim(),
    },
    baseline: 0,
  });
  try {
    const { status, stdout } = executar(root);
    assert.equal(status, 0, "deve passar com exit 0");
    assert.match(stdout, /a11y button-name violations: 0/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("sem arquivos tsx/ts em src/ passa com zero violacoes", () => {
  const root = preparar({
    files: {
      "README.md": "# Test repo",
    },
    baseline: 0,
  });
  try {
    const { status, stdout } = executar(root);
    assert.equal(status, 0, "deve passar com exit 0");
    assert.match(stdout, /a11y button-name violations: 0/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- BASELINE UPDATE TEST ---

test("--update-baseline reescreve o baseline com a contagem atual", () => {
  const root = preparar({
    files: {
      "components/IconButton.tsx": `
import { Button } from "@/components/ui/button";
export function IconButton() {
  return <Button size="icon"><ChevronRight /></Button>;
}
      `.trim(),
    },
    baseline: 0,
  });
  try {
    // Primeiro: deve falhar (1 violacao > baseline 0)
    const r1 = executar(root);
    assert.equal(r1.status, 1);

    // Depois: atualizar baseline
    const r2 = spawnSync(process.execPath, ["scripts/ci/a11y-button-name-ratchet.mjs", "--update-baseline"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: MAX_BUFFER,
    });
    assert.equal(r2.status, 0, "update-baseline deve passar");

    // Agora: mesma contagem deve passar
    const r3 = executar(root);
    assert.equal(r3.status, 0, "com baseline atualizado deve passar");
    assert.match(r3.stdout, /a11y button-name violations: 1/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

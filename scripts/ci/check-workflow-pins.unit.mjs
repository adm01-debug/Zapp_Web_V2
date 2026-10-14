import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

import { PLAYWRIGHT_ESPERADO, TOOLCHAIN_KEYS, findMutableActionRefs, findToolchainDrift, loadToolchain, main } from "./check-workflow-pins.mjs";

// Fonte única de versões do repositório (.github/toolchain.json), lida de verdade
// pelo teste de integração no fim do arquivo.
const RAIZ = fileURLToPath(new URL("../..", import.meta.url));

// Valores de exemplo; o digest do Postgres e o SHA das actions são inventados.
const FONTE = {
  bun: "1.4.0",
  deno: "2.9.5",
  node: "24",
  go: "1.24.x",
  "supabase-cli": "2.116.0",
  "postgres-image": "postgres:17-alpine@sha256:" + "a".repeat(64),
};

test("aceita action remota fixada por SHA completo", () => {
  const source = `steps:\n  - uses: actions/checkout@${"a".repeat(40)} # v7.0.1\n`;
  assert.deepEqual(findMutableActionRefs(source), []);
});

test("aceita actions locais e imagens docker", () => {
  const source = "steps:\n  - uses: ./path/action\n  - uses: docker://alpine:3.22\n";
  assert.deepEqual(findMutableActionRefs(source), []);
});

test("rejeita tag, branch e SHA abreviado", () => {
  const source = [
    "steps:",
    "  - uses: actions/checkout@v7",
    "  - uses: owner/action@main",
    "  - uses: owner/action@abc1234",
  ].join("\n");
  assert.deepEqual(
    findMutableActionRefs(source).map(({ line, reference }) => ({ line, reference })),
    [
      { line: 2, reference: "actions/checkout@v7" },
      { line: 3, reference: "owner/action@main" },
      { line: 4, reference: "owner/action@abc1234" },
    ],
  );
});

test("aceita action em subdiretorio com aspas", () => {
  const source = `jobs:\n  reusable:\n    uses: "owner/repo/path@${"f".repeat(40)}" # release\n`;
  assert.deepEqual(findMutableActionRefs(source), []);
});

test("rejeita uses vazio seguido por valor multilinha", () => {
  const source = "steps:\n  - uses:\n      owner/action@main\n";
  assert.deepEqual(
    findMutableActionRefs(source).map(({ line, reference }) => ({ line, reference })),
    [{ line: 2, reference: "<missing-or-multiline-value>" }],
  );
});

test("rejeita escalares YAML folded e literal em uses", () => {
  const source = [
    "steps:",
    "  - uses: >-",
    "      owner/action@main",
    "  - uses: |",
    `      owner/action@${"a".repeat(40)}`,
  ].join("\n");
  assert.deepEqual(
    findMutableActionRefs(source).map(({ line, reference }) => ({ line, reference })),
    [
      { line: 2, reference: "<unsupported-or-multiline-value>" },
      { line: 4, reference: "<unsupported-or-multiline-value>" },
    ],
  );
});

test("rejeita valor quoted quebrado e aceita chave uses entre aspas", () => {
  const source = [
    "steps:",
    '  - uses: "owner/action@',
    '      main"',
    `  - "uses": owner/action@${"b".repeat(40)}`,
  ].join("\n");
  assert.deepEqual(
    findMutableActionRefs(source).map(({ line, reference }) => ({ line, reference })),
    [{ line: 2, reference: "<unsupported-or-multiline-value>" }],
  );
});

// --- fonte única de versões (.github/toolchain.json) — E75 / SL-116 ---

test("aceita workflow cujas versões de toolchain batem com a fonte única", () => {
  const source = [
    "      - name: Setup Bun",
    "        uses: oven-sh/setup-bun@00",
    "        with:",
    "          bun-version: '1.4.0'",
    "          node-version: '24'",
    "          deno-version: '2.9.5'",
    "          go-version: '1.24.x'",
    "      - run: ./node_modules/.bin/playwright install --with-deps chromium",
    "      postgres:",
    "        image: " + FONTE["postgres-image"],
  ].join("\n");
  assert.deepEqual(findToolchainDrift(source, "ci.yml", FONTE), []);
});

test("rejeita bun-version divergente da fonte única", () => {
  const source = "        with:\n          bun-version: '1.3.0'\n";
  assert.deepEqual(findToolchainDrift(source, "ci.yml", FONTE), [
    { file: "ci.yml", line: 2, tool: "bun", value: "1.3.0", expected: "1.4.0" },
  ]);
});

test("rejeita node, deno e go divergentes da fonte única", () => {
  const source = [
    "          node-version: '22'",
    "          deno-version: '2.0.0'",
    "          go-version: '1.23.x'",
  ].join("\n");
  assert.deepEqual(
    findToolchainDrift(source, "db-guard.yml", FONTE).map(({ line, tool, value, expected }) => ({ line, tool, value, expected })),
    [
      { line: 1, tool: "node", value: "22", expected: "24" },
      { line: 2, tool: "deno", value: "2.0.0", expected: "2.9.5" },
      { line: 3, tool: "go", value: "1.23.x", expected: "1.24.x" },
    ],
  );
});

test("rejeita SUPABASE_CLI_VERSION divergente da fonte única", () => {
  const source = "env:\n  SUPABASE_CLI_VERSION: '2.100.0'\n";
  assert.deepEqual(findToolchainDrift(source, "db-migrate.yml", FONTE), [
    { file: "db-migrate.yml", line: 2, tool: "supabase-cli", value: "2.100.0", expected: "2.116.0" },
  ]);
});

test("aceita a expressão da fonte no passo supabase/setup-cli", () => {
  const source = [
    "      - name: Setup Supabase CLI",
    "        uses: supabase/setup-cli@00",
    "        with:",
    "          version: ${{ env.SUPABASE_CLI_VERSION }}",
  ].join("\n");
  assert.deepEqual(findToolchainDrift(source, "types-sync.yml", FONTE), []);
});

test("rejeita version literal dentro do passo supabase/setup-cli", () => {
  const source = [
    "      - name: Setup Supabase CLI",
    "        uses: supabase/setup-cli@00",
    "        with:",
    "          version: '2.999.0'",
  ].join("\n");
  assert.deepEqual(findToolchainDrift(source, "types-sync.yml", FONTE), [
    { file: "types-sync.yml", line: 4, tool: "supabase-cli", value: "2.999.0", expected: "2.116.0" },
  ]);
});

test("W09: rejeita qualquer seletor playwright@… (a versão vem do bun.lock)", () => {
  assert.deepEqual(
    findToolchainDrift("        run: ./node_modules/.bin/playwright install --with-deps chromium\n", "ci.yml", FONTE),
    [],
  );
  assert.deepEqual(
    findToolchainDrift("        run: bunx playwright@1.63.0 install --with-deps chromium\n", "e2e-talkx.yml", FONTE),
    [{ file: "e2e-talkx.yml", line: 1, tool: "playwright", value: "1.63.0", expected: PLAYWRIGHT_ESPERADO }],
  );
  // Seletores nao numericos tambem resolvem o pacote fora do lockfile (Codex, PR #1923).
  for (const seletor of ["latest", "next", "v1.63.0"]) {
    assert.deepEqual(
      findToolchainDrift(`        run: bunx playwright@${seletor} test\n`, "e2e-logado.yml", FONTE),
      [{ file: "e2e-logado.yml", line: 1, tool: "playwright", value: seletor, expected: PLAYWRIGHT_ESPERADO }],
      `playwright@${seletor} passou`,
    );
  }
  // O pacote com escopo expoe o mesmo binario `playwright` (Codex, PR #1923).
  assert.deepEqual(
    findToolchainDrift("        run: bunx @playwright/test@latest test\n", "ci.yml", FONTE),
    [{ file: "ci.yml", line: 1, tool: "playwright", value: "latest", expected: PLAYWRIGHT_ESPERADO }],
  );
  // Sem seletor nao e pin: o import normal do pacote continua permitido.
  assert.deepEqual(findToolchainDrift("        run: bun test @playwright/test\n", "ci.yml", FONTE), []);
});

test("rejeita imagem do serviço postgres divergente da fonte única", () => {
  const outro = "postgres:16-alpine@sha256:" + "b".repeat(64);
  const source = [
    "    services:",
    "      postgres:",
    "        image: " + outro,
    "    env:",
    "      POSTGRES_TEST_IMAGE: " + outro,
    "      POSTGREST_TEST_IMAGE: public.ecr.aws/supabase/postgrest:v14.5@sha256:" + "c".repeat(64),
  ].join("\n");
  assert.deepEqual(
    findToolchainDrift(source, "db-guard.yml", FONTE).map(({ line, tool, value }) => ({ line, tool, value })),
    [
      { line: 3, tool: "postgres-image", value: outro },
      { line: 5, tool: "postgres-image", value: outro },
    ],
  );
});

test("recusa versão de toolchain que a fonte única não declara", () => {
  const semGo = { ...FONTE };
  delete semGo.go;
  assert.deepEqual(findToolchainDrift("          go-version: '1.24.x'\n", "ci.yml", semGo), [
    { file: "ci.yml", line: 1, tool: "go", value: "1.24.x", expected: null },
  ]);
});

test("não confunde o input migration_version do dispatch com versão de toolchain", () => {
  const source = [
    "on:",
    "  workflow_dispatch:",
    "    inputs:",
    "      migration_version:",
    "        description: versão da migration",
    "        required: true",
  ].join("\n");
  assert.deepEqual(findToolchainDrift(source, "db-migrate.yml", FONTE), []);
});

test("fonte única sem uma das chaves falha indicando a versão que falta", () => {
  const dir = mkdtempSync(join(tmpdir(), "toolchain-incompleta-"));
  try {
    mkdirSync(join(dir, ".github"), { recursive: true });
    const incompleta = { ...FONTE };
    delete incompleta.go;
    writeFileSync(join(dir, ".github", "toolchain.json"), JSON.stringify(incompleta));
    assert.throws(() => loadToolchain(dir), /go/u);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("fonte única ausente falha apontando .github/toolchain.json", () => {
  const dir = mkdtempSync(join(tmpdir(), "toolchain-ausente-"));
  try {
    assert.throws(() => loadToolchain(dir), /\.github\/toolchain\.json/u);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("os workflows reais do repositório batem com a fonte única", () => {
  const fonte = loadToolchain(RAIZ);
  assert.deepEqual(TOOLCHAIN_KEYS.filter((chave) => !(chave in fonte)), []);
  assert.equal(main(RAIZ), 0);
});

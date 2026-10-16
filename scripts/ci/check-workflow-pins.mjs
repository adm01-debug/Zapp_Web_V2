#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const FULL_SHA = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_./-]+)?@[a-f0-9]{40}$/u;
const IMAGE_DIGEST = /@sha256:[a-f0-9]{64}/u;

// Fonte única de versões (E75): os valores vivem em .github/toolchain.json e nenhum
// workflow pode literalizar uma versão diferente da declarada ali. O arquivo guarda a
// string EXATA usada no YAML (por exemplo "24", "1.24.x"), para a comparação ser de
// igualdade e não de faixa.
export const TOOLCHAIN_PATH = ".github/toolchain.json";
export const TOOLCHAIN_KEYS = ["bun", "deno", "node", "go", "supabase-cli", "playwright", "postgres-image"];

const SCALAR = /^(?:'([^']*)'|"([^"]*)"|([^\s#'"]+))(?:\s+#.*)?$/u;
const TOOLCHAIN_VERSION_INPUT = /^\s*(?:-\s*)?["']?(bun|deno|node|go)-version["']?\s*:\s*(.*)$/u;
const SUPABASE_CLI_ENV = /^\s*["']?SUPABASE_CLI_VERSION["']?\s*:\s*(.*)$/u;
const SUPABASE_CLI_VERSION_INPUT = /^\s*["']?version["']?\s*:\s*(.*)$/u;
const IMAGE_LINE = /^\s*(?:-\s*)?(?:["']?image["']?|["']?[A-Za-z][A-Za-z0-9_]*_IMAGE["']?)\s*:\s*(.*)$/u;
const PLAYWRIGHT_PIN = /playwright@([0-9][0-9A-Za-z.-]*)/gu;

/** Valor literal de um escalar YAML; `null` quando é expressão do Actions ou valor multilinha. */
function scalarValue(raw) {
  const match = raw.trim().match(SCALAR);
  if (!match) return null;
  const value = match[1] ?? match[2] ?? match[3];
  return value.startsWith("${{") ? null : value;
}

export function findMutableActionRefs(source, file = "workflow.yml") {
  const violations = [];
  const lines = source.replace(/\r\n?/gu, "\n").split("\n");
  for (const [index, line] of lines.entries()) {
    const match = line.match(/^\s*(?:-\s*)?(?:uses|["']uses["'])\s*:\s*(.*)$/u);
    if (!match) continue;
    const rawValue = match[1].trim();
    const blockScalar = /^[>|][+-]?(?:\s+#.*)?$/u.test(rawValue);
    if (blockScalar) { violations.push({ file, line: index+1, reference: "<unsupported-or-multiline-value>" }); continue; }
    const scalar = rawValue.match(/^(?:'([^']*)'|"([^"]*)"|([^\s#'"]+))(?:\s+#.*)?$/u);
    if (!scalar) { violations.push({ file, line: index+1, reference: rawValue ? "<unsupported-or-multiline-value>" : "<missing-or-multiline-value>" }); continue; }
    const reference = scalar[1] ?? scalar[2] ?? scalar[3];
    if (reference.startsWith("./") || reference.startsWith("docker://")) continue;
    if (!FULL_SHA.test(reference)) { violations.push({ file, line: index+1, reference }); }
  }
  return violations;
}

export function findUnauthorizedActionOwners(source, file = "workflow.yml", allowedOwnerRepos) {
  const violations = [];
  const lines = source.replace(/\r\n?/gu, "\n").split("\n");
  for (const [index, line] of lines.entries()) {
    const match = line.match(/^\s*(?:-\s*)?(?:uses|["']uses["'])\s*:\s*(.*)$/u);
    if (!match) continue;
    const rawValue = match[1].trim();
    const scalar = rawValue.match(/^(?:'([^']*)'|"([^"]*)"|([^\s#'"]+))(?:\s+#.*)?$/u);
    if (!scalar) continue;
    const reference = scalar[1] ?? scalar[2] ?? scalar[3];
    if (reference.startsWith("./") || reference.startsWith("docker://")) continue;
    const withoutPin = reference.split("@")[0];
    const segments = withoutPin.split("/");
    if (segments.length < 2) continue;
    const ownerRepo = `${segments[0]}/${segments[1]}`;
    if (!allowedOwnerRepos.has(ownerRepo)) {
      violations.push({ file, line: index + 1, reference, ownerRepo });
    }
  }
  return violations;
}

export function findUnpinnedImages(source, file = "workflow.yml") {
  const violations = [];
  const lines = source.replace(/\r\n?/gu, "\n").split("\n");
  for (const [index, line] of lines.entries()) {
    const match = line.match(/^\s+[A-Za-z_][A-Za-z0-9_]*_IMAGE\s*:\s*(.+)$/u);
    if (!match) continue;
    const value = match[1].trim();
    // Skip GitHub Actions expressions (${{ ... }}) — resolved at runtime
    if (/^\$\{\{.*\}\}$/u.test(value)) continue;
    // Skip empty / comment-only
    if (!value || value.startsWith("#")) continue;
    if (!IMAGE_DIGEST.test(value)) {
      violations.push({ file, line: index + 1, image: value });
    }
  }
  return violations;
}

/** Lê a fonte única de versões. Falha explícita quando o arquivo não existe ou está incompleto. */
export function loadToolchain(root = process.cwd()) {
  const file = path.join(root, ".github", "toolchain.json");
  let data;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`fonte única de versões ausente ou ilegível em ${TOOLCHAIN_PATH}: ${error.message}`);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`fonte única de versões inválida em ${TOOLCHAIN_PATH}: o arquivo precisa ser um objeto JSON`);
  }
  for (const key of TOOLCHAIN_KEYS) {
    const value = data[key];
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`fonte única de versões incompleta em ${TOOLCHAIN_PATH}: falta a versão de "${key}"`);
    }
  }
  return data;
}

/**
 * Compara cada versão de toolchain literalizada no workflow com a fonte única.
 * Cobre: bun/deno/node/go em `*-version`, `SUPABASE_CLI_VERSION` (e o `version:` do passo
 * supabase/setup-cli), `playwright@X` em `run:` e a imagem do serviço Postgres.
 */
export function findToolchainDrift(source, file = "workflow.yml", toolchain = {}) {
  const violations = [];
  const lines = source.replace(/\r\n?/gu, "\n").split("\n");
  let inSupabaseCliStep = false;

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    // etapa nova em `steps:`; só ali pode haver `version:` do supabase/setup-cli
    if (/^\s*-\s/u.test(line)) {
      inSupabaseCliStep = /^\s*-\s*["']?uses["']?\s*:\s*supabase\/setup-cli@/u.test(line);
    } else if (/^\s*["']?uses["']?\s*:\s*supabase\/setup-cli@/u.test(line)) {
      inSupabaseCliStep = true;
    }

    const report = (tool, value) => {
      if (value === null) return;
      const expected = Object.hasOwn(toolchain, tool) ? toolchain[tool] : null;
      if (value !== expected) violations.push({ file, line: lineNumber, tool, value, expected });
    };

    const cliEnv = line.match(SUPABASE_CLI_ENV);
    if (cliEnv) { report("supabase-cli", scalarValue(cliEnv[1])); continue; }

    if (inSupabaseCliStep) {
      const cliVersion = line.match(SUPABASE_CLI_VERSION_INPUT);
      if (cliVersion) { report("supabase-cli", scalarValue(cliVersion[1])); continue; }
    }

    const versionInput = line.match(TOOLCHAIN_VERSION_INPUT);
    if (versionInput) { report(versionInput[1], scalarValue(versionInput[2])); continue; }

    const image = line.match(IMAGE_LINE);
    if (image && image[1].trim().startsWith("postgres")) { report("postgres-image", scalarValue(image[1])); continue; }

    for (const pin of line.matchAll(PLAYWRIGHT_PIN)) { report("playwright", pin[1]); }
  }
  return violations;
}

export function loadAllowedOwnerRepos(root = process.cwd()) {
  const jsonPath = path.join(root, "scripts", "ci", "allowed-actions.json");
  const data = JSON.parse(readFileSync(jsonPath, "utf8"));
  return new Set(data.patterns);
}

export function main(root = process.cwd()) {
  const workflowsDir = path.join(root, ".github", "workflows");
  const files = readdirSync(workflowsDir).filter((file) => /\.ya?ml$/u.test(file)).sort();
  const sources = new Map(files.map((file) => [file, readFileSync(path.join(workflowsDir, file), "utf8")]));

  const pinViolations = files.flatMap((file) =>
    findMutableActionRefs(sources.get(file), file),
  );

  const allowedOwnerRepos = loadAllowedOwnerRepos(root);
  const ownerViolations = files.flatMap((file) =>
    findUnauthorizedActionOwners(sources.get(file), file, allowedOwnerRepos),
  );

  const imageViolations = files.flatMap((file) =>
    findUnpinnedImages(sources.get(file), file),
  );

  let toolchain = null;
  let toolchainError = null;
  try {
    toolchain = loadToolchain(root);
  } catch (error) {
    toolchainError = error.message;
  }
  const driftViolations = toolchain
    ? files.flatMap((file) => findToolchainDrift(sources.get(file), file, toolchain))
    : [];

  let exitCode = 0;

  if (pinViolations.length) {
    console.error("FALHA: GitHub Actions com referência mutável:");
    for (const violation of pinViolations) { console.error(`  ${violation.file}:${violation.line} ${violation.reference}`); }
    console.error("Use o SHA completo de 40 caracteres e mantenha a versão em comentário.");
    exitCode = 1;
  }

  if (ownerViolations.length) {
    console.error("FALHA: GitHub Actions de repositório não autorizado:");
    for (const violation of ownerViolations) { console.error(`  ${violation.file}:${violation.line} ${violation.ownerRepo} (${violation.reference})`); }
    console.error("Adicione o owner/repo em scripts/ci/allowed-actions.json se for legítimo.");
    exitCode = 1;
  }

  if (imageViolations.length) {
    console.error("FALHA: variáveis *_IMAGE sem digest (@sha256:<64 hex>):");
    for (const violation of imageViolations) { console.error(`  ${violation.file}:${violation.line} ${violation.image}`); }
    console.error("Use @sha256:<digest> para fixar a imagem. Referências ${{ env.* }} são aceitas.");
    exitCode = 1;
  }

  if (toolchainError) {
    console.error(`FALHA: ${toolchainError}`);
    console.error(`As versões de ${TOOLCHAIN_KEYS.join(", ")} são declaradas em ${TOOLCHAIN_PATH} e lidas por este verificador.`);
    exitCode = 1;
  }

  if (driftViolations.length) {
    console.error(`FALHA: versão de toolchain divergente da fonte única ${TOOLCHAIN_PATH}:`);
    for (const violation of driftViolations) {
      console.error(`  ${violation.file}:${violation.line} ${violation.tool}: ${violation.value} (fonte: ${violation.expected ?? "chave ausente"})`);
    }
    console.error(`Mude a versão em ${TOOLCHAIN_PATH} e propague para os workflows; nenhum valor fora da fonte é aceito.`);
    exitCode = 1;
  }

  if (exitCode === 0) {
    console.log(`OK: ${files.length} workflows usam somente Actions fixadas por SHA, repositórios autorizados, imagens com digest e as versões de toolchain de ${TOOLCHAIN_PATH}.`);
  }

  return exitCode;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = main();
}

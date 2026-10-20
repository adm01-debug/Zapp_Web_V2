import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// R2-INF-008 (probe missing_compiler_passes): o implicit-any-ratchet capturava
// QUALQUER falha do subprocesso e contava so "error TS7". Compilador ausente,
// config quebrada ou diagnostico global (TS5083/TS5058/TS5023) produziam zero
// ocorrencias, o script anunciava "implicit-any errors: 0 (baseline: 0)" e saia
// 0 - o falso zero. Estes testes executam o ARQUIVO REAL do ratchet (copiado do
// repositorio para uma raiz sintetica) como subprocesso `node <script>`, com um
// node_modules/typescript/bin/tsc de mentira controlando exit/diagnostico.

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(AQUI, "implicit-any-ratchet.mjs");
const BASELINE = path.join(AQUI, "implicit-any-baseline.json");
const MAX_BUFFER = 8 * 1024 * 1024;

function fixture() {
  return mkdtempSync(path.join(tmpdir(), "implicit-any-ratchet-"));
}

// Instala o script real numa raiz sintetica. `tsc` ausente = compilador ausente.
// `tsc` presente vira o node_modules/typescript/bin/tsc que o script executa.
function preparar({ tsc, baseline } = {}) {
  const root = fixture();
  mkdirSync(path.join(root, "scripts", "ci"), { recursive: true });
  cpSync(SCRIPT, path.join(root, "scripts", "ci", "implicit-any-ratchet.mjs"));
  if (baseline === undefined) {
    cpSync(BASELINE, path.join(root, "scripts", "ci", "implicit-any-baseline.json"));
  } else {
    writeFileSync(
      path.join(root, "scripts", "ci", "implicit-any-baseline.json"),
      `${JSON.stringify({ baseline }, null, 2)}\n`,
      "utf8",
    );
  }
  if (tsc) {
    const bin = path.join(root, "node_modules", "typescript", "bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(
      path.join(bin, "tsc"),
      [
        `process.stdout.write(${JSON.stringify(tsc.stdout ?? "")});`,
        `process.stderr.write(${JSON.stringify(tsc.stderr ?? "")});`,
        `process.exit(${tsc.status ?? 0});`,
        "",
      ].join("\n"),
      "utf8",
    );
  }
  return root;
}

function executar(root) {
  const resultado = spawnSync(process.execPath, ["scripts/ci/implicit-any-ratchet.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
  });
  return { status: resultado.status, stdout: resultado.stdout ?? "", stderr: resultado.stderr ?? "" };
}

function anunciaZero(stdout) {
  return /implicit-any errors:\s*0\b/u.test(stdout);
}

test("compilador ausente e falha operacional, nunca zero erros (probe missing_compiler_passes)", () => {
  const root = preparar(); // sem node_modules: nenhum compiler local
  try {
    const { status, stdout, stderr } = executar(root);
    assert.equal(status, 2, "compilador ausente deve falhar explicitamente (exit 2)");
    assert.ok(!anunciaZero(stdout), "nao pode anunciar 'implicit-any errors: 0' sem compilador");
    assert.match(stderr, /ERRO no implicit-any ratchet/u, "deve reportar o erro operacional");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("diagnostico global TS5083 (config ilegivel) falha, nao vira zero erros", () => {
  const root = preparar({
    tsc: { status: 2, stderr: "error TS5083: Cannot read file '/repo/tsconfig.app.json'.\n" },
  });
  try {
    const { status, stdout, stderr } = executar(root);
    assert.equal(status, 2, "TS5083 sem coordenadas de arquivo deve falhar explicitamente");
    assert.ok(!anunciaZero(stdout), "nao pode anunciar zero erros para diagnosticos globais");
    assert.match(stderr, /ERRO no implicit-any ratchet/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("config ausente TS5058 falha", () => {
  const root = preparar({
    tsc: { status: 1, stderr: "error TS5058: The specified path does not exist: 'tsconfig.app.json'.\n" },
  });
  try {
    const { status, stdout, stderr } = executar(root);
    assert.equal(status, 2);
    assert.ok(!anunciaZero(stdout));
    assert.match(stderr, /ERRO no implicit-any ratchet/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("configuracao invalida TS5023 (opcao desconhecida) falha", () => {
  const root = preparar({
    tsc: { status: 1, stderr: "error TS5023: Unknown compiler option 'foo'.\n" },
  });
  try {
    const { status, stdout, stderr } = executar(root);
    assert.equal(status, 2);
    assert.ok(!anunciaZero(stdout));
    assert.match(stderr, /ERRO no implicit-any ratchet/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("exit nao-zero sem nenhum diagnostico TypeScript reconhecivel falha", () => {
  const root = preparar({ tsc: { status: 1, stderr: "Error: something exploded\n" } });
  try {
    const { status, stdout, stderr } = executar(root);
    assert.equal(status, 2, "morte do processo sem diagnostico nao e lista valida de erros");
    assert.ok(!anunciaZero(stdout));
    assert.match(stderr, /ERRO no implicit-any ratchet/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("exit de CLI desconhecido (3) falha", () => {
  const root = preparar({ tsc: { status: 3, stderr: "algo inesperado\n" } });
  try {
    const { status, stdout } = executar(root);
    assert.equal(status, 2);
    assert.ok(!anunciaZero(stdout));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("projeto sem erros passa (exit 0, saida vazia)", () => {
  const root = preparar({ tsc: { status: 0 } });
  try {
    const { status, stdout } = executar(root);
    assert.equal(status, 0);
    assert.match(stdout, /implicit-any errors: 0 \(baseline: 0\)/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("conta erros TS7 e falha (exit 1) quando passa do baseline", () => {
  const root = preparar({
    tsc: {
      status: 1,
      stdout:
        "src/a.ts(1,2): error TS7006: Parameter 'x' implicitly has an 'any' type.\n" +
        "src/b.ts(3,4): error TS7019: Rest parameter 'y' implicitly has an 'any' type.\n",
    },
    baseline: 0,
  });
  try {
    const { status, stdout, stderr } = executar(root);
    assert.equal(status, 1);
    assert.match(stdout, /implicit-any errors: 2 \(baseline: 0\)/u);
    assert.match(stderr, /2 new implicit-any error\(s\) introduced/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("erros TS7 iguais ao baseline passam (a ratchet segue comparando com a divida)", () => {
  const root = preparar({
    tsc: {
      status: 1,
      stdout:
        "src/a.ts(1,2): error TS7006: Parameter 'x' implicitly has an 'any' type.\n" +
        "src/b.ts(3,4): error TS7019: Rest parameter 'y' implicitly has an 'any' type.\n",
    },
    baseline: 2,
  });
  try {
    const { status, stdout } = executar(root);
    assert.equal(status, 0);
    assert.match(stdout, /implicit-any errors: 2 \(baseline: 2\)/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("erro de tipo que NAO e TS7 nao infla a contagem nem mascara a guarda", () => {
  const root = preparar({
    tsc: {
      status: 1,
      stdout: "src/a.ts(1,2): error TS2322: Type 'string' is not assignable to type 'number'.\n",
    },
    baseline: 0,
  });
  try {
    const { status, stdout } = executar(root);
    assert.equal(status, 0, "so erros TS7 contam para esta ratchet; outros erros seguem aceitos");
    assert.match(stdout, /implicit-any errors: 0 \(baseline: 0\)/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Entradas ADVERSARIAS para o padrao de "diagnostico global" (afinar-ci, item 4
// de regex larga): ele nao pode casar com um diagnostico POR ARQUIVO cujo caminho comece com
// "error"/"warning" nem com uma linha de continuacao indentada. Se casasse, um
// run legitimo viraria falha operacional.
test("adversario: erro TS7 em arquivo chamado error.ts continua sendo contado", () => {
  const root = preparar({
    tsc: {
      status: 1,
      stdout: "error.ts(1,2): error TS7006: Parameter 'x' implicitly has an 'any' type.\n",
    },
    baseline: 1,
  });
  try {
    const { status, stdout, stderr } = executar(root);
    assert.equal(status, 0, "o caminho error.ts nao pode ser lido como diagnostico global");
    assert.match(stdout, /implicit-any errors: 1 \(baseline: 1\)/u);
    assert.doesNotMatch(stderr, /ERRO no implicit-any ratchet/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("adversario: linha de continuacao indentada com 'error TS' nao vira diagnostico global", () => {
  const root = preparar({
    tsc: {
      status: 1,
      stdout:
        "src/a.ts(1,2): error TS2322: Type 'string' is not assignable to type 'number'.\n" +
        "  error TS9999: texto de continuacao indentado, nao um cabecalho global\n",
    },
    baseline: 0,
  });
  try {
    const { status, stdout, stderr } = executar(root);
    assert.equal(status, 0, "continuacao indentada nao tem coordenada de arquivo, mas nao e cabecalho global");
    assert.match(stdout, /implicit-any errors: 0 \(baseline: 0\)/u);
    assert.doesNotMatch(stderr, /ERRO no implicit-any ratchet/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

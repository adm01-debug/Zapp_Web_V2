import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { compareBaseline, createBaseline, main } from "./typecheck-ratchet.mjs";

const ROOT = "/repo";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "typecheck-ratchet-"));
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

const SAMPLE_OUTPUT = [
  "src/lib/audit.ts(31,7): error TS2322: Type 'string | null' is not assignable to type 'string | undefined'.",
  "  Type 'null' is not assignable to type 'string | undefined'.",
  "src/services/role.service.ts(26,9): error TS2339: Property 'catch' does not exist on type 'PromiseLike<AppRole[]>'.",
].join("\n");

test("createBaseline extrai issues com arquivo/linha/codigo/mensagem normalizada", () => {
  const baseline = createBaseline(SAMPLE_OUTPUT, ROOT);
  assert.equal(baseline.schemaVersion, 2);
  assert.equal(baseline.issues.length, 2);
  assert.equal(baseline.issues[0].code, "TS2322");
  assert.match(
    baseline.issues[0].message,
    /Type 'string \| null' is not assignable.*Type 'null' is not assignable/,
  );
});

test("compareBaseline nao acusa nada novo quando a saida bate com o baseline", () => {
  const baseline = createBaseline(SAMPLE_OUTPUT, ROOT);
  const comparison = compareBaseline(baseline, SAMPLE_OUTPUT, ROOT);
  assert.equal(comparison.added.length, 0);
  assert.equal(comparison.removed.length, 0);
  assert.equal(comparison.currentCount, 2);
});

test("compareBaseline acusa erro novo introduzido", () => {
  const baseline = createBaseline(SAMPLE_OUTPUT, ROOT);
  const withNewError =
    SAMPLE_OUTPUT + "\nsrc/new-file.ts(1,1): error TS9999: erro novo que nao existia antes.";
  const comparison = compareBaseline(baseline, withNewError, ROOT);
  assert.equal(comparison.added.length, 1);
  assert.equal(comparison.added[0].code, "TS9999");
  assert.equal(comparison.removed.length, 0);
});

test("compareBaseline reconhece erro corrigido (removido) sem falhar", () => {
  const baseline = createBaseline(SAMPLE_OUTPUT, ROOT);
  const onlyOneLeft = SAMPLE_OUTPUT.split("\n").slice(0, 2).join("\n");
  const comparison = compareBaseline(baseline, onlyOneLeft, ROOT);
  assert.equal(comparison.added.length, 0);
  assert.equal(comparison.removed.length, 1);
  assert.equal(comparison.removed[0].code, "TS2339");
});

test("compareBaseline trata mudanca de linha no mesmo erro como nao-novo (multiset por file+code+message)", () => {
  const baseline = createBaseline(SAMPLE_OUTPUT, ROOT);
  const shiftedLine = SAMPLE_OUTPUT.replace(
    "src/lib/audit.ts(31,7)",
    "src/lib/audit.ts(45,7)",
  );
  const comparison = compareBaseline(baseline, shiftedLine, ROOT);
  assert.equal(comparison.added.length, 0);
  assert.equal(comparison.removed.length, 0);
});

test("compareBaseline distingue duas ocorrencias iguais de uma so (multiset real)", () => {
  const baseline = createBaseline(SAMPLE_OUTPUT, ROOT);
  const duplicated = SAMPLE_OUTPUT + "\nsrc/services/role.service.ts(99,1): error TS2339: Property 'catch' does not exist on type 'PromiseLike<AppRole[]>'.";
  const comparison = compareBaseline(baseline, duplicated, ROOT);
  assert.equal(comparison.added.length, 1, "a segunda ocorrencia identica deve contar como nova (multiset)");
});

test("compareBaseline detecta troca real (uma ocorrencia corrigida + outra identica nova) quando o contexto de codigo esta disponivel", () => {
  const { root, cleanup } = fixture();
  try {
    mkdirSync(path.join(root, "src"), { recursive: true });
    const filePath = path.join(root, "src", "widget.tsx");
    // "a" isolada no topo (sera removida). "b"/"c" protegidas por linhas
    // "escudo" nos dois lados, para que remover "a" e adicionar "d" no fim
    // NAO toquem no contexto (vizinho imediato) de b/c — o unico jeito de
    // provar que a fase ancorada distingue as ocorrencias sem depender de
    // deslocamento incidental de linha.
    const before = [
      "// fn a",
      "function a() { return contact.tags.join(','); }",
      "// shield-top",
      "function b() { return contact.tags.join(';'); }",
      "function c() { return contact.tags.join('-'); }",
      "// shield-bottom",
    ].join("\n") + "\n";
    writeFileSync(filePath, before, "utf8");
    const baselineOutput = [
      "src/widget.tsx(2,10): error TS18049: 'contact.tags' is possibly 'null' or 'undefined'.",
      "src/widget.tsx(4,10): error TS18049: 'contact.tags' is possibly 'null' or 'undefined'.",
      "src/widget.tsx(5,10): error TS18049: 'contact.tags' is possibly 'null' or 'undefined'.",
    ].join("\n");
    const baseline = createBaseline(baselineOutput, root);

    // Remove "a" (corrigida) do topo e acrescenta "d" (identica, nova) no
    // fim. Contagem total permanece 3 -> um multiset puro por chave nao
    // veria diferenca nenhuma nisso.
    const after = [
      "// shield-top",
      "function b() { return contact.tags.join(';'); }",
      "function c() { return contact.tags.join('-'); }",
      "// shield-bottom",
      "// fn d",
      "function d() { return contact.tags.join('|'); }",
    ].join("\n") + "\n";
    writeFileSync(filePath, after, "utf8");
    const currentOutput = [
      "src/widget.tsx(2,10): error TS18049: 'contact.tags' is possibly 'null' or 'undefined'.",
      "src/widget.tsx(3,10): error TS18049: 'contact.tags' is possibly 'null' or 'undefined'.",
      "src/widget.tsx(6,10): error TS18049: 'contact.tags' is possibly 'null' or 'undefined'.",
    ].join("\n");

    const comparison = compareBaseline(baseline, currentOutput, root);
    assert.equal(comparison.added.length, 1, "a ocorrencia nova na funcao d deveria ser detectada");
    assert.equal(comparison.added[0].line, 6);
    assert.equal(comparison.removed.length, 1, "a ocorrencia corrigida na funcao a deveria sumir do baseline");
  } finally {
    cleanup();
  }
});

test("compareBaseline nao acusa nada quando ocorrencias identicas permanecem intactas apesar de edicao nao relacionada no arquivo", () => {
  const { root, cleanup } = fixture();
  try {
    mkdirSync(path.join(root, "src"), { recursive: true });
    const filePath = path.join(root, "src", "widget.tsx");
    const before = [
      "// shield-top",
      "function a() { return contact.tags.join(','); }",
      "function b() { return contact.tags.join(';'); }",
      "// shield-bottom",
    ].join("\n") + "\n";
    writeFileSync(filePath, before, "utf8");
    const baselineOutput = [
      "src/widget.tsx(2,10): error TS18049: 'contact.tags' is possibly 'null' or 'undefined'.",
      "src/widget.tsx(3,10): error TS18049: 'contact.tags' is possibly 'null' or 'undefined'.",
    ].join("\n");
    const baseline = createBaseline(baselineOutput, root);

    // Insere uma linha nao relacionada acima do escudo: as duas ocorrencias
    // continuam existindo, so deslocadas — o vizinho imediato de cada uma
    // (o proprio escudo / a outra funcao) nao muda.
    const after = `// cabecalho novo\n${before}`;
    writeFileSync(filePath, after, "utf8");
    const currentOutput = [
      "src/widget.tsx(3,10): error TS18049: 'contact.tags' is possibly 'null' or 'undefined'.",
      "src/widget.tsx(4,10): error TS18049: 'contact.tags' is possibly 'null' or 'undefined'.",
    ].join("\n");

    const comparison = compareBaseline(baseline, currentOutput, root);
    assert.equal(comparison.added.length, 0);
    assert.equal(comparison.removed.length, 0);
  } finally {
    cleanup();
  }
});

test("createBaseline nao le arquivo fora do root (path com '..' no output do tsc)", () => {
  const { root, cleanup } = fixture();
  const outsideFile = path.join(path.dirname(root), `outside-${path.basename(root)}.ts`);
  try {
    // Arquivo real, fora do root da fixture, com conteudo que seria
    // facilmente hasheavel se lido — a leitura deve ser bloqueada antes
    // disso pelo guard de boundary, nao por o arquivo nao existir.
    writeFileSync(outsideFile, "const secret = 1;\nconst leak = secret;\nconst tail = leak;\n", "utf8");
    const relativeFromRoot = path.relative(root, outsideFile).split(path.sep).join("/");
    const output = `${relativeFromRoot}(2,7): error TS9999: 'leak' is possibly 'undefined'.`;
    const baseline = createBaseline(output, root);
    assert.equal(baseline.issues.length, 1);
    assert.equal(baseline.issues[0].contextHash, null, "arquivo fora do root nao deveria ser lido");
  } finally {
    unlinkSync(outsideFile);
    cleanup();
  }
});

test("main() com --help retorna 0 sem exigir baseline/relatorio", () => {
  const exitCode = main(["--help"]);
  assert.equal(exitCode, 0);
});

test("main() falha (2) quando o baseline informado nao existe", () => {
  const exitCode = main([
    "--output", "/nonexistent/tsc-output-that-does-not-exist.txt",
    "--baseline", "/nonexistent/baseline-that-does-not-exist.json",
  ]);
  assert.equal(exitCode, 2);
});

// ---------------------------------------------------------------------------
// Falso zero: o tsc sai com exit 1/2 mas a saida nao tem nenhum cabecalho
// "arquivo(linha,coluna): error TS####" reconhecido pelo parser. Sem guarda o
// ratchet entrega zero ocorrencias, anuncia sucesso e (com --update-baseline)
// grava um baseline vazio. Estes testes provam a falha explicita.
// ---------------------------------------------------------------------------

// Cria um node_modules/typescript/bin/tsc de mentira que apenas escreve o que
// pedimos e sai com o exit code pedido. runTsc o executa via node, exercitando
// o caminho real (exit code -> parser -> main) sem depender do compilador.
function fakeTsc(root, { status, stdout = "", stderr = "" }) {
  const entryDir = path.join(root, "node_modules", "typescript", "bin");
  mkdirSync(entryDir, { recursive: true });
  const entry = path.join(entryDir, "tsc");
  writeFileSync(
    entry,
    [
      `process.stdout.write(${JSON.stringify(stdout)});`,
      `process.stderr.write(${JSON.stringify(stderr)});`,
      `process.exit(${status});`,
      "",
    ].join("\n"),
    "utf8",
  );
  return entry;
}

function writeBaseline(filePath, issues) {
  writeFileSync(
    filePath,
    `${JSON.stringify({ schemaVersion: 2, command: "tsc -b --force", issues }, null, 2)}\n`,
    "utf8",
  );
}

// Captura console.log/error para provar que o ratchet nao anuncia falso zero.
function captureConsole(run) {
  const logs = [];
  const errors = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args) => logs.push(args.join(" "));
  console.error = (...args) => errors.push(args.join(" "));
  try {
    return { exitCode: run(), logs, errors };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

test("main() falha (2) e nao sobrescreve o baseline quando o tsc falha sem diagnostico parseavel", () => {
  const { root, cleanup } = fixture();
  try {
    // Saida tipica de falha do compilador (config/binario), SEM o cabecalho
    // que o parser reconhece.
    fakeTsc(root, {
      status: 2,
      stderr: "error TS5083: Cannot read file '/repo/tsconfig.app.json'.\n",
    });
    const baselinePath = path.join(root, "typecheck-baseline.json");
    const originalBaseline = `${JSON.stringify(
      {
        schemaVersion: 2,
        command: "tsc -b --force",
        issues: [
          {
            file: "src/lib/audit.ts",
            line: 31,
            column: 7,
            severity: "error",
            code: "TS2322",
            message: "erro legado que precisa sobreviver",
            contextHash: null,
          },
        ],
      },
      null,
      2,
    )}\n`;
    writeFileSync(baselinePath, originalBaseline, "utf8");

    const { exitCode, logs, errors } = captureConsole(() =>
      main(["--update-baseline", "--baseline", baselinePath, "--root", root]),
    );

    assert.equal(exitCode, 2, "sem diagnostico parseavel o ratchet deve falhar explicitamente");
    assert.equal(
      readFileSync(baselinePath, "utf8"),
      originalBaseline,
      "o baseline nao pode ser sobrescrito quando o compilador falha sem diagnostico",
    );
    assert.ok(
      !logs.some((line) => /0 ocorrencias|OK: nenhum novo erro/u.test(line)),
      "nao pode anunciar zero ocorrencias/erros",
    );
    assert.ok(
      errors.some((line) => /ERRO no typecheck ratchet/u.test(line)),
      "deve reportar o erro do ratchet",
    );
  } finally {
    cleanup();
  }
});

test("main() nao anuncia zero erros quando o tsc falha sem diagnostico parseavel (modo comparacao)", () => {
  const { root, cleanup } = fixture();
  try {
    fakeTsc(root, { status: 1, stdout: "Failed to compile.\n" });
    const baselinePath = path.join(root, "typecheck-baseline.json");
    writeBaseline(baselinePath, []);

    const { exitCode, logs, errors } = captureConsole(() =>
      main(["--baseline", baselinePath, "--root", root]),
    );

    assert.equal(exitCode, 2, "exit 1 sem diagnostico parseavel deve falhar explicitamente");
    assert.ok(
      !logs.some((line) => /OK: nenhum novo erro/u.test(line)),
      "nao pode anunciar sucesso sem nenhum diagnostico parseavel",
    );
    assert.ok(errors.some((line) => /ERRO no typecheck ratchet/u.test(line)));
  } finally {
    cleanup();
  }
});

test("main() mantem exit 0 com saida vazia do compilador como typecheck limpo", () => {
  const { root, cleanup } = fixture();
  try {
    fakeTsc(root, { status: 0 });
    const baselinePath = path.join(root, "typecheck-baseline.json");
    writeBaseline(baselinePath, []);

    const { exitCode, logs } = captureConsole(() =>
      main(["--baseline", baselinePath, "--root", root]),
    );

    assert.equal(exitCode, 0);
    assert.ok(logs.some((line) => /OK: nenhum novo erro/u.test(line)));
  } finally {
    cleanup();
  }
});

test("main() processa exit 2 com diagnostico parseavel (entrada valida do ratchet)", () => {
  const { root, cleanup } = fixture();
  try {
    const output =
      "src/lib/audit.ts(31,7): error TS2322: Type 'string | null' is not assignable to type 'string | undefined'.\n";
    fakeTsc(root, { status: 2, stdout: output });
    const baselinePath = path.join(root, "typecheck-baseline.json");
    writeFileSync(baselinePath, `${JSON.stringify(createBaseline(output, root), null, 2)}\n`, "utf8");

    const { exitCode, logs } = captureConsole(() =>
      main(["--baseline", baselinePath, "--root", root]),
    );

    assert.equal(exitCode, 0);
    assert.ok(logs.some((line) => /OK: nenhum novo erro/u.test(line)));
  } finally {
    cleanup();
  }
});

test("main() acusa erro novo quando o tsc sai com exit 1 e ha diagnostico parseavel", () => {
  const { root, cleanup } = fixture();
  try {
    fakeTsc(root, {
      status: 1,
      stdout: "src/novo.ts(1,1): error TS9999: erro novo que nao existia antes.\n",
    });
    const baselinePath = path.join(root, "typecheck-baseline.json");
    writeBaseline(baselinePath, []);

    const { exitCode, errors } = captureConsole(() =>
      main(["--baseline", baselinePath, "--root", root]),
    );

    assert.equal(exitCode, 1);
    assert.ok(errors.some((line) => /TS9999/u.test(line)));
  } finally {
    cleanup();
  }
});

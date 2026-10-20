import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  compareBaseline,
  createBaseline,
  eslintCommandArguments,
  main,
  scopeBaseline,
  stagedLintableFiles,
  stagedRemovedFiles,
} from "./lint-ratchet.mjs";

test("ignora artefatos gerados de coverage no comando do ESLint", () => {
  assert.deepEqual(eslintCommandArguments("eslint.js"), [
    "eslint.js",
    ".",
    "--format",
    "json",
    "--ignore-pattern",
    "coverage/**",
  ]);
});

function message(overrides = {}) {
  return {
    ruleId: "no-undef",
    severity: 2,
    message: "'missing' is not defined.",
    messageId: "undef",
    line: 1,
    column: 1,
    endLine: 1,
    endColumn: 8,
    ...overrides,
  };
}

function result(root, file, source, messages = [message()]) {
  return {
    filePath: path.join(root, file),
    source,
    messages,
  };
}

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "lint-ratchet-"));
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

test("baseline e deterministico e aceita o mesmo relatorio", () => {
  const { root, cleanup } = fixture();
  try {
    const report = [result(root, "src/a.ts", "missing();\n")];
    const first = createBaseline(report, root);
    const second = createBaseline(report, root);
    assert.deepEqual(first, second);
    assert.deepEqual(compareBaseline(first, report, root).added, []);
  } finally {
    cleanup();
  }
});

test("bloqueia troca de uma ocorrencia antiga por outra com a mesma contagem", () => {
  const { root, cleanup } = fixture();
  try {
    const baseline = createBaseline([result(root, "src/a.ts", "missing();\n")], root);
    const replacement = result(root, "src/a.ts", "console.log('x');\n", [
      message({
        ruleId: "no-console",
        severity: 1,
        message: "Unexpected console statement.",
        messageId: "unexpected",
        endColumn: 12,
      }),
    ]);
    const comparison = compareBaseline(baseline, [replacement], root);
    assert.equal(comparison.currentCount, comparison.baselineCount);
    assert.equal(comparison.added.length, 1);
    assert.equal(comparison.removed.length, 1);
  } finally {
    cleanup();
  }
});

test("bloqueia codigo diferente no mesmo local com a mesma regra e mensagem", () => {
  const { root, cleanup } = fixture();
  try {
    const baseline = createBaseline([result(root, "src/a.ts", "missing();\n")], root);
    const changed = result(root, "src/a.ts", "missing(123);\n", [message({ endColumn: 13 })]);
    assert.equal(compareBaseline(baseline, [changed], root).added.length, 1);
  } finally {
    cleanup();
  }
});

test("aceita deslocamento de linha quando a ocorrencia e a ancora permanecem", () => {
  const { root, cleanup } = fixture();
  try {
    const baselineSource = "function run() {\n  missing();\n}\n";
    const baseline = createBaseline(
      [result(root, "src/a.ts", baselineSource, [message({ line: 2, column: 3, endLine: 2 })])],
      root,
    );
    const moved = result(root, "src/a.ts", `// cabecalho\n${baselineSource}`, [
      message({ line: 3, column: 3, endLine: 3 }),
    ]);
    assert.deepEqual(compareBaseline(baseline, [moved], root).added, []);
  } finally {
    cleanup();
  }
});

test("bloqueia substituicao por ancora identica em outra posicao sem contexto estavel", () => {
  const { root, cleanup } = fixture();
  try {
    const baseline = createBaseline([result(root, "src/a.ts", "missing();\n")], root);
    const replacement = result(root, "src/a.ts", "fixed();\n\nmissing();\n", [
      message({ line: 3, endLine: 3 }),
    ]);
    const comparison = compareBaseline(baseline, [replacement], root);
    assert.equal(comparison.added.length, 1);
    assert.equal(comparison.removed.length, 1);
  } finally {
    cleanup();
  }
});

test("aceita remocao de arquivo como reducao de divida", () => {
  const { root, cleanup } = fixture();
  try {
    const baseline = createBaseline([result(root, "src/a.ts", "missing();\n")], root);
    const comparison = compareBaseline(baseline, [], root);
    assert.equal(comparison.added.length, 0);
    assert.equal(comparison.removed.length, 1);
  } finally {
    cleanup();
  }
});

test("reconhece renomeacao unica de arquivo sem alteracao", () => {
  const { root, cleanup } = fixture();
  try {
    const source = "missing();\n";
    const baseline = createBaseline([result(root, "src/old.ts", source)], root);
    const comparison = compareBaseline(baseline, [result(root, "src/new.ts", source)], root);
    assert.deepEqual(comparison.added, []);
    assert.deepEqual(comparison.renameAliases, { "src/new.ts": "src/old.ts" });
  } finally {
    cleanup();
  }
});

test("bloqueia renomeacao com edicao para exigir revisao explicita", () => {
  const { root, cleanup } = fixture();
  try {
    const oldSource = "function run() {\n  const value = 1;\n  missing();\n  return value;\n}\n";
    const newSource = `${oldSource}\n// comentario novo\n`;
    const oldMessage = message({ line: 3, column: 3, endLine: 3 });
    const baseline = createBaseline([result(root, "src/old.ts", oldSource, [oldMessage])], root);
    const comparison = compareBaseline(
      baseline,
      [result(root, "src/new.ts", newSource, [oldMessage])],
      root,
    );
    assert.equal(comparison.added.length, 1);
    assert.equal(comparison.removed.length, 1);
    assert.deepEqual(comparison.renameAliases, {});
  } finally {
    cleanup();
  }
});

test("nao permite mover divida para arquivo novo enquanto o arquivo antigo continua limpo", () => {
  const { root, cleanup } = fixture();
  try {
    const oldSource = "missing();\n";
    const baseline = createBaseline([result(root, "src/old.ts", oldSource)], root);
    const current = [
      result(root, "src/old.ts", "fixed();\n", []),
      result(root, "src/new.ts", oldSource),
    ];
    const comparison = compareBaseline(baseline, current, root);
    assert.equal(comparison.added.length, 1);
    assert.equal(comparison.removed.length, 1);
    assert.deepEqual(comparison.renameAliases, {});
  } finally {
    cleanup();
  }
});

test("nao adivinha renomeacao quando hashes identicos sao ambiguos", () => {
  const { root, cleanup } = fixture();
  try {
    const source = "missing();\n";
    const baseline = createBaseline(
      [result(root, "src/old-a.ts", source), result(root, "src/old-b.ts", source)],
      root,
    );
    const current = [result(root, "src/new-a.ts", source), result(root, "src/new-b.ts", source)];
    const comparison = compareBaseline(baseline, current, root);
    assert.equal(comparison.added.length, 2);
    assert.deepEqual(comparison.renameAliases, {});
  } finally {
    cleanup();
  }
});

test("mudanca de severidade e nova divida", () => {
  const { root, cleanup } = fixture();
  try {
    const baselineReport = [result(root, "src/a.ts", "missing();\n", [message({ severity: 1 })])];
    const baseline = createBaseline(baselineReport, root);
    const current = [result(root, "src/a.ts", "missing();\n", [message({ severity: 2 })])];
    assert.equal(compareBaseline(baseline, current, root).added.length, 1);
  } finally {
    cleanup();
  }
});

test("mensagens com caminho absoluto sao normalizadas para a raiz", () => {
  const { root, cleanup } = fixture();
  try {
    const report = [
      result(root, "src/a.ts", "missing();\n", [
        message({ message: `Falha em ${path.join(root, "src", "a.ts")}` }),
      ]),
    ];
    const baseline = createBaseline(report, root);
    assert.equal(baseline.issues[0].message.includes(root), false);
    assert.equal(baseline.issues[0].message.includes("<ROOT>"), true);
  } finally {
    cleanup();
  }
});

test("rejeita baseline gerado por comando incompatível", () => {
  const { root, cleanup } = fixture();
  try {
    const report = [result(root, "src/a.ts", "missing();\n")];
    const baseline = createBaseline(report, root);
    baseline.command = "eslint src --format json";
    assert.throws(() => compareBaseline(baseline, report, root), /Baseline ESLint invalido/);
  } finally {
    cleanup();
  }
});

test("le fonte do disco quando o relatorio nao inclui source", () => {
  const { root, cleanup } = fixture();
  try {
    mkdirSync(path.join(root, "src"), { recursive: true });
    const oldFile = path.join(root, "src", "old.ts");
    const newFile = path.join(root, "src", "new.ts");
    writeFileSync(oldFile, "missing();\n", "utf8");
    const baselineReport = [{ filePath: oldFile, messages: [message()] }];
    const baseline = createBaseline(baselineReport, root);
    renameSync(oldFile, newFile);
    const currentReport = [{ filePath: newFile, messages: [message()] }];
    assert.deepEqual(compareBaseline(baseline, currentReport, root).added, []);
  } finally {
    cleanup();
  }
});

test("CLI falha fechado quando o relatorio nao e JSON valido", () => {
  const { root, cleanup } = fixture();
  const originalError = console.error;
  try {
    writeFileSync(path.join(root, "invalid.json"), "nao-e-json", "utf8");
    console.error = () => {};
    assert.equal(main(["--root", root, "--report", "invalid.json"]), 2);
  } finally {
    console.error = originalError;
    cleanup();
  }
});

test("CLI retorna falha quando uma nova divida aparece", () => {
  const { root, cleanup } = fixture();
  const originalError = console.error;
  const originalLog = console.log;
  try {
    const baselineReport = [result(root, "src/a.ts", "missing();\n")];
    const currentReport = [
      result(root, "src/a.ts", "missing();\nother();\n", [
        message(),
        message({
          message: "'other' is not defined.",
          line: 2,
          endLine: 2,
          endColumn: 6,
        }),
      ]),
    ];
    writeFileSync(
      path.join(root, "baseline.json"),
      JSON.stringify(createBaseline(baselineReport, root)),
      "utf8",
    );
    writeFileSync(path.join(root, "report.json"), JSON.stringify(currentReport), "utf8");
    console.error = () => {};
    console.log = () => {};
    assert.equal(
      main([
        "--root",
        root,
        "--baseline",
        "baseline.json",
        "--report",
        "report.json",
      ]),
      1,
    );
  } finally {
    console.error = originalError;
    console.log = originalLog;
    cleanup();
  }
});

test("eslintCommandArguments aceita alvos e silencia aviso de arquivo ignorado", () => {
  assert.deepEqual(
    eslintCommandArguments("eslint.js", { targets: ["src/a.ts", "src/b.tsx"], noWarnIgnored: true }),
    ["eslint.js", "src/a.ts", "src/b.tsx", "--format", "json", "--no-warn-ignored", "--ignore-pattern", "coverage/**"],
  );
});

function gitFixture() {
  const { root, cleanup } = fixture();
  const git = (...args) => {
    const run = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    return run.stdout;
  };
  git("init", "-q");
  git("config", "user.email", "ratchet@example.com");
  git("config", "user.name", "ratchet");
  return { root, git, cleanup };
}

function write(root, file, content) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), content);
}

function silenced(t) {
  t.mock.method(console, "log", () => {});
  t.mock.method(console, "error", () => {});
}

test("stagedLintableFiles devolve so fontes staged que ainda existem", () => {
  const { root, git, cleanup } = gitFixture();
  try {
    write(root, "src/a.ts", "a();\n");
    write(root, "src/b.tsx", "b();\n");
    write(root, "src/c.mjs", "c();\n");
    write(root, "README.md", "# x\n");
    write(root, "src/unstaged.ts", "u();\n");
    git("add", "src/a.ts", "src/b.tsx", "src/c.mjs", "README.md");
    assert.deepEqual(stagedLintableFiles(root).sort(), ["src/a.ts", "src/b.tsx", "src/c.mjs"]);
  } finally {
    cleanup();
  }
});

test("scopeBaseline mantem so os arquivos escaneados e os removidos no commit", () => {
  const { root, cleanup } = fixture();
  try {
    const baseline = createBaseline(
      [
        result(root, "src/a.ts", "missing();\n"),
        result(root, "src/b.ts", "missing();\n"),
        result(root, "src/removed.ts", "missing();\n"),
        result(root, "src/stale-elsewhere.ts", "missing();\n"),
      ],
      root,
    );
    const scoped = scopeBaseline(baseline, ["src/a.ts"], ["src/removed.ts"]);
    assert.deepEqual(scoped.files.map((entry) => entry.path), ["src/a.ts", "src/removed.ts"]);
    assert.deepEqual(scoped.issues.map((issue) => issue.file).sort(), ["src/a.ts", "src/removed.ts"]);
  } finally {
    cleanup();
  }
});

test("stagedRemovedFiles lista remocoes e origens de renomeacao do commit", () => {
  const { root, git, cleanup } = gitFixture();
  try {
    write(root, "src/old.ts", "old();\n");
    write(root, "src/deleted.ts", "deleted();\n");
    write(root, "docs/notes.md", "# n\n");
    git("add", ".");
    git("commit", "-q", "-m", "base");
    git("mv", "src/old.ts", "src/new.ts");
    git("rm", "-q", "src/deleted.ts", "docs/notes.md");
    assert.deepEqual(stagedRemovedFiles(root).sort(), ["src/deleted.ts", "src/old.ts"]);
    assert.deepEqual(stagedLintableFiles(root), ["src/new.ts"]);
  } finally {
    cleanup();
  }
});

test("--staged ignora divida antiga fora do commit e acusa divida nova nos arquivos staged", (t) => {
  silenced(t);
  const { root, git, cleanup } = gitFixture();
  try {
    write(root, "src/a.ts", "missing();\nother();\n");
    write(root, "src/legacy.ts", "missing();\n");
    const baselinePath = path.join(root, "baseline.json");
    writeFileSync(
      baselinePath,
      JSON.stringify(
        createBaseline(
          [result(root, "src/a.ts", "missing();\nother();\n"), result(root, "src/legacy.ts", "missing();\n")],
          root,
        ),
      ),
    );
    git("add", "src/a.ts");
    const reportPath = path.join(root, "report.json");
    const args = ["--staged", "--root", root, "--baseline", baselinePath, "--report", reportPath];

    // legacy.ts tem divida no baseline mas nao esta no commit: nao pode contar como remocao nem como nova.
    writeFileSync(reportPath, JSON.stringify([result(root, "src/a.ts", "missing();\nother();\n")]));
    assert.equal(main(args), 0);

    const extra = message({ line: 2, endLine: 2, message: "'other' is not defined." });
    writeFileSync(reportPath, JSON.stringify([result(root, "src/a.ts", "missing();\nother();\n", [message(), extra])]));
    assert.equal(main(args), 1);
  } finally {
    cleanup();
  }
});

test("--staged reconhece arquivo renomeado pelo hash em vez de contar divida nova", (t) => {
  silenced(t);
  const { root, git, cleanup } = gitFixture();
  try {
    const baselinePath = path.join(root, "baseline.json");
    writeFileSync(baselinePath, JSON.stringify(createBaseline([result(root, "src/old.ts", "missing();\n")], root)));
    write(root, "src/old.ts", "missing();\n");
    git("add", "src/old.ts");
    git("commit", "-q", "-m", "base");
    git("mv", "src/old.ts", "src/new.ts");
    const reportPath = path.join(root, "report.json");
    writeFileSync(reportPath, JSON.stringify([result(root, "src/new.ts", "missing();\n")]));
    assert.equal(main(["--staged", "--root", root, "--baseline", baselinePath, "--report", reportPath]), 0);
  } finally {
    cleanup();
  }
});

test("--staged sem arquivo lintavel no commit sai com sucesso sem rodar o ESLint", (t) => {
  silenced(t);
  const { root, git, cleanup } = gitFixture();
  try {
    write(root, "README.md", "# x\n");
    git("add", "README.md");
    assert.equal(main(["--staged", "--root", root]), 0);
  } finally {
    cleanup();
  }
});

test("--staged nao combina com --update-baseline", (t) => {
  silenced(t);
  const { root, cleanup } = gitFixture();
  try {
    assert.equal(main(["--staged", "--update-baseline", "--root", root]), 2);
  } finally {
    cleanup();
  }
});

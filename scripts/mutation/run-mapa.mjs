#!/usr/bin/env node
/**
 * E69 · Script de mutação reproduzível do módulo do mapa (Fase 7).
 *
 * Alvo (módulo do mapa): `src/components/inbox/location-picker/**` + os arquivos que ele
 * consome (`src/lib/mapbox*`). Aplica N mutações por `sed` em CÓPIA TEMPORÁRIA (backup em
 * `.tmp/mutation-backup/`), roda a suíte que cobre o módulo, RESTAURA o arquivo original
 * (byte a byte) e imprime a tabela `mutação → mudou o resultado dos testes?`.
 *
 * Mutações do plano (E69 = "as 3 de E21 + 3 da Fase 3"):
 *   - E21-M1  desliga a cascata /suggest → /forward  (mapa-f2.md M1)
 *   - E21-M3  desliga o fallback do /retrieve        (mapa-f2.md M3)
 *   - E21-M4  Enter sem destaque ignora o termo digitado (mapa-f2.md M4)
 *   - F3-abort   remove o abort() da consulta anterior
 *   - F3-empty   remove o status `empty`
 *   - F3-retry   retrySuggest vira no-op
 *
 * `--control` acrescenta uma mutação de CONTROLE que troca um valor que nenhum teste do
 * módulo observa (o placeholder do combobox). Ela DEVE sobreviver — é a prova de que o
 * runner distingue "mutante morto" de "mutante vivo", em vez de só imprimir "ok".
 *
 * Uso:  npm run mutation:mapa            (6 mutações da etapa)
 *       npm run mutation:mapa -- --control  (6 + controle)
 */

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const BACKUP_DIR = path.join(ROOT, ".tmp", "mutation-backup");

const HOOK = "src/components/inbox/location-picker/useAddressAutocomplete.ts";
const PICKER = "src/components/inbox/LocationPicker.tsx";

/** Suíte que cobre o módulo do mapa (location-picker + consumidores). Foco e rapidez:
 *  ~5 s por rodada — um runner que leva 40 min ninguém roda. */
const SUITE = [
  "src/components/inbox/location-picker/__tests__/useAddressAutocomplete.test.tsx",
  "src/components/inbox/location-picker/__tests__/useAddressAutocomplete.reducer.test.ts",
  "src/components/inbox/__tests__/LocationPicker.test.tsx",
  "src/components/inbox/__tests__/LocationPicker.integration.test.tsx",
];

/**
 * Cada mutação: `from` (literal único, só para o pré-check de sanidade) + `sedScript`
 * (expressão ERE aplicada com `sed -i -E`). O sed roda sobre o arquivo real, que é
 * restaurado a partir do backup ao fim de cada rodada.
 */
const MUTATIONS = [
  {
    id: "E21-M1",
    desc: "desliga a cascata /suggest → /forward (if(false))",
    file: HOOK,
    from: "if (!result.ok && FORWARD_FALLBACK_KINDS.has(result.kind)) {",
    sedScript:
      "s/if \\(!result\\.ok && FORWARD_FALLBACK_KINDS\\.has\\(result\\.kind\\)\\) \\{/if (false) {/",
  },
  {
    id: "E21-M3",
    desc: "desliga o fallback do /retrieve (place = undefined)",
    file: HOOK,
    from: "const place = fallback.ok ? fallback.places[0] : undefined;",
    sedScript:
      "s/const place = fallback\\.ok \\? fallback\\.places\\[0\\] : undefined;/const place = undefined;/",
  },
  {
    id: "E21-M4",
    desc: "Enter sem destaque ignora o termo do combobox",
    file: PICKER,
    from: "void searchLocation(autocomplete.query);",
    sedScript:
      "s/void searchLocation\\(autocomplete\\.query\\);/void searchLocation();/",
  },
  {
    id: "F3-abort",
    desc: "remove o abort() da consulta anterior (1ª ocorrência)",
    file: HOOK,
    from: "abortRef.current?.abort();",
    expectOnce: false,
    sedScript:
      "0,/abortRef\\.current\\?\\.abort\\(\\);/s//\\/\\/ [mutacao] abort() removido/",
  },
  {
    id: "F3-empty",
    desc: "remove o status `empty` (lista vazia passa a `ok`)",
    file: HOOK,
    from: "status: action.suggestions.length > 0 ? 'ok' : 'empty',",
    sedScript:
      "s/status: action\\.suggestions\\.length > 0 \\? 'ok' : 'empty',/status: 'ok',/",
  },
  {
    id: "F3-retry",
    desc: "retrySuggest vira no-op (RETRY → return)",
    file: HOOK,
    from: "dispatch({ type: 'RETRY' });",
    sedScript: "s/dispatch\\(\\{ type: 'RETRY' \\}\\);/return;/",
  },
];

const CONTROL = {
  id: "CTRL",
  desc: "CONTROLE: troca o placeholder (valor que nenhum teste observa)",
  file: PICKER,
  from: 'placeholder="Buscar endereço..."',
  sedScript:
    's/placeholder="Buscar endereço\\.\\.\\."/placeholder="Buscar endereços..."/',
};

const COUNT = (text, needle) => text.split(needle).length - 1;

function vitestBin() {
  const bin = path.join(ROOT, "node_modules", ".bin", "vitest");
  return process.platform === "win32" ? `${bin}.cmd` : bin;
}

function runSuite() {
  const res = spawnSync(vitestBin(), ["run", ...SUITE], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = `${res.stdout ?? ""}\n${res.stderr ?? ""}`;
  // Nomes dos testes vermelhos: o reporter default do vitest marca cada falha com `×`.
  const failed = [
    ...new Set(
      (out.match(/^\s*×\s+(.+?)\s*$/gm) ?? []).map((l) =>
        l.replace(/^\s*×\s+/, "").replace(/\s*$/u, ""),
      ),
    ),
  ];
  const summary =
    (out.match(/^\s*Tests\s+.*$/m) ?? []).map((s) => s.trim())[0] ?? "(sem resumo)";
  return { code: res.status, failed, summary };
}

function main() {
  const withControl = process.argv.includes("--control");
  const list = withControl ? [...MUTATIONS, CONTROL] : MUTATIONS;

  rmSync(BACKUP_DIR, { recursive: true, force: true });
  mkdirSync(BACKUP_DIR, { recursive: true });

  // Backup da cópia temporária + leitura em memória (dupla rede de segurança).
  const originals = new Map();
  for (const m of list) {
    const abs = path.join(ROOT, m.file);
    if (!originals.has(m.file)) {
      originals.set(m.file, readFileSync(abs));
      copyFileSync(abs, path.join(BACKUP_DIR, path.basename(m.file)));
    }
  }

  const results = [];
  try {
    for (const m of list) {
      const abs = path.join(ROOT, m.file);
      const before = readFileSync(abs, "utf8");
      const occurrences = COUNT(before, m.from);
      if (m.expectOnce === false) {
        if (occurrences < 1) throw new Error(`[${m.id}] literal não encontrado: ${m.from}`);
      } else if (occurrences !== 1) {
        throw new Error(`[${m.id}] literal aparece ${occurrences}× (esperado 1): ${m.from}`);
      }

      const sed = spawnSync("sed", ["-i", "-E", m.sedScript, m.file], {
        cwd: ROOT,
        encoding: "utf8",
      });
      if (sed.status !== 0) throw new Error(`[${m.id}] sed falhou: ${sed.stderr}`);

      const after = readFileSync(abs, "utf8");
      if (after === before) throw new Error(`[${m.id}] sed não alterou o arquivo (padrão sem efeito)`);

      const r = runSuite();
      results.push({
        ...m,
        killed: r.code !== 0,
        failed: r.failed,
        summary: r.summary,
      });

      // Restaura sempre, mesmo se a rodada falhar de um jeito inesperado.
      copyFileSync(path.join(BACKUP_DIR, path.basename(m.file)), abs);
      const restored = readFileSync(abs, "utf8");
      if (restored !== before) throw new Error(`[${m.id}] restauração divergiu de byte a byte`);
    }
  } finally {
    for (const [file, buf] of originals) {
      const abs = path.join(ROOT, file);
      if (readFileSync(abs).compare(buf) !== 0) {
        copyFileSync(path.join(BACKUP_DIR, path.basename(file)), abs);
      }
    }
  }

  // Tabela final.
  const line = "─".repeat(96);
  console.log(`\n${line}\nE69 · mutação do módulo do mapa — cópia temporária: ${path.relative(ROOT, BACKUP_DIR)}\nSuíte: ${SUITE.length} arquivos (${results[0]?.summary ?? ""})\n${line}`);
  let killed = 0;
  for (const r of results) {
    const state = r.killed ? "MORTO     " : "SOBREVIVEU";
    killed += r.killed ? 1 : 0;
    console.log(`${state}  ${r.id.padEnd(9)} ${r.desc}`);
    console.log(`          ${r.summary}`);
    if (r.failed.length) {
      console.log(`          testes que pegaram: ${r.failed.join(" | ")}`);
    }
  }
  console.log(line);
  console.log(`Resultado: ${killed}/${results.length} mutantes MORTOS, ${results.length - killed} SOBREVIVENTES.`);
  const survivors = results.filter((r) => !r.killed).map((r) => r.id);
  console.log(`Sobreviventes: ${survivors.length ? survivors.join(", ") : "(nenhum)"}`);
  console.log(`${line}\n`);

  // Todos os arquivos voltaram idênticos? (garante que nada ficou mutado na árvore)
  for (const [file, buf] of originals) {
    if (readFileSync(path.join(ROOT, file)).compare(buf) !== 0) {
      console.error(`!! ${file} não voltou ao original`);
      process.exitCode = 2;
    }
  }
}

main();

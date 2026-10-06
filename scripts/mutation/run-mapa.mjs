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
 * ── R2-INF-019 (#366): falha de infraestrutura NÃO é mutante morto ──────────────
 * Antes: `killed = processo.status !== 0`. Binário que não inicia (status null),
 * configuração quebrada, "No test files found" ou erro não tratado do vitest davam
 * MORTO sem executar um único teste — medido: escondendo o vitest e rodando o runner
 * antigo, ele imprimia "6/6 mutantes MORTOS" e saía 0. Agora:
 *
 *   - BASELINE obrigatório: a suíte roda uma vez SEM mutação e precisa ficar VERDE.
 *     Sem baseline verde nada é medido (saída 2), porque um vermelho pré-existente
 *     "mataria" toda mutação.
 *   - MORTO só com pelo menos um teste NOMEADO vermelho, presente no resumo `Tests ...`
 *     e no corpo da saída: asserção rastreável, não apenas "saiu diferente de zero".
 *   - INFRA (não iniciou, morreu por sinal, não imprimiu o resumo) e INCONCLUSIVO
 *     (saiu diferente de zero, resumo presente, nenhum teste nomeado vermelho) são
 *     estados próprios e NUNCA contam como mutante morto.
 *   - Sobreviventes: política explícita. Sobrevive por construção o mutante
 *     equivalente documentado em `EQUIVALENTES_DECLARADOS` e a mutação de controle
 *     que declara `esperado: ESTADOS.sobrevivente`. Qualquer outro sobrevivente é
 *     lacuna de teste e reprova a rodada (código 1).
 *
 * Política de saída (a conclusão vai para o status, não só para o texto):
 *   0 = baseline verde, todas as rodadas conclusivas e nenhum sobrevivente fora de
 *       EQUIVALENTES_DECLARADOS;
 *   1 = medição válida com sobrevivente NÃO declarado equivalente;
 *   2 = medição inválida (baseline não verde, rodada INFRA/INCONCLUSIVA ou erro
 *       inesperado) — aqui o runner não afirma nada sobre a qualidade da suíte.
 *
 * Uso:  npm run mutation:mapa               (6 mutações da etapa)
 *       npm run mutation:mapa -- --control  (6 + controle)
 */

import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolverExecutavel } from "../lib/seguranca-processo.mjs";

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

/** Estados possíveis de uma rodada (e, portanto, de um mutante). */
export const ESTADOS = {
  /** O teste nomeado certo falhou: o mutante foi pego. */
  morto: "morto",
  /** Suíte verde sob a mutação: nenhum teste observa essa mudança. */
  sobrevivente: "sobrevivente",
  /** A suíte não chegou a medir (não iniciou, sinal, sem resumo `Tests ...`). */
  infra: "infra",
  /** Rodou, mas saiu diferente de zero sem nenhum teste nomeado vermelho. */
  inconclusivo: "inconclusivo",
};

/**
 * Mutantes que SOBREVIVEM por equivalência conhecida e documentada — não são lacuna
 * de teste e não reprovam a rodada. Qualquer sobrevivente fora deste mapa é reportado
 * e derruba a saída para 1.
 */
export const EQUIVALENTES_DECLARADOS = new Map([
  [
    "F3-abort",
    "equivalente: o abort() do setQuery é redundante sob o guard activeTermRef — a resposta " +
      "velha já é descartada de qualquer forma (docs/mapa/PLANO_FINALIZACAO_100_ETAPAS_2026-09-29.md, E69)",
  ],
]);

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
  // Mutação de CONTROLE: sobreviver é o resultado ESPERADO (nenhum teste observa o
  // placeholder). Sem essa declaração, um sobrevivente reprovaria a rodada (código 1).
  esperado: ESTADOS.sobrevivente,
  sedScript:
    's/placeholder="Buscar endereço\\.\\.\\."/placeholder="Buscar endereços..."/',
};

const COUNT = (text, needle) => text.split(needle).length - 1;

function vitestBin() {
  const bin = path.join(ROOT, "node_modules", ".bin", "vitest");
  return process.platform === "win32" ? `${bin}.cmd` : bin;
}

/** Linha de resumo do vitest (`Tests  1 failed | 41 passed (42)`), quando existe. */
function resumoDeTestes(saida) {
  return (saida.match(/^\s*Tests\s+.*$/m) ?? [])[0]?.trim() ?? null;
}

/** Nomes dos testes vermelhos: é o que torna a detecção rastreável. */
function testesVermelhos(saida) {
  return [
    ...new Set(
      (saida.match(/^\s*×\s+(.+?)\s*$/gm) ?? []).map((l) =>
        l.replace(/^\s*×\s+/, "").replace(/\s*$/u, ""),
      ),
    ),
  ];
}

/**
 * Classifica a rodada a partir do resultado cru do processo da suíte. R2-INF-019:
 * erro de execução/configuração NUNCA vira "mutante morto".
 */
export function interpretarRodada(processo) {
  const saida = `${processo?.stdout ?? ""}\n${processo?.stderr ?? ""}`;
  const resumo = resumoDeTestes(saida);
  const falhas = testesVermelhos(saida);

  if (!processo || processo.error) {
    return {
      estado: ESTADOS.infra,
      motivo: `a suíte não iniciou: ${processo?.error?.message ?? "sem resultado do processo"}`,
      resumo,
      falhas,
    };
  }
  if (processo.status === null || processo.signal) {
    return {
      estado: ESTADOS.infra,
      motivo: `processo encerrado por sinal ${processo.signal ?? "(desconhecido)"} antes do resumo`,
      resumo,
      falhas,
    };
  }
  if (!resumo) {
    return {
      estado: ESTADOS.infra,
      motivo:
        "a suíte saiu sem imprimir o resumo `Tests ...` — coleta/configuração falhou ou nenhum teste rodou",
      resumo,
      falhas,
    };
  }
  const falhasNoResumo = Number((resumo.match(/(\d+)\s+failed/) ?? [])[1] ?? 0);
  if (falhasNoResumo > 0 && falhas.length > 0) {
    return {
      estado: ESTADOS.morto,
      motivo: `${falhas.length} teste(s) nomeado(s) vermelho(s) — ${resumo}`,
      resumo,
      falhas,
    };
  }
  if (processo.status === 0 && falhasNoResumo === 0) {
    return {
      estado: ESTADOS.sobrevivente,
      motivo: `suíte verde sob a mutação (${resumo})`,
      resumo,
      falhas,
    };
  }
  return {
    estado: ESTADOS.inconclusivo,
    motivo: `saída ${processo.status} sem nenhum teste nomeado vermelho (${resumo})`,
    resumo,
    falhas,
  };
}

/**
 * Roda a suíte que cobre o módulo. `comando`/`argumentos` existem para o teste injetar
 * um processo controlado (suíte que não inicia, que sai 1 sem rodar teste, suíte verde
 * sintética) sem depender do vitest instalado.
 */
export function rodarSuite({ comando = vitestBin(), argumentos = ["run", ...SUITE] } = {}) {
  const processo = spawnSync(comando, argumentos, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return { ...interpretarRodada(processo), saidaProcesso: processo?.status ?? null };
}

/**
 * Política de saída: o que o runner afirma ao terminar. Ver o cabeçalho do arquivo.
 *
 * Um sobrevivente só deixa de reprovar quando é ESPERADO: mutação de controle que
 * declara `esperado: ESTADOS.sobrevivente` (nenhum teste observa o valor trocado) ou
 * mutante equivalente documentado em `EQUIVALENTES_DECLARADOS`.
 */
export function veredito({ baseline, resultados, equivalentes = EQUIVALENTES_DECLARADOS }) {
  if (!baseline || baseline.estado !== ESTADOS.sobrevivente) {
    return {
      codigo: 2,
      sobreviventesEsperados: [],
      sobreviventesInesperados: [],
      motivo: `baseline ${baseline?.estado ?? "ausente"} (${baseline?.motivo ?? "a suíte não rodou sem mutação"})`,
    };
  }
  const semMedicao = resultados.filter(
    (r) => r.estado === ESTADOS.infra || r.estado === ESTADOS.inconclusivo,
  );
  if (semMedicao.length > 0) {
    return {
      codigo: 2,
      sobreviventesEsperados: [],
      sobreviventesInesperados: [],
      motivo: `medição inválida em ${semMedicao.map((r) => `${r.id} (${r.estado})`).join(", ")}`,
    };
  }
  const sobreviventes = resultados.filter((r) => r.estado === ESTADOS.sobrevivente);
  const eraEsperado = (r) => equivalentes.has(r.id) || r.esperado === ESTADOS.sobrevivente;
  const sobreviventesEsperados = sobreviventes.filter(eraEsperado).map((r) => r.id);
  const sobreviventesInesperados = sobreviventes.filter((r) => !eraEsperado(r)).map((r) => r.id);
  if (sobreviventesInesperados.length > 0) {
    return {
      codigo: 1,
      sobreviventesEsperados,
      sobreviventesInesperados,
      motivo: `sobreviventes NÃO declarados: ${sobreviventesInesperados.join(", ")}`,
    };
  }
  return {
    codigo: 0,
    sobreviventesEsperados,
    sobreviventesInesperados: [],
    motivo: `${resultados.length} mutante(s) medido(s); nenhum sobrevivente inesperado`,
  };
}

const ROTULO = {
  [ESTADOS.morto]: "MORTO     ",
  [ESTADOS.sobrevivente]: "SOBREVIVEU",
  [ESTADOS.infra]: "INFRA     ",
  [ESTADOS.inconclusivo]: "INCONCL.  ",
};

/** Roda UM mutante e devolve o resultado já classificado (nunca lança por medição). */
function medirMutante(m) {
  const abs = path.join(ROOT, m.file);
  const before = readFileSync(abs, "utf8");
  const occurrences = COUNT(before, m.from);
  const literalOk = m.expectOnce === false ? occurrences >= 1 : occurrences === 1;
  if (!literalOk) {
    return {
      ...m,
      estado: ESTADOS.inconclusivo,
      motivo: `literal ${m.expectOnce === false ? "não encontrado" : `aparece ${occurrences}× (esperado 1)`}: ${m.from}`,
      resumo: null,
      falhas: [],
    };
  }

  try {
    const sed = spawnSync(resolverExecutavel("sed"), ["-i", "-E", m.sedScript, m.file], {
      cwd: ROOT,
      encoding: "utf8",
    });
    if (sed.status !== 0) {
      return {
        ...m,
        estado: ESTADOS.inconclusivo,
        motivo: `sed falhou: ${sed.stderr}`,
        resumo: null,
        falhas: [],
      };
    }
    const after = readFileSync(abs, "utf8");
    if (after === before) {
      return {
        ...m,
        estado: ESTADOS.inconclusivo,
        motivo: "sed não alterou o arquivo (padrão sem efeito)",
        resumo: null,
        falhas: [],
      };
    }
    return { ...m, ...rodarSuite() };
  } catch (erro) {
    return {
      ...m,
      estado: ESTADOS.inconclusivo,
      motivo: `rodada não mediu: ${erro.message}`,
      resumo: null,
      falhas: [],
    };
  } finally {
    // Restaura sempre — inclusive quando a rodada foi inconclusiva ou lançou.
    copyFileSync(path.join(BACKUP_DIR, path.basename(m.file)), abs);
    const restaurado = readFileSync(abs, "utf8");
    if (restaurado !== before) throw new Error(`[${m.id}] restauração divergiu de byte a byte`);
  }
}

function imprimirTabela(baseline, resultados, v) {
  const line = "─".repeat(96);
  console.log(
    `\n${line}\nE69 · mutação do módulo do mapa — cópia temporária: ${path.relative(ROOT, BACKUP_DIR)}\n` +
      `Baseline (sem mutação): ${baseline.estado} — ${baseline.resumo ?? "(sem resumo)"}\n` +
      `Suíte: ${SUITE.length} arquivos\n${line}`,
  );
  for (const r of resultados) {
    console.log(`${ROTULO[r.estado] ?? r.estado}  ${r.id.padEnd(9)} ${r.desc}`);
    console.log(`          ${r.motivo}`);
    if (r.falhas?.length) {
      console.log(`          testes que pegaram: ${r.falhas.join(" | ")}`);
    }
  }
  const mortos = resultados.filter((r) => r.estado === ESTADOS.morto).length;
  const sobreviventes = resultados.filter((r) => r.estado === ESTADOS.sobrevivente);
  const semMedicao = resultados.filter(
    (r) => r.estado === ESTADOS.infra || r.estado === ESTADOS.inconclusivo,
  );
  console.log(line);
  console.log(
    `Resultado: ${mortos}/${resultados.length} mutantes MORTOS · ${sobreviventes.length} SOBREVIVENTE(S) ` +
      `(${v.sobreviventesEsperados.length} esperado(s)) · ${semMedicao.length} sem medição`,
  );
  if (sobreviventes.length > 0) {
    console.log(
      `Sobreviventes: ${sobreviventes
        .map((r) =>
          v.sobreviventesEsperados.includes(r.id)
            ? `${r.id} (${r.esperado === ESTADOS.sobrevivente ? "controle: sobreviver é o esperado" : "equivalente declarado"})`
            : `${r.id} (NÃO declarado)`,
        )
        .join(", ")}`,
    );
  }
  if (semMedicao.length > 0) {
    console.log(
      `Sem medição (NÃO contam como mortos): ${semMedicao.map((r) => `${r.id} (${r.estado})`).join(", ")}`,
    );
  }
  const controlesDiferentes = resultados.filter(
    (r) => r.esperado === ESTADOS.sobrevivente && r.estado !== ESTADOS.sobrevivente,
  );
  if (controlesDiferentes.length > 0) {
    console.log(
      `ATENÇÃO: controle declarado sobrevivente não sobreviveu (${controlesDiferentes
        .map((r) => `${r.id}: ${r.estado}`)
        .join(", ")}) — revise o controle`,
    );
  }
  console.log(`Veredito: ${v.motivo} → saída ${v.codigo}`);
  console.log(`${line}\n`);
}

function executar() {
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

  // 0) BASELINE: sem mutação, a suíte tem de ficar verde. Sem isso não há medição —
  // um vermelho pré-existente mataria qualquer mutante, e uma infra quebrada mataria
  // todos de uma vez (era exatamente o defeito R2-INF-019).
  const baseline = rodarSuite();
  console.log(
    `\nBaseline (sem mutação): ${baseline.estado} — ${baseline.motivo}`,
  );
  if (baseline.estado !== ESTADOS.sobrevivente) {
    console.error("BASELINE INVÁLIDO: a suíte precisa passar SEM mutação. Nada foi medido.");
    process.exitCode = 2;
    return;
  }

  const resultados = [];
  try {
    for (const m of list) {
      resultados.push(medirMutante(m));
    }
  } finally {
    for (const [file, buf] of originals) {
      const abs = path.join(ROOT, file);
      if (readFileSync(abs).compare(buf) !== 0) {
        copyFileSync(path.join(BACKUP_DIR, path.basename(file)), abs);
      }
    }
  }

  const v = veredito({ baseline, resultados });
  imprimirTabela(baseline, resultados, v);

  // Todos os arquivos voltaram idênticos? (garante que nada ficou mutado na árvore)
  for (const [file, buf] of originals) {
    if (readFileSync(path.join(ROOT, file)).compare(buf) !== 0) {
      console.error(`!! ${file} não voltou ao original`);
      process.exitCode = 2;
      return;
    }
  }

  process.exitCode = v.codigo;
}

function main() {
  try {
    executar();
  } catch (erro) {
    console.error(`MEDIÇÃO INVÁLIDA: ${erro.message}`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

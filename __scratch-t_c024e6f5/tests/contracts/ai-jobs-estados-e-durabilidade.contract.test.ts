/**
 * Contrato de DURABILIDADE de jobs (IA-045) e ESTADOS PADRONIZADOS (IA-046)
 * — Bloco 05 / PR-3. Território: ESTE único arquivo.
 *
 * O que fica provado aqui (desenho congelado, conta Bloco 05 / PR-3):
 *
 *   IA-046 — o vocabulário de estados tem EXATAMENTE sete valores e habita os
 *            TRÊS artefatos de uma vez:
 *              · interface ... `src/lib/aiJobs/status.ts`
 *              · worker ...... `supabase/functions/_shared/ai-jobs.ts`
 *              · banco ....... o `check` de `ai_jobs.status` na migration
 *                             20261002371230_ia045_ia046_ai_jobs_durabilidade_e_estados.sql
 *            Não-terminais: queued, running, partial.
 *            Terminais:     succeeded, failed, cancelled, outcome_unknown.
 *            Transições:    queued→running|cancelled;
 *                           running→partial|succeeded|failed|cancelled|outcome_unknown;
 *                           partial→running|succeeded|failed|cancelled|outcome_unknown;
 *                           terminal→nenhuma.
 *            `partial` NÃO é concluído: não é terminal e pode transicionar para
 *            succeeded/failed/… (retomada/avanço), nunca é lido como sucesso.
 *
 *   IA-045 — a fila durável existe de verdade no banco: `idempotency_key UNIQUE`,
 *            as funções `enqueue_ai_job` / `claim_ai_jobs` / `heartbeat_ai_job` /
 *            `finish_ai_job` / `reap_ai_jobs` / `cancel_ai_job`, claim com
 *            `FOR UPDATE SKIP LOCKED`, lease/heartbeat (`lease_token`,
 *            `lease_expires_at`, `heartbeat_at`) e expiração (`expires_at`).
 *            E o aceite do enfileiramento: `enqueueAiJob` LANÇA em falha de
 *            infraestrutura — nunca falha aberto (um job aceito que "desaparece"
 *            é exatamente a duplicidade/perda que a IA-045 proíbe).
 *
 * Como cada camada é exercitada:
 *   - a interface é um módulo puro (sem Deno, sem rede), importado direto;
 *   - o worker importa `https://esm.sh/@supabase/supabase-js` — o client inteiro
 *     vira dublê (`vi.mock`) e `Deno.env` é dublado, então nenhum socket abre;
 *   - o banco é lido como TEXTO (fs) com os comentários `--` removidos antes de
 *     qualquer varredura, para que um valor citado só num comentário NÃO conte
 *     como implementação.
 *
 * RED-FIRST: a migration e o módulo do worker ainda estão sendo escritos pelos
 * outros agentes do PR. Até lá estes casos ficam vermelhos de propósito — o teste
 * NÃO foi enfraquecido para passar, e nenhum arquivo de produção foi tocado.
 *
 * PROVA POR MUTAÇÃO (não enfraquecida para passar — ver relatório do sweep):
 *   (a) incluir `partial` em `AI_JOB_TERMINAL_STATUSES`  ⇒ os casos de parcial falham;
 *   (b) permitir transição a partir de um terminal       ⇒ os casos de terminal falham;
 *   (c) remover `outcome_unknown` do espelho da interface ⇒ o caso de identidade falha.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* ---------------------------------------------------------------------------------------- */
/* Vocabulário congelado (fonte da verdade do contrato)                                      */
/* ---------------------------------------------------------------------------------------- */

const FROZEN_STATUSES = [
  'queued',
  'running',
  'partial',
  'succeeded',
  'failed',
  'cancelled',
  'outcome_unknown',
] as const;

const FROZEN_TERMINALS = ['succeeded', 'failed', 'cancelled', 'outcome_unknown'] as const;
const FROZEN_NON_TERMINALS = ['queued', 'running', 'partial'] as const;

const FROZEN_TRANSITIONS: Record<string, readonly string[]> = {
  queued: ['running', 'cancelled'],
  running: ['partial', 'succeeded', 'failed', 'cancelled', 'outcome_unknown'],
  partial: ['running', 'succeeded', 'failed', 'cancelled', 'outcome_unknown'],
  succeeded: [],
  failed: [],
  cancelled: [],
  outcome_unknown: [],
};

/** Transições explicitamente proibidas (não só "ausentes do mapa"). */
const INVALIDAS: ReadonlyArray<[string, string]> = [
  ['queued', 'succeeded'],
  ['queued', 'partial'],
  ['queued', 'failed'],
  ['queued', 'outcome_unknown'],
  ['succeeded', 'running'],
  ['failed', 'succeeded'],
  ['cancelled', 'running'],
  ['outcome_unknown', 'running'],
];

const sortStrings = (xs: readonly string[]) => [...xs].sort((a, b) => a.localeCompare(b));

/* ---------------------------------------------------------------------------------------- */
/* Caminhos                                                                                   */
/* ---------------------------------------------------------------------------------------- */

const ROOT = resolve(__dirname, '../..');
const ARQ_MIGRATION = resolve(
  ROOT,
  'supabase/migrations/20261002371230_ia045_ia046_ai_jobs_durabilidade_e_estados.sql',
);
const ARQ_EDGE = resolve(ROOT, 'supabase/functions/_shared/ai-jobs.ts');

const CAMINHO_EDGE = '../../supabase/functions/_shared/ai-jobs.ts';
const CAMINHO_FRONT = '../../src/lib/aiJobs/status.ts';

/* ---------------------------------------------------------------------------------------- */
/* Dublê do client Supabase (nenhum socket é aberto)                                          */
/* ---------------------------------------------------------------------------------------- */

const H = vi.hoisted(() => {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const fromCalls: string[] = [];
  const state = {
    rpcResult: { data: null, error: null } as { data: unknown; error: { message?: string } | null },
    fromResult: { data: null, error: null } as { data: unknown; error: { message?: string } | null },
  };
  const client = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return Promise.resolve(state.rpcResult);
    },
    from: (table: string) => {
      fromCalls.push(table);
      const chain: Record<string, unknown> = {};
      const pass = () => chain;
      Object.assign(chain, {
        insert: pass,
        update: pass,
        upsert: pass,
        delete: pass,
        select: pass,
        eq: pass,
        is: pass,
        in: pass,
        order: pass,
        limit: pass,
        single: () => Promise.resolve(state.fromResult),
        maybeSingle: () => Promise.resolve(state.fromResult),
        then: (res: (v: unknown) => unknown) => res(state.fromResult),
      });
      return chain;
    },
  };
  return { calls, fromCalls, state, client };
});

vi.mock('https://esm.sh/@supabase/supabase-js@2.87.1', () => ({ createClient: () => H.client }));

function stubDeno(comEnv = true): void {
  vi.stubGlobal('Deno', {
    env: {
      get: (key: string): string | undefined =>
        comEnv
          ? {
              SUPABASE_URL: 'https://projeto.teste.supabase.co',
              SUPABASE_SERVICE_ROLE_KEY: 'service-role-ficticia',
              SUPABASE_ANON_KEY: 'anon-ficticia',
            }[key]
          : undefined,
    },
  });
}

/* ---------------------------------------------------------------------------------------- */
/* Carregamento dos módulos                                                                   */
/* ---------------------------------------------------------------------------------------- */

interface AiJobsModule {
  AI_JOB_STATUSES?: readonly string[];
  AI_JOB_TERMINAL_STATUSES?: readonly string[];
  AI_JOB_TRANSITIONS?: Record<string, readonly string[]>;
  AI_JOB_STATUS_LABELS?: Record<string, string>;
  canTransitionAiJob?: (from: string, to: string) => boolean;
  isTerminalAiJobStatus?: (status: string) => boolean;
  enqueueAiJob?: (a: unknown, b?: unknown) => Promise<unknown>;
}

let edgeCache: AiJobsModule | null = null;
async function workerMod(): Promise<AiJobsModule> {
  if (edgeCache) return edgeCache;
  try {
    edgeCache = (await import(CAMINHO_EDGE)) as unknown as AiJobsModule;
  } catch (erro) {
    throw new Error(
      `_shared/ai-jobs.ts não importável (IA-045/IA-046): ${
        erro instanceof Error ? erro.message : String(erro)
      }`,
    );
  }
  return edgeCache;
}

let frontCache: AiJobsModule | null = null;
async function frontMod(): Promise<AiJobsModule> {
  if (frontCache) return frontCache;
  try {
    frontCache = (await import(CAMINHO_FRONT)) as unknown as AiJobsModule;
  } catch (erro) {
    throw new Error(
      `src/lib/aiJobs/status.ts não importável (IA-046): ${
        erro instanceof Error ? erro.message : String(erro)
      }`,
    );
  }
  return frontCache;
}

/** `AI_JOB_STATUSES` do módulo, com erro claro quando o export some. */
function statusesOf(mod: AiJobsModule, quem: string): string[] {
  const v = mod.AI_JOB_STATUSES;
  if (!Array.isArray(v)) throw new Error(`${quem}: não exporta AI_JOB_STATUSES (array)`);
  return [...v];
}

function terminalsOf(mod: AiJobsModule, quem: string): string[] {
  const v = mod.AI_JOB_TERMINAL_STATUSES;
  if (!Array.isArray(v)) throw new Error(`${quem}: não exporta AI_JOB_TERMINAL_STATUSES (array)`);
  return [...v];
}

function canTransition(mod: AiJobsModule, from: string, to: string, quem: string): boolean {
  const f = mod.canTransitionAiJob;
  if (typeof f !== 'function') throw new Error(`${quem}: não exporta canTransitionAiJob`);
  return f(from, to);
}

function isTerminal(mod: AiJobsModule, status: string, quem: string): boolean {
  const f = mod.isTerminalAiJobStatus;
  if (typeof f !== 'function') throw new Error(`${quem}: não exporta isTerminalAiJobStatus`);
  return f(status);
}

/* ---------------------------------------------------------------------------------------- */
/* Leitura do banco (SQL) como TEXTO, com comentários fora antes de qualquer varredura         */
/* ---------------------------------------------------------------------------------------- */

let migrationCache: string | null = null;
function migrationRaw(): string {
  if (migrationCache === null) {
    try {
      migrationCache = readFileSync(ARQ_MIGRATION, 'utf8');
    } catch (erro) {
      throw new Error(
        `migration da IA-045/IA-046 não legível em ${ARQ_MIGRATION}: ${
          erro instanceof Error ? erro.message : String(erro)
        }`,
      );
    }
  }
  return migrationCache;
}

/** Remove comentários de linha `-- …` — um valor que só existe em comentário não conta. */
const stripSqlComments = (sql: string) => sql.replace(/--[^\n]*/g, '');

function matchingParen(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === '(') depth += 1;
    else if (c === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Corpo entre parênteses do `create table public.<tabela> (...)`. */
function createTableBody(sqlSemComentario: string, tabela: string): string {
  const re = new RegExp(
    `create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?${tabela}\\s*\\(`,
    'i',
  );
  const m = re.exec(sqlSemComentario);
  if (!m) throw new Error(`create table public.${tabela} não encontrado na migration`);
  const open = sqlSemComentario.indexOf('(', m.index);
  const close = matchingParen(sqlSemComentario, open);
  if (close < 0) throw new Error(`create table public.${tabela} sem ')' de fechamento`);
  return sqlSemComentario.slice(open + 1, close);
}

/** Literais entre aspas de todo `check (…)` que menciona `status`, no corpo da tabela e em ALTERs. */
function statusCheckLiterals(sqlSemComentario: string): string[] {
  const corpo = createTableBody(sqlSemComentario, 'ai_jobs');
  const alters = Array.from(
    sqlSemComentario.matchAll(/alter\s+table\s+(?:public\.)?ai_jobs[\s\S]*?;/gi),
  )
    .map((m) => m[0])
    .join('\n');
  const literais: string[] = [];
  for (const regiao of [corpo, alters]) {
    const re = /check\s*\(/gi;
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(regiao))) {
      const open = regiao.indexOf('(', mm.index);
      const close = matchingParen(regiao, open);
      if (close < 0) continue;
      const expr = regiao.slice(open + 1, close);
      if (!/\bstatus\b/i.test(expr)) continue;
      for (const lit of Array.from(expr.matchAll(/'([^']*)'/g))) literais.push(lit[1]);
    }
  }
  return literais;
}

/** Corpo de uma função PL/pgSQL/SQL entre as marcas de dollar-quote (`$$` ou `$tag$`). */
function functionBody(sqlSemComentario: string, nome: string): string {
  const re = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?${nome}\\s*\\(`,
    'i',
  );
  const m = re.exec(sqlSemComentario);
  if (!m) throw new Error(`função public.${nome} não encontrada na migration`);
  const resto = sqlSemComentario.slice(m.index);
  const asMatch = /as\s+(\$[A-Za-z_]*\$)/i.exec(resto);
  if (!asMatch) throw new Error(`public.${nome} sem dollar-quote ('as $$ … $$')`);
  const tag = asMatch[1];
  const inicio = asMatch.index + asMatch[0].length;
  const fim = resto.indexOf(tag, inicio);
  return fim < 0 ? resto.slice(inicio) : resto.slice(inicio, fim);
}

let edgeSourceCache: string | null = null;
function edgeSource(): string {
  if (edgeSourceCache === null) {
    try {
      edgeSourceCache = readFileSync(ARQ_EDGE, 'utf8');
    } catch (erro) {
      throw new Error(
        `_shared/ai-jobs.ts não legível (IA-045): ${erro instanceof Error ? erro.message : String(erro)}`,
      );
    }
  }
  return edgeSourceCache;
}

/* ---------------------------------------------------------------------------------------- */
/* Ciclo de vida                                                                              */
/* ---------------------------------------------------------------------------------------- */

beforeEach(() => {
  H.calls.length = 0;
  H.fromCalls.length = 0;
  H.state.rpcResult = { data: null, error: null };
  H.state.fromResult = { data: null, error: null };
  stubDeno(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/* ========================================================================================== */
/* (1) Vocabulário congelado — os 7 estados nos TRÊS artefatos                                 */
/* ========================================================================================== */

describe('(1) vocabulário congelado: os 7 estados nos três artefatos (IA-046)', () => {
  it('worker `_shared/ai-jobs.ts`: AI_JOB_STATUSES é exatamente os 7 congelados', async () => {
    const mod = await workerMod();
    expect(statusesOf(mod, 'worker')).toEqual([...FROZEN_STATUSES]);
  });

  it('interface `src/lib/aiJobs/status.ts`: AI_JOB_STATUSES é exatamente os 7 congelados', async () => {
    const mod = await frontMod();
    expect(statusesOf(mod, 'interface')).toEqual([...FROZEN_STATUSES]);
  });

  it('banco: o check de ai_jobs.status contém exatamente os 7 congelados (e nada mais)', () => {
    const literais = statusCheckLiterals(stripSqlComments(migrationRaw()));
    expect(
      sortStrings(literais),
      `o check de ai_jobs.status precisa listar os 7 e só os 7 (achei: ${JSON.stringify(literais)})`,
    ).toEqual(sortStrings(FROZEN_STATUSES));
  });

  it('o espelho da interface e o worker apresentam o MESMO vocabulário (mutação c)', async () => {
    const front = statusesOf(await frontMod(), 'interface');
    const worker = statusesOf(await workerMod(), 'worker');
    expect(sortStrings(front)).toEqual(sortStrings(worker));
    expect(front).toEqual([...FROZEN_STATUSES]);
  });
});

/* ========================================================================================== */
/* (2) Terminalidade idêntica                                                                  */
/* ========================================================================================== */

describe('(2) terminalidade: terminais idênticos entre interface e worker (IA-046)', () => {
  it('worker: AI_JOB_TERMINAL_STATUSES é exatamente os 4 terminais', async () => {
    const mod = await workerMod();
    expect(sortStrings(terminalsOf(mod, 'worker'))).toEqual(sortStrings(FROZEN_TERMINALS));
  });

  it('interface: AI_JOB_TERMINAL_STATUSES é exatamente os 4 terminais', async () => {
    const mod = await frontMod();
    expect(sortStrings(terminalsOf(mod, 'interface'))).toEqual(sortStrings(FROZEN_TERMINALS));
  });

  it('interface × worker: o conjunto de terminais é o MESMO', async () => {
    const front = terminalsOf(await frontMod(), 'interface');
    const worker = terminalsOf(await workerMod(), 'worker');
    expect(sortStrings(front)).toEqual(sortStrings(worker));
  });

  it('a partição terminal × não-terminal cobre os 7 sem sobreposição (worker)', async () => {
    const mod = await workerMod();
    const statuses = statusesOf(mod, 'worker');
    const terminais = terminalsOf(mod, 'worker');
    const naoTerminais = statuses.filter((s) => !terminais.includes(s));
    expect(sortStrings(naoTerminais)).toEqual(sortStrings(FROZEN_NON_TERMINALS));
    expect(terminais.filter((s) => naoTerminais.includes(s))).toEqual([]);
  });

  it('isTerminalAiJobStatus concorda com a lista em TODOS os 7 (worker)', async () => {
    const mod = await workerMod();
    for (const s of FROZEN_STATUSES) {
      const esperado = (FROZEN_TERMINALS as readonly string[]).includes(s);
      expect(isTerminal(mod, s, 'worker'), `worker: isTerminal('${s}')`).toBe(esperado);
    }
  });

  it('isTerminalAiJobStatus concorda com a lista em TODOS os 7 (interface)', async () => {
    const mod = await frontMod();
    for (const s of FROZEN_STATUSES) {
      const esperado = (FROZEN_TERMINALS as readonly string[]).includes(s);
      expect(isTerminal(mod, s, 'interface'), `interface: isTerminal('${s}')`).toBe(esperado);
    }
  });
});

/* ========================================================================================== */
/* (3) `partial` NÃO é concluído                                                               */
/* ========================================================================================== */

describe('(3) parcial NÃO é concluído (IA-046)', () => {
  it('worker: `partial` NÃO é terminal', async () => {
    const mod = await workerMod();
    expect(isTerminal(mod, 'partial', 'worker')).toBe(false);
  });

  it('worker: `partial` transiciona para succeeded (e pode voltar a running)', async () => {
    const mod = await workerMod();
    expect(canTransition(mod, 'partial', 'succeeded', 'worker')).toBe(true);
    expect(canTransition(mod, 'partial', 'running', 'worker')).toBe(true);
    expect(canTransition(mod, 'partial', 'failed', 'worker')).toBe(true);
    expect(canTransition(mod, 'partial', 'cancelled', 'worker')).toBe(true);
    expect(canTransition(mod, 'partial', 'outcome_unknown', 'worker')).toBe(true);
  });

  it('interface: `partial` NÃO é terminal e transiciona para succeeded', async () => {
    const mod = await frontMod();
    expect(isTerminal(mod, 'partial', 'interface')).toBe(false);
    expect(canTransition(mod, 'partial', 'succeeded', 'interface')).toBe(true);
  });
});

/* ========================================================================================== */
/* (4) Grafo de transições                                                                     */
/* ========================================================================================== */

describe('(4) grafo de transições congelado e idêntico entre as pontas (IA-046)', () => {
  it('worker: cada estado tem EXATAMENTE os destinos do contrato', async () => {
    const mod = await workerMod();
    const statuses = statusesOf(mod, 'worker');
    for (const from of FROZEN_STATUSES) {
      const reais = statuses.filter((to) => canTransition(mod, from, to, 'worker'));
      expect(sortStrings(reais), `worker: destinos de '${from}'`).toEqual(
        sortStrings(FROZEN_TRANSITIONS[from]),
      );
    }
  });

  it('interface: cada estado tem EXATAMENTE os destinos do contrato', async () => {
    const mod = await frontMod();
    const statuses = statusesOf(mod, 'interface');
    for (const from of FROZEN_STATUSES) {
      const reais = statuses.filter((to) => canTransition(mod, from, to, 'interface'));
      expect(sortStrings(reais), `interface: destinos de '${from}'`).toEqual(
        sortStrings(FROZEN_TRANSITIONS[from]),
      );
    }
  });

  it('interface × worker: as duas pontas concordam em TODOS os 49 pares (from × to)', async () => {
    const front = await frontMod();
    const worker = await workerMod();
    const divergencias: string[] = [];
    for (const from of FROZEN_STATUSES) {
      for (const to of FROZEN_STATUSES) {
        const w = canTransition(worker, from, to, 'worker');
        const f = canTransition(front, from, to, 'interface');
        if (w !== f) divergencias.push(`${from}→${to}: worker=${w} interface=${f}`);
      }
    }
    expect(divergencias, 'interface e worker discordam do grafo de transições').toEqual([]);
  });

  it('todo estado TERMINAL não transiciona para NADA (worker, 4×7)', async () => {
    const mod = await workerMod();
    for (const from of FROZEN_TERMINALS) {
      for (const to of FROZEN_STATUSES) {
        expect(canTransition(mod, from, to, 'worker'), `worker: ${from}→${to} tinha de ser false`).toBe(
          false,
        );
      }
    }
  });

  it('todo estado TERMINAL não transiciona para NADA (interface, 4×7)', async () => {
    const mod = await frontMod();
    for (const from of FROZEN_TERMINALS) {
      for (const to of FROZEN_STATUSES) {
        expect(
          canTransition(mod, from, to, 'interface'),
          `interface: ${from}→${to} tinha de ser false`,
        ).toBe(false);
      }
    }
  });

  it('transições inválidas são false nas duas pontas (inclui queued→succeeded)', async () => {
    const worker = await workerMod();
    const front = await frontMod();
    for (const [from, to] of INVALIDAS) {
      expect(canTransition(worker, from, to, 'worker'), `worker: ${from}→${to}`).toBe(false);
      expect(canTransition(front, from, to, 'interface'), `interface: ${from}→${to}`).toBe(false);
    }
  });

  it('nenhum destino fora do vocabulário é aceito', async () => {
    const worker = await workerMod();
    const front = await frontMod();
    for (const from of FROZEN_STATUSES) {
      for (const inventado of ['done', 'pending', 'dead_letter', '', 'SUCCEEDED']) {
        expect(canTransition(worker, from, inventado, 'worker'), `worker: ${from}→${inventado}`).toBe(
          false,
        );
        expect(
          canTransition(front, from, inventado, 'interface'),
          `interface: ${from}→${inventado}`,
        ).toBe(false);
      }
    }
  });
});

/* ========================================================================================== */
/* (5) Consistência terminal ⇔ sem transição de saída                                          */
/* ========================================================================================== */

describe('(5) terminal ⇔ sem transição de saída (consistência interna)', () => {
  it('worker: é terminal se, e somente se, não tem nenhuma transição de saída', async () => {
    const mod = await workerMod();
    const statuses = statusesOf(mod, 'worker');
    const semSaida = statuses.filter((s) => !statuses.some((to) => canTransition(mod, s, to, 'worker')));
    expect(sortStrings(semSaida), 'conjunto dos estados sem saída tem de ser o dos terminais').toEqual(
      sortStrings(terminalsOf(mod, 'worker')),
    );
  });

  it('interface: é terminal se, e somente se, não tem nenhuma transição de saída', async () => {
    const mod = await frontMod();
    const statuses = statusesOf(mod, 'interface');
    const semSaida = statuses.filter((s) =>
      !statuses.some((to) => canTransition(mod, s, to, 'interface')),
    );
    expect(
      sortStrings(semSaida),
      'conjunto dos estados sem saída tem de ser o dos terminais',
    ).toEqual(sortStrings(terminalsOf(mod, 'interface')));
  });
});

/* ========================================================================================== */
/* (6) Rótulos pt-BR                                                                           */
/* ========================================================================================== */

describe('(6) rótulos pt-BR: todo estado tem rótulo e parcial não afirma conclusão (IA-046)', () => {
  const PALAVRA_DE_CONCLUSAO = /\b(conclu\w*|sucesso|finaliz\w*|finalizad\w*|pronto|complet\w*|done|ok)\b/i;

  it('AI_JOB_STATUS_LABELS cobre exatamente os 7 estados, com texto não vazio', async () => {
    const mod = await frontMod();
    const labels = mod.AI_JOB_STATUS_LABELS;
    if (!labels || typeof labels !== 'object') {
      throw new Error('interface: não exporta AI_JOB_STATUS_LABELS');
    }
    expect(sortStrings(Object.keys(labels))).toEqual(sortStrings(FROZEN_STATUSES));
    for (const s of FROZEN_STATUSES) {
      const rotulo = labels[s];
      expect(typeof rotulo, `rótulo de '${s}'`).toBe('string');
      expect(rotulo.trim().length, `rótulo de '${s}' não pode ser vazio`).toBeGreaterThan(0);
      expect(rotulo, `rótulo de '${s}' tem de ser humano, não o token cru`).not.toBe(s);
    }
  });

  it('o rótulo de `partial` NÃO afirma conclusão — e o de `succeeded` afirma (controle)', async () => {
    const mod = await frontMod();
    const labels = mod.AI_JOB_STATUS_LABELS;
    if (!labels || typeof labels !== 'object') {
      throw new Error('interface: não exporta AI_JOB_STATUS_LABELS');
    }
    const parcial = labels.partial ?? '';
    const sucesso = labels.succeeded ?? '';

    expect(
      PALAVRA_DE_CONCLUSAO.test(parcial),
      `o rótulo de parcial ('${parcial}') não pode ser lido como concluído`,
    ).toBe(false);
    expect(parcial, `o rótulo de parcial ('${parcial}') precisa dizer que ainda está em andamento`).toMatch(
      /(parcial|andamento|progresso|incomplet|processando)/i,
    );
    // Controle: a mesma regra reconhece um rótulo de conclusão de verdade.
    expect(
      PALAVRA_DE_CONCLUSAO.test(sucesso),
      `o rótulo de succeeded ('${sucesso}') deveria afirmar conclusão`,
    ).toBe(true);
  });

  it('se o worker também expõe rótulos, são os mesmos da interface', async () => {
    const front = (await frontMod()).AI_JOB_STATUS_LABELS;
    const worker = (await workerMod()).AI_JOB_STATUS_LABELS;
    if (!worker) return; // rótulos não são exigidos do worker — só se existirem, têm de bater.
    expect(worker).toEqual(front);
  });
});

/* ========================================================================================== */
/* (7) Durabilidade no banco (IA-045)                                                          */
/* ========================================================================================== */

describe('(7) fila durável no banco: idempotência, lease, heartbeat, expiração e rollback (IA-045)', () => {
  const seisFuncoes = [
    'enqueue_ai_job',
    'claim_ai_jobs',
    'heartbeat_ai_job',
    'finish_ai_job',
    'reap_ai_jobs',
    'cancel_ai_job',
  ] as const;

  it('as SEIS funções do ciclo de vida existem', () => {
    const sql = stripSqlComments(migrationRaw());
    for (const nome of seisFuncoes) {
      const re = new RegExp(
        `create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?${nome}\\s*\\(`,
        'i',
      );
      expect(re.test(sql), `função public.${nome} ausente na migration`).toBe(true);
    }
  });

  it('`claim_ai_jobs` usa FOR UPDATE SKIP LOCKED (claim concorrente sem corrida)', () => {
    const corpo = functionBody(stripSqlComments(migrationRaw()), 'claim_ai_jobs');
    expect(
      corpo,
      'claim_ai_jobs precisa reivindicar com FOR UPDATE SKIP LOCKED',
    ).toMatch(/for\s+update\s+skip\s+locked/i);
  });

  it('`idempotency_key` é UNIQUE (repetir o pedido não duplica job)', () => {
    const sql = stripSqlComments(migrationRaw());
    const corpo = createTableBody(sql, 'ai_jobs');
    const inline = /\bidempotency_key\b[^,;\n]*\bunique\b/i.test(corpo);
    const constraint = /unique\s*\([^)]*\bidempotency_key\b[^)]*\)/i.test(sql);
    const indice = /create\s+unique\s+index[\s\S]*?\bidempotency_key\b/i.test(sql);
    expect(
      inline || constraint || indice,
      'idempotency_key precisa de UNIQUE (coluna, constraint ou índice único)',
    ).toBe(true);
  });

  it('há lease/heartbeat: colunas lease_token, lease_expires_at e heartbeat_at', () => {
    const corpo = createTableBody(stripSqlComments(migrationRaw()), 'ai_jobs');
    for (const coluna of ['lease_token', 'lease_expires_at', 'heartbeat_at']) {
      expect(new RegExp(`\\b${coluna}\\b`, 'i').test(corpo), `coluna '${coluna}' ausente em ai_jobs`).toBe(
        true,
      );
    }
  });

  it('há expiração: coluna expires_at', () => {
    const corpo = createTableBody(stripSqlComments(migrationRaw()), 'ai_jobs');
    expect(/\bexpires_at\b/i.test(corpo), "coluna 'expires_at' ausente em ai_jobs").toBe(true);
  });

  it('a linha `-- rollback:` existe e cita drops (o desfazer da migration)', () => {
    const linhas = migrationRaw()
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^--\s*rollback:/i.test(l));
    expect(linhas.length, 'a migration precisa da linha `-- rollback:`').toBeGreaterThan(0);
    const rollback = linhas.join('\n');
    expect(/\bdrop\b/i.test(rollback), `o rollback precisa citar drops (linha: ${rollback})`).toBe(true);
    expect(/ai_jobs/i.test(rollback), 'o rollback precisa desfazer os objetos de ai_jobs').toBe(true);
  });
});

/* ========================================================================================== */
/* (8) O worker fala com as RPCs do contrato                                                   */
/* ========================================================================================== */

describe('(8) o worker referencia as seis RPCs do contrato do banco (IA-045)', () => {
  it('`_shared/ai-jobs.ts` cita enqueue_ai_job, claim_ai_jobs, heartbeat_ai_job, finish_ai_job, reap_ai_jobs, cancel_ai_job', () => {
    const fonte = edgeSource();
    for (const rpc of [
      'enqueue_ai_job',
      'claim_ai_jobs',
      'heartbeat_ai_job',
      'finish_ai_job',
      'reap_ai_jobs',
      'cancel_ai_job',
    ]) {
      expect(fonte, `a RPC ${rpc} precisa ser usada pelo worker`).toContain(rpc);
    }
  });
});

/* ========================================================================================== */
/* (9) enqueueAiJob não falha aberto                                                           */
/* ========================================================================================== */

describe('(9) enqueueAiJob LANÇA em falha de infra — nunca falha aberto (IA-045)', () => {
  it('erro de infra na RPC → enqueueAiJob REJEITA depois de tocar a infra', async () => {
    const mod = await workerMod();
    if (typeof mod.enqueueAiJob !== 'function') {
      throw new Error('worker: não exporta enqueueAiJob');
    }

    const erro = { message: 'conexao recusada / banco fora' };
    H.state.rpcResult = { data: null, error: erro };
    H.state.fromResult = { data: null, error: erro };

    const payload = {
      idempotencyKey: 'op-enqueue-1',
      functionName: 'ai-contrato',
      userId: 'u-1',
      kind: 'long_analysis',
      payload: { qualquer: true },
      priority: 5,
      maxAttempts: 3,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    };

    // A assinatura exata do wrapper é do autor; exercitamos as formas plausíveis e
    // exigimos que ALGUMA delas (1) toque a infra e (2) rejeite com o erro.
    const formas: Array<() => Promise<unknown>> = [
      () => mod.enqueueAiJob!(payload),
      () => mod.enqueueAiJob!({ supabase: H.client, ...payload }),
      () => mod.enqueueAiJob!(H.client, payload),
    ];

    let rejeitou = false;
    let tocouInfra = false;
    let erroCapturado: unknown = null;
    for (const forma of formas) {
      H.calls.length = 0;
      H.fromCalls.length = 0;
      rejeitou = false;
      erroCapturado = null;
      try {
        await forma();
      } catch (e) {
        rejeitou = true;
        erroCapturado = e;
      }
      tocouInfra =
        H.calls.some((c) => c.fn === 'enqueue_ai_job') || H.fromCalls.includes('ai_jobs');
      if (tocouInfra) break; // decidiu com a infra na mão: o veredito abaixo é o que vale
    }

    expect(
      tocouInfra,
      'enqueueAiJob precisa consultar a infra (rpc enqueue_ai_job / from ai_jobs) antes de decidir',
    ).toBe(true);
    expect(
      rejeitou,
      `falha de infra tem de LANÇAR (não pode devolver sucesso). erro capturado: ${String(
        erroCapturado,
      )}`,
    ).toBe(true);
  });
});

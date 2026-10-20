/**
 * Contrato de IDEMPOTÊNCIA DE EFEITOS (IA-047) — Bloco 05 / PR-4.
 * Território: ESTE único arquivo (o ratchet `_adv_edge_legacy_producers.test.ts`
 * é de outro agente).
 *
 * O que fica provado aqui:
 *
 *   (1) BANCO — a migration `20261002411230_ia047_idempotencia_de_efeitos.sql`
 *       adiciona TRÊS colunas novas NULLABLE e TRÊS índices únicos PARCIAIS,
 *       cada um com o `where` que deixa as linhas legadas (chave nula) FORA do
 *       índice — não há colisão com dado antigo:
 *         · conversation_tasks (created_by, client_task_id)
 *             where client_task_id is not null and created_by is not null;
 *         · conversation_analyses (contact_id, request_key)
 *             where request_key is not null;
 *         · notifications (user_id, dedupe_key)
 *             where dedupe_key is not null.
 *       A migration é ADITIVA e idempotente (`if not exists`), traz a linha
 *       `-- rollback:` no cabeçalho e NÃO abre transação explícita.
 *
 *   (2) TAREFA — `useMyWorkItems` envia a chave `client_task_id` no INSERT e
 *       trata a violação de unicidade (23505) como "já criado" (idempotente),
 *       em vez de erro genérico. O Crm360Tab deriva a chave uma vez por ação
 *       de IA e a propaga.
 *
 *   (3) ENVIO DE TESTE — o `action:'test'` do `talkx-send` registra um claim
 *       durável (tabela `talkx_test_send_claims`, request_key UNIQUE) ANTES do
 *       POST ao provedor e resolve a repetição pelo claim, sem reenviar.
 *
 * PROVA POR MUTAÇÃO:
 *   (a) apagar a linha do índice único de tarefa  ⇒ o caso do índice falha;
 *   (b) remover `client_task_id` do INSERT do hook ⇒ o caso do hook falha;
 *   (c) remover o claim do `action:'test'`        ⇒ o caso do envio falha.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');

const ARQ_MIGRATION = resolve(
  ROOT,
  'supabase/migrations/20261002411230_ia047_idempotencia_de_efeitos.sql',
);
const ARQ_HOOK = resolve(ROOT, 'src/hooks/tasks/useMyWorkItems.ts');
const ARQ_CRM = resolve(ROOT, 'src/components/inbox/tabs/Crm360Tab.tsx');
const ARQ_EDGE = resolve(ROOT, 'supabase/functions/talkx-send/index.ts');

/** Leitura crua (mantém comentários — a linha `-- rollback:` é conferida no cru). */
function ler(caminho: string): string {
  try {
    return readFileSync(caminho, 'utf8');
  } catch (erro) {
    throw new Error(`${caminho} não legível: ${erro instanceof Error ? erro.message : String(erro)}`);
  }
}

const migrationRaw = () => ler(ARQ_MIGRATION);
/** Um valor citado SÓ em comentário não conta como implementação. */
const stripSqlComments = (sql: string) => sql.replace(/--[^\n]*/g, '');
const migration = () => stripSqlComments(migrationRaw());
/** Normaliza espaços para casar o DDL independente de indentação/quebra de linha. */
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/* ========================================================================================== */
/* (1) Banco — colunas novas, índices únicos parciais, aditivo e idempotente                   */
/* ========================================================================================== */

describe('(1) banco: três colunas novas NULLABLE (IA-047)', () => {
  const colunas: ReadonlyArray<{ tabela: string; coluna: string; tipo: string }> = [
    { tabela: 'conversation_tasks', coluna: 'client_task_id', tipo: 'uuid' },
    { tabela: 'conversation_analyses', coluna: 'request_key', tipo: 'text' },
    { tabela: 'notifications', coluna: 'dedupe_key', tipo: 'text' },
  ];

  for (const { tabela, coluna, tipo } of colunas) {
    it(`\`${tabela}.${coluna}\` é criada com \`add column if not exists\` (${tipo})`, () => {
      const re = new RegExp(
        `alter\\s+table\\s+(?:public\\.)?${tabela}\\s+add\\s+column\\s+if\\s+not\\s+exists\\s+${coluna}\\s+${tipo}\\b`,
        'i',
      );
      expect(
        re.test(norm(migration())),
        `a migration precisa de: alter table public.${tabela} add column if not exists ${coluna} ${tipo}`,
      ).toBe(true);
    });

    it(`\`${tabela}.${coluna}\` é NULLABLE (sem not null)`, () => {
      const re = new RegExp(
        `alter\\s+table\\s+(?:public\\.)?${tabela}\\s+add\\s+column\\s+if\\s+not\\s+exists\\s+${coluna}\\s+${tipo}\\b[^;]*;`,
        'i',
      );
      const stmt = re.exec(norm(migration()))?.[0] ?? '';
      expect(stmt, `não achei o ALTER TABLE de ${tabela}.${coluna}`).not.toBe('');
      expect(/\bnot\s+null\b/i.test(stmt), `a coluna nova ${tabela}.${coluna} não pode ser NOT NULL (histórico entra nulo)`).toBe(false);
    });
  }
});

describe('(2) banco: três índices únicos PARCIAIS com o where correto (IA-047)', () => {
  const indices: ReadonlyArray<{ nome: string; ddl: string; where: string }> = [
    {
      nome: 'ux_conversation_tasks_creator_client_key',
      ddl: 'create unique index if not exists ux_conversation_tasks_creator_client_key on public.conversation_tasks (created_by, client_task_id) where client_task_id is not null and created_by is not null',
      where: 'client_task_id is not null and created_by is not null',
    },
    {
      nome: 'ux_conversation_analyses_contact_request_key',
      ddl: 'create unique index if not exists ux_conversation_analyses_contact_request_key on public.conversation_analyses (contact_id, request_key) where request_key is not null',
      where: 'request_key is not null',
    },
    {
      nome: 'ux_notifications_user_dedupe_key',
      ddl: 'create unique index if not exists ux_notifications_user_dedupe_key on public.notifications (user_id, dedupe_key) where dedupe_key is not null',
      where: 'dedupe_key is not null',
    },
  ];

  for (const { nome, ddl, where } of indices) {
    it(`\`${nome}\` é UNIQUE + PARCIAL (where ${where})`, () => {
      const sql = norm(migration());
      expect(sql, `índice ausente: ${nome}`).toContain(ddl);
      // Redundante de propósito: o índice tem de ser ÚNICO e ter o `where` da
      // chave (a mutação "trocar por índice total" tem de falhar aqui).
      const semWhere = ddl.replace(/ where .*$/i, '');
      expect(sql.includes(semWhere), `o índice ${nome} precisa ser parcial (where …)`).toBe(true);
      expect(new RegExp(`${nome}[^;]*where\\s+${where.replace(/ /g, '\\s+')}`, 'i').test(sql), `where errado em ${nome}`).toBe(true);
    });
  }

  it('a migration NÃO cria índice único TOTAL sobre a coluna nova (risco de colisão com histórico)', () => {
    const sql = norm(migration());
    // Cada `create unique index ... client_task_id/request_key/dedupe_key` tem where.
    const criaUnicos = Array.from(sql.matchAll(/create\s+unique\s+index[^;]*;/gi)).map((m) => m[0]);
    expect(criaUnicos.length, 'esperava os 3 índices únicos').toBeGreaterThanOrEqual(3);
    for (const stmt of criaUnicos) {
      if (/(client_task_id|request_key|dedupe_key|request_key)/i.test(stmt)) {
        expect(/\bwhere\b/i.test(stmt), `índice único sem where (parcial): ${stmt.slice(0, 120)}`).toBe(true);
      }
    }
  });
});

describe('(3) banco: aditivo, idempotente, com rollback e sem transação explícita', () => {
  it('todos os CREATE usam `if not exists` (replay inofensivo)', () => {
    const sql = norm(migration());
    const creates = Array.from(sql.matchAll(/create\s+(?:unique\s+)?(?:table|index)\b[^;]*;/gi)).map((m) => m[0]);
    expect(creates.length).toBeGreaterThanOrEqual(4);
    for (const stmt of creates) {
      expect(/\bif\s+not\s+exists\b/i.test(stmt), `CREATE sem if not exists: ${stmt.slice(0, 120)}`).toBe(true);
    }
  });

  it('NÃO há DROP/TRUNCATE/RENAME de objeto vivo no corpo (só DDL aditivo)', () => {
    const sql = migration();
    expect(/\bdrop\s+(table|index|column|function|constraint|schema)\b/i.test(sql)).toBe(false);
    expect(/\btruncate\b/i.test(sql)).toBe(false);
    expect(/\brename\s+(to|column)\b/i.test(sql)).toBe(false);
  });

  it('a linha `-- rollback:` existe no CABEÇALHO, cita os drops e vem antes do 1º statement', () => {
    const raw = migrationRaw();
    const linhas = raw.split('\n');
    const idxRollback = linhas.findIndex((l) => /^--\s*rollback:/i.test(l));
    expect(idxRollback, 'a migration precisa da linha `-- rollback:`').toBeGreaterThanOrEqual(0);

    const primeiroStatement = linhas.findIndex((l) => {
      const t = l.trim().toLowerCase();
      return t !== '' && !t.startsWith('--');
    });
    expect(idxRollback, 'o `-- rollback:` precisa ficar no cabeçalho, antes do 1º statement').toBeLessThan(primeiroStatement);

    const rollback = linhas[idxRollback];
    expect(/\bdrop\b/i.test(rollback), `rollback precisa citar drops: ${rollback}`).toBe(true);
    expect(/ux_conversation_tasks_creator_client_key/i.test(rollback), 'rollback precisa desfazer o índice de tarefa').toBe(true);
    expect(/client_task_id/i.test(rollback), 'rollback precisa desfazer a coluna client_task_id').toBe(true);
  });

  it('não abre transação explícita (o gateway rejeita BEGIN/COMMIT)', () => {
    const raw = migrationRaw();
    expect(/^\s*begin\s*;/im.test(raw), 'BEGIN explícito não é permitido').toBe(false);
    expect(/^\s*commit\s*;/im.test(raw), 'COMMIT explícito não é permitido').toBe(false);
    expect(/^\s*rollback\s*;/im.test(raw), 'ROLLBACK explícito não é permitido').toBe(false);
  });
});

/* ========================================================================================== */
/* (4) Tarefa — o insert carrega a chave e 23505 é "já criado"                                 */
/* ========================================================================================== */

describe('(4) tarefa: insert envia a chave idempotente e trata 23505 (IA-047)', () => {
  const hook = () => ler(ARQ_HOOK);

  it('`WorkItemInput` expõe `clientTaskId`', () => {
    expect(hook()).toMatch(/clientTaskId\?\s*:/);
  });

  it('o INSERT de conversation_tasks manda `client_task_id`', () => {
    const src = hook();
    expect(
      /client_task_id\s*:\s*clientTaskId/.test(src),
      'o insert precisa enviar client_task_id: clientTaskId',
    ).toBe(true);
    // A chave é resolvida a partir da entrada (ou gerada) ANTES do insert.
    expect(src).toMatch(/input\.clientTaskId\s*\?\?\s*generateClientTaskId\(\)/);
  });

  it('o erro de unicidade (23505) é tratado como idempotente, não como erro genérico', () => {
    const src = hook();
    expect(src).toMatch(/code\s*===\s*['"]23505['"]/);
  });

  it('há dedupe do duplo submit pela mesma chave (uma promise por clientTaskId)', () => {
    const src = hook();
    expect(src).toMatch(/inFlightCreates/);
    expect(src).toMatch(/clientTaskId\s*\?\?\s*null/);
  });
});

describe('(5) tarefa: o Crm360Tab deriva a chave uma vez por ação de IA e a propaga', () => {
  const crm = () => ler(ARQ_CRM);

  it('a chave é derivada por assinatura da ação (memória de módulo), não a cada render', () => {
    const src = crm();
    expect(src).toMatch(/nextActionTaskKeyFor\s*\(/);
    expect(src).toMatch(/nextActionTaskKeys\s*=\s*new Map/);
    expect(src).toMatch(/crypto\.randomUUID\(\)/);
  });

  it('o clique em "Criar tarefa" propaga `clientTaskId`', () => {
    expect(crm()).toMatch(/clientTaskId\s*:\s*nextActionTaskKey/);
  });
});

/* ========================================================================================== */
/* (6) Envio de teste — claim durável antes do POST ao provedor                                */
/* ========================================================================================== */

describe('(6) envio de teste: claim durável impede o segundo POST (IA-047)', () => {
  const edge = () => ler(ARQ_EDGE);

  it('a migration cria a tabela de claim com `request_key` UNIQUE', () => {
    const sql = norm(migration());
    expect(sql).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.talkx_test_send_claims/i);
    expect(sql).toMatch(/request_key\s+text\s+not\s+null\s+unique/i);
  });

  it('o `action:\'test\'` registra o claim na tabela ANTES de chamar o provedor', () => {
    const src = edge();
    const posClaim = src.indexOf('talkx_test_send_claims');
    const posEvoFetch = src.indexOf('evoFetch('); // 1º uso é o do teste (o corpo do teste vem primeiro)
    expect(posClaim, 'o handler precisa tocar talkx_test_send_claims').toBeGreaterThanOrEqual(0);
    expect(
      posClaim < posEvoFetch,
      'o claim precisa ser registrado ANTES do POST ao provedor (evoFetch)',
    ).toBe(true);
    expect(src).toMatch(/\.from\(\s*["']talkx_test_send_claims["']\s*\)\s*\.insert\(/);
  });

  it('a repetição cai na UNIQUE (23505) e resolve pelo claim, sem reenviar', () => {
    const src = edge();
    expect(src).toMatch(/code\s*===\s*["']23505["']/);
    expect(src).toMatch(/provider_message_id/);
    expect(src).toMatch(/idempotent:\s*true/);
  });

  it('há uma chave estável derivada do pedido quando o cliente não manda uma', () => {
    const src = edge();
    expect(src).toMatch(/deriveTestSendKey/);
    expect(src).toMatch(/idempotencyKey/);
  });
});

/**
 * IA-058 — runtime de alertas de consumo anômalo: dedup de incidentes, bloqueio
 * por capacidade. Território: ESTE único arquivo.
 *
 * Prova REAL no banco local da tarefa (sem mock do comportamento de banco): o
 * teste fala SQL com o conjunto `zapp-db-local` (via `zapp-db-local psql`, ou
 * `psql $DATABASE_URL` como fallback) e comprova com dados sintéticos
 * `ia058t-*`:
 *
 *   - abaixo de min_sample => 0 incidente/0 notificação;
 *   - duas avaliações anômalas da mesma chave/janela => 1 incidente, 1 rodada de
 *     notificação (notification_count=1 e uma linha por usuário admin);
 *   - reconhecer e piorar => reabre e totaliza 2 rodadas; reconhecer sem piora
 *     NÃO reabre;
 *   - os três sinais (cost|errors|concurrency) e os três escopos
 *     (user|department|capability) disparam só pela configuração — o avaliador
 *     não tem limiar em código (mesmo dado, dois limiares => resultado muda);
 *   - o índice único (scope,target_id,signal,window_start) rejeita duplicata
 *     inclusive com duas sessões realmente concorrentes;
 *   - bloqueio de function_a => enforceAiGuards recusa explicitamente enquanto
 *     function_b segue; toda linha de bloqueio exige incident_id e só a
 *     retomada manual (ai_capability_resume) remove a recusa;
 *   - grants/RLS: mutação negada a anon e authenticated; funções negadas; a
 *     leitura operacional só existe para admin/supervisor;
 *   - a linha do job pg_cron existe em cron.job (o banco local roda com o
 *     agendador desligado — a prova é a DEFINIÇÃO, não a execução), o comando
 *     chama só o avaliador (nada de net.http/http externo) e a migration
 *     reaplica sem erro nem duplicar o job.
 *
 * O caminho do guard (TS) é exercido de verdade sob `bun test`: o módulo
 * `ai-guards.ts` é importado com `mock.module` do Bun na fronteira
 * `@supabase/supabase-js`, e a RPC `ai_capability_active_block` é respondida
 * pelo BANCO LOCAL real — a recusa sai do código de produção contra dado real.
 * Sob vitest esse bloco é pulado (o spec https://esm.sh não resolve em Node);
 * as asserções estáticas de ordem dentro de enforceAiGuards rodam nos dois.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';

const WS = resolve(__dirname, '..', '..');
const MIG_NAME = readdirSync(resolve(WS, 'supabase/migrations')).find((f) =>
  /_ia058_alertas_consumo_anomalo\.sql$/.test(f),
);
const MIG_SQL = MIG_NAME
  ? readFileSync(resolve(WS, 'supabase/migrations', MIG_NAME), 'utf8')
  : '';
const GUARDS_TS = readFileSync(
  resolve(WS, 'supabase/functions/_shared/ai-guards.ts'),
  'utf8',
);

const DB_NAME =
  process.env.IA058_DB_LOCAL ??
  (() => {
    try {
      return readFileSync(resolve(WS, '.hermes-tarefa'), 'utf8').match(
        /^DB_LOCAL=(\S+)$/m,
      )?.[1];
    } catch {
      return undefined;
    }
  })();

interface SqlResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function psql(input: string, args: string[] = [], timeout = 60_000): SqlResult {
  if (DB_NAME) {
    const r = spawnSync('zapp-db-local', ['psql', '.', DB_NAME, ...args], {
      input,
      cwd: WS,
      encoding: 'utf8',
      timeout,
    });
    return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  }
  const url = process.env.DATABASE_URL;
  if (!url) return { status: 127, stdout: '', stderr: 'sem banco local' };
  const r = spawnSync('psql', [url, ...args], {
    input,
    encoding: 'utf8',
    timeout,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** SQL que tem de passar; devolve a saída crua (tuples-only). */
const q = (input: string, args: string[] = []): string => {
  const r = psql(input, ['-v', 'ON_ERROR_STOP=1', '-At', ...args]);
  if (r.status !== 0) {
    throw new Error(`SQL falhou (${r.status}):\n${r.stderr}\n---\n${input.slice(0, 400)}`);
  }
  return r.stdout.trim();
};

const DB_OK = psql('select 1', ['-At']).status === 0;
const IS_BUN =
  typeof (globalThis as Record<string, unknown>).Bun !== 'undefined' ||
  Boolean((process.versions as Record<string, string>).bun);

/* ---- identidades sintéticas do teste (prefixo ia058t) --------------------- */
const U1 = '00000000-0000-4000-8000-000000580001'; // usuário com dept
const U2 = '00000000-0000-4000-8000-000000580002'; // usuário sem dept
const U_ADMIN_DUAL = '00000000-0000-4000-8000-000000580003'; // admin + supervisor
const DEPT = '00000000-0000-4000-8000-000000580020';
const MODELO = 'ia058t-modelo';
const FN_CUSTO = 'ia058t-fn-custo';
const FN_ERR = 'ia058t-fn-erros';
const FN_CONC = 'ia058t-fn-conc';
const FN_A = 'ia058t-fn-a';
const FN_B = 'ia058t-fn-b';
// Janela fechada avaliada: p_now=11:00 => balde [10:00, 11:00) de 04/10.
const P_NOW = '2026-10-04 11:00:00+00';
const WS_INI = '2026-10-04 10:00:00+00';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const notifCount = (incidentId: string): number =>
  Number(
    q(`select count(*) from public.notifications
        where type = 'ai_anomaly_alert' and metadata->>'incident_id' = '${incidentId}'`),
  );

const incident = (target: string, scope = 'capability'): Record<string, string> | null => {
  const out = q(
    `select id||'|'||status||'|'||detections||'|'||notification_count||'|'||coalesce(measured_value::text,'')||'|'||coalesce(max_value::text,'')
       from public.ai_anomaly_incidents
      where scope='${scope}' and target_id='${target}'`,
  );
  if (!out) return null;
  const [id, status, detections, notification_count, measured_value, max_value] = out.split('|');
  return { id, status, detections, notification_count, measured_value, max_value };
};

/* ------------------------------------------------------------------------- */
/* Parte estática: roda nos dois runners, mesmo sem banco                     */
/* ------------------------------------------------------------------------- */

describe('IA-058 — contrato estático da migration e do guard', () => {
  it('a migration existe, declara Rollback no topo e o nome é o do cartão', () => {
    expect(MIG_NAME).toBeDefined();
    expect(MIG_SQL.split('\n').slice(0, 5).join('\n')).toMatch(/--\s*Rollback:\s*\S/);
  });

  it('o guard consulta o bloqueio ANTES do contador compartilhado', () => {
    const corpo = GUARDS_TS.slice(GUARDS_TS.indexOf('export async function enforceAiGuards'));
    const posBloco = corpo.indexOf('ai_capability_active_block');
    const posContador = corpo.indexOf('checkSharedAiRateLimits');
    const posQuota = corpo.indexOf('ai_usage_logs');
    expect(posBloco).toBeGreaterThan(-1);
    expect(posContador).toBeGreaterThan(posBloco);
    expect(posQuota).toBeGreaterThan(posBloco);
    // recusa explícita com incidente e motivo; falha de infra é fail-open
    expect(corpo).toMatch(/incident_id/);
    expect(corpo).toMatch(/fail-open/);
    expect(corpo.slice(0, posContador)).toMatch(/503|429|403/);
  });

  it('o job do avaliador é SQL puro (sem HTTP externo)', () => {
    const m = MIG_SQL.match(/cron\.schedule\(\s*'([^']+)'[^)]*\)/s);
    expect(m).not.toBeNull();
    const comando = MIG_SQL.slice(m!.index!);
    expect(comando).toContain('ai_anomaly_evaluate');
    expect(comando).not.toMatch(/net\.http|http_post|https?:\/\//);
  });
});

/* ------------------------------------------------------------------------- */
/* Parte viva: banco local da tarefa                                          */
/* ------------------------------------------------------------------------- */

const suiteDb = DB_OK ? describe : describe.skip;
// cada chamada psql passa por docker exec (~0,4 s): os casos fazem várias,
// então o padrão de 5 s do runner não dá conta.
const itDb = (name: string, fn: () => unknown) => it(name, fn, 120_000);

suiteDb('IA-058 — runtime no banco local', () => {
  let ADMINS = 0;

  beforeAll(() => {
    // Limpeza namespace ia058t (ordem respeita FKs)
    q(`
      delete from public.notifications where type = 'ai_anomaly_alert';
      delete from public.ai_capability_blocks where function_name like 'ia058t-%';
      delete from public.ai_anomaly_incidents where target_id like 'ia058t-%' or target_id in ('${U1}','${U2}','${DEPT}');
      delete from public.ai_usage_logs where function_name like 'ia058t-%' or user_id in ('${U1}','${U2}');
      delete from public.edge_rate_limits where key like '%ia058t%';
      delete from public.ai_model_prices where model like 'ia058t-%';
      delete from public.profiles where user_id in ('${U1}','${U2}','${U_ADMIN_DUAL}');
      delete from public.departments where id = '${DEPT}';
      delete from auth.users where id in ('${U1}','${U2}','${U_ADMIN_DUAL}');
      -- cada caso liga só a combinação que prova (configs são persistidas:
      -- sem isto, o ajuste de um teste contamina a avaliação do seguinte)
      update public.ai_anomaly_configs set enabled = false;
    `);
    q(`
      insert into auth.users (id, email) values
        ('${U1}', 'ia058t-u1@local.test'),
        ('${U2}', 'ia058t-u2@local.test'),
        ('${U_ADMIN_DUAL}', 'ia058t-admin-dual@local.test');
      insert into public.user_roles (user_id, role) values
        ('${U_ADMIN_DUAL}', 'admin'),
        ('${U_ADMIN_DUAL}', 'supervisor');
      insert into public.departments (id, name, is_active, whatsapp_mode)
        values ('${DEPT}', 'ia058t-depto', true, 'none');
      -- o trigger de auth.users já cria o profile; só penduramos o depto
      update public.profiles set department_id = '${DEPT}', name = 'ia058t Perfil Depto'
        where user_id = '${U1}';
      insert into public.ai_model_prices (model, unit, unit_price, valid_from)
        values ('${MODELO}', 'token', 0.01, '2026-01-01');
    `);
    expect(
      q(`select count(*) from public.user_roles where user_id='${U_ADMIN_DUAL}'`),
    ).toBe('2');
    ADMINS = Number(
      q(`select count(distinct user_id) from public.user_roles where role = 'admin'`),
    );
    expect(ADMINS).toBeGreaterThan(0);
  }, 120_000); // cada psql passa por docker exec: sob carga, o padrão de 5 s do hook estoura

  itDb('estrutura aplicada: tabelas, índice de dedup e funções existem', () => {
    expect(q(`select to_regclass('public.ai_anomaly_configs') is not null`)).toBe('t');
    expect(q(`select to_regclass('public.ai_anomaly_incidents') is not null`)).toBe('t');
    expect(q(`select to_regclass('public.ai_capability_blocks') is not null`)).toBe('t');
    expect(
      q(`select count(*) from pg_indexes
          where schemaname='public' and tablename='ai_anomaly_incidents'
            and indexdef ilike '%unique%'
            and indexdef ilike '%scope%target_id%signal%window_start%'`),
    ).toBe('1');
    expect(q(`select to_regproc('public.ai_anomaly_evaluate') is not null`)).toBe('t');
    expect(q(`select to_regproc('public.ai_capability_active_block') is not null`)).toBe('t');
    expect(q(`select to_regproc('public.ai_capability_resume') is not null`)).toBe('t');
    // as 9 combinações configuráveis existem (3 escopos x 3 sinais)
    expect(
      q(`select count(*) from public.ai_anomaly_configs`),
    ).toBe('9');
    expect(
      q(`select count(*) from public.ai_anomaly_configs
          where scope in ('user','department','capability')
            and signal in ('cost','errors','concurrency')`),
    ).toBe('9');
  });

  itDb('migration é idempotente: reaplicar não dá erro nem duplica o job', () => {
    const r = psql(
      `BEGIN;\n${MIG_SQL}\nCOMMIT;`,
      ['-v', 'ON_ERROR_STOP=1', '-q'],
      120_000,
    );
    expect(r.status, r.stderr).toBe(0);
    expect(
      q(`select count(*) from cron.job where jobname='ia058-avaliador-anomalias'`),
    ).toBe('1');
  });

  itDb('job pg_cron definido: nome, agenda e comando que chama o avaliador', () => {
    const out = q(
      `select jobname||'|'||schedule||'|'||command from cron.job where jobname='ia058-avaliador-anomalias'`,
    );
    const [jobname, schedule, command] = out.split('|');
    expect(jobname).toBe('ia058-avaliador-anomalias');
    expect(schedule).toMatch(/\S+/);
    expect(command).toContain('ai_anomaly_evaluate');
    expect(command).not.toMatch(/net\.http|http_post|https?:\/\//);
    // sem nenhum segundo job chamando o avaliador
    expect(
      q(`select count(*) from cron.job where command ilike '%ai_anomaly_evaluate%'`),
    ).toBe('1');
  });

  itDb('abaixo de min_sample => 0 incidente e 0 notificação', () => {
    q(`update public.ai_anomaly_configs
          set window_seconds=3600, threshold=1, min_sample=10, enabled=true
        where scope='capability' and signal='cost'`);
    q(`insert into public.ai_usage_logs (user_id, function_name, model, input_tokens, output_tokens, status, created_at)
       select '${U1}','${FN_CUSTO}','${MODELO}',600,400,'success',('2026-10-04 10:0'||i||':00+00')::timestamptz
         from generate_series(1,3) i`);
    q(`select public.ai_anomaly_evaluate('${P_NOW}')`);
    expect(incident(FN_CUSTO)).toBeNull();
    expect(
      q(`select count(*) from public.notifications
          where type='ai_anomaly_alert'
            and (metadata->>'target_id' like 'ia058t-%'
                 or metadata->>'target_id' in ('${U1}','${U2}','${DEPT}'))`),
    ).toBe('0');
  });

  itDb('o limiar vem da configuração (sem valor-limite no avaliador)', () => {
    // mesma base de dados, limiar alto => sem incidente; limiar baixo => dispara
    q(`update public.ai_anomaly_configs set threshold=9999, min_sample=1
        where scope='capability' and signal='cost'`);
    q(`select public.ai_anomaly_evaluate('${P_NOW}')`);
    expect(incident(FN_CUSTO)).toBeNull();
    q(`update public.ai_anomaly_configs set threshold=1
        where scope='capability' and signal='cost'`);
    q(`select public.ai_anomaly_evaluate('${P_NOW}')`);
    const inc = incident(FN_CUSTO);
    expect(inc).not.toBeNull();
    expect(Number(inc!.measured_value)).toBe(30); // 3 logs x 1000 tokens x 0,01
    expect(inc!.status).toBe('open');
  });

  itDb('duas avaliações anômalas da mesma chave/janela => 1 incidente, 1 notificação', () => {
    const inc1 = incident(FN_CUSTO)!;
    q(`select public.ai_anomaly_evaluate('${P_NOW}')`);
    const inc2 = incident(FN_CUSTO)!;
    expect(inc2.id).toBe(inc1.id);
    expect(inc2.detections).toBe('2');
    expect(inc2.notification_count).toBe('1');
    expect(notifCount(inc1.id)).toBe(ADMINS); // 1 rodada, uma linha por admin
    expect(
      q(`select count(*) from public.notifications
          where type='ai_anomaly_alert'
            and metadata->>'incident_id'='${inc1.id}'
            and user_id='${U_ADMIN_DUAL}'`),
    ).toBe('1'); // mesmo com dois papéis, o usuário recebe uma única linha
    expect(q(`select count(*) from public.ai_anomaly_incidents where target_id='${FN_CUSTO}'`)).toBe('1');
  });

  itDb('reconhecer e piorar => reabre e totaliza 2 rodadas de notificação', () => {
    const inc = incident(FN_CUSTO)!;
    q(`update public.ai_anomaly_incidents set status='acknowledged', acknowledged_at=now() where id='${inc.id}'`);
    // sem piora: avaliação com o mesmo dado NÃO reabre
    q(`select public.ai_anomaly_evaluate('${P_NOW}')`);
    expect(incident(FN_CUSTO)!.status).toBe('acknowledged');
    expect(incident(FN_CUSTO)!.notification_count).toBe('1');
    // com piora mensurável (custo 30 -> 80): reabre e notifica de novo
    q(`insert into public.ai_usage_logs (user_id, function_name, model, input_tokens, output_tokens, status, created_at)
       select '${U1}','${FN_CUSTO}','${MODELO}',600,400,'success',('2026-10-04 10:3'||i||':00+00')::timestamptz
         from generate_series(1,5) i`);
    q(`select public.ai_anomaly_evaluate('${P_NOW}')`);
    const aberto = incident(FN_CUSTO)!;
    expect(aberto.status).toBe('open');
    expect(aberto.notification_count).toBe('2');
    expect(Number(aberto.max_value)).toBe(80);
    expect(notifCount(inc.id)).toBe(2 * ADMINS);
    // reconhecer de novo sem piora: fica reconhecido e calado
    q(`update public.ai_anomaly_incidents set status='acknowledged', acknowledged_at=now() where id='${inc.id}'`);
    q(`select public.ai_anomaly_evaluate('${P_NOW}')`);
    expect(incident(FN_CUSTO)!.status).toBe('acknowledged');
    expect(incident(FN_CUSTO)!.notification_count).toBe('2');
  });

  itDb('escopo user + sinal errors: taxa de erro com amostra dispara', () => {
    q(`update public.ai_anomaly_configs
          set window_seconds=3600, threshold=0.4, min_sample=5, enabled=true
        where scope='user' and signal='errors'`);
    // U2: 3 erros em 5 chamadas com desfecho (60% > 40%)
    q(`insert into public.ai_usage_logs (user_id, function_name, model, input_tokens, output_tokens, status, created_at)
       select '${U2}','${FN_ERR}','${MODELO}',10,10,s.st,('2026-10-04 10:1'||i||':00+00')::timestamptz
         from generate_series(1,5) i, lateral (select case when i<=3 then 'error' else 'success' end as st) s`);
    q(`select public.ai_anomaly_evaluate('${P_NOW}')`);
    const full = q(`select signal, measured_value, sample_size from public.ai_anomaly_incidents
                     where scope='user' and target_id='${U2}'`);
    expect(full).toContain('errors');
    expect(Number(full.split('|')[1])).toBeCloseTo(0.6, 5);
    expect(Number(full.split('|')[2])).toBe(5);
  });

  itDb('escopo department: o alvo agrega pelo departamento do perfil', () => {
    q(`update public.ai_anomaly_configs
          set window_seconds=3600, threshold=5, min_sample=1, enabled=true
        where scope='department' and signal='cost'`);
    q(`select public.ai_anomaly_evaluate('${P_NOW}')`);
    const inc = incident(DEPT, 'department');
    expect(inc).not.toBeNull();
    // os 8 logs de FN_CUSTO pertencem a U1, cujo perfil está no depto sintético
    expect(Number(inc!.measured_value)).toBe(80);
  });

  itDb('sinal concurrency: maior hits do balde de rate limit do alvo dispara', () => {
    q(`update public.ai_anomaly_configs
          set window_seconds=3600, threshold=50, min_sample=2, enabled=true
        where scope='capability' and signal='concurrency'`);
    q(`insert into public.edge_rate_limits (key, window_start, hits) values
        ('ai:user:${FN_CONC}:${U1}:2026-10-04T10:05:00.000Z','2026-10-04 10:05:00+00',80),
        ('ai:user:${FN_CONC}:${U1}:2026-10-04T10:10:00.000Z','2026-10-04 10:10:00+00',30)`);
    q(`select public.ai_anomaly_evaluate('${P_NOW}')`);
    const inc = incident(FN_CONC);
    expect(inc).not.toBeNull();
    expect(Number(inc!.measured_value)).toBe(80);
    const full = q(`select signal from public.ai_anomaly_incidents where target_id='${FN_CONC}'`);
    expect(full).toBe('concurrency');
  });

  itDb('o índice único rejeita duplicata — inclusive sob duas sessões concorrentes', async () => {
    const ins =
      `insert into public.ai_anomaly_incidents (scope,target_id,signal,window_start,window_seconds,measured_value,max_value,threshold,sample_size)` +
      ` values ('capability','${FN_CONC}','concurrency','${WS_INI}',3600,1,1,1,1)`;
    // sequencial: a segunda inserção direta falha
    const seq = psql(ins, ['-v', 'ON_ERROR_STOP=1', '-q']);
    expect(seq.status).not.toBe(0);
    expect(seq.stderr).toMatch(/duplicate key|duplicada/);
    // concorrente de verdade: A segura a linha não-commitada, B bloqueia no
    // índice e falha quando A comita
    const alvo2 =
      `insert into public.ai_anomaly_incidents (scope,target_id,signal,window_start,window_seconds,measured_value,max_value,threshold,sample_size)` +
      ` values ('capability','ia058t-fn-conc2','errors','${WS_INI}',3600,1,1,1,1)`;
    const a = DB_NAME
      ? spawn('zapp-db-local', ['psql', '.', DB_NAME], { cwd: WS })
      : spawn('psql', [process.env.DATABASE_URL!]);
    a.stdin.write(`begin;\n${alvo2};\nselect pg_sleep(2.5);\ncommit;\n`);
    a.stdin.end();
    await sleep(1500);
    const b = psql(alvo2, ['-v', 'ON_ERROR_STOP=1', '-q'], 30_000);
    await new Promise((res) => a.on('exit', res));
    expect(b.status).not.toBe(0);
    expect(b.stderr).toMatch(/duplicate key|duplicada/);
    // e ficou exatamente uma linha
    expect(
      q(`select count(*) from public.ai_anomaly_incidents
          where target_id='ia058t-fn-conc2'`),
    ).toBe('1');
  });

  itDb('bloqueio exige incident_id; guard recusa function_a e permite function_b', () => {
    const inc = incident(FN_CUSTO)!;
    // sem incidente: NOT NULL
    const semInc = psql(
      `insert into public.ai_capability_blocks (function_name, reason) values ('${FN_A}','x')`,
      ['-v', 'ON_ERROR_STOP=1', '-q'],
    );
    expect(semInc.status).not.toBe(0);
    // incidente inexistente: FK
    const incFalso = psql(
      `insert into public.ai_capability_blocks (function_name, incident_id, reason) values ('${FN_A}','00000000-0000-4000-8000-000000999999','x')`,
      ['-v', 'ON_ERROR_STOP=1', '-q'],
    );
    expect(incFalso.status).not.toBe(0);
    // bloqueio válido
    q(`insert into public.ai_capability_blocks (function_name, incident_id, reason, blocked_by)
        values ('${FN_A}','${inc.id}','custo anômalo IA-058','ia058t-teste')`);
    expect(q(`select count(*) from public.ai_capability_active_block('${FN_A}')`)).toBe('1');
    expect(q(`select count(*) from public.ai_capability_active_block('${FN_B}')`)).toBe('0');
    // segundo bloqueio ATIVO na mesma capacidade: índice parcial rejeita
    const dup = psql(
      `insert into public.ai_capability_blocks (function_name, incident_id, reason) values ('${FN_A}','${inc.id}','y')`,
      ['-v', 'ON_ERROR_STOP=1', '-q'],
    );
    expect(dup.status).not.toBe(0);
  });

  itDb('só a retomada manual remove a recusa da capacidade', () => {
    const inc = incident(FN_CUSTO)!;
    // sem retomada, a consulta continua devolvendo o bloqueio (nada expira sozinho)
    expect(q(`select count(*) from public.ai_capability_active_block('${FN_A}')`)).toBe('1');
    // retomada manual via RPC: encerra o bloqueio ativo
    expect(q(`select public.ai_capability_resume('${FN_A}','ia058t-operador')`)).toBe('1');
    expect(q(`select count(*) from public.ai_capability_active_block('${FN_A}')`)).toBe('0');
    // a linha fica como histórico com o incidente e quem retomou
    const hist = q(`select incident_id::text, resumed_by from public.ai_capability_blocks where function_name='${FN_A}'`);
    expect(hist).toContain(inc.id);
    expect(hist).toContain('ia058t-operador');
    // retomar de novo é no-op (0)
    expect(q(`select public.ai_capability_resume('${FN_A}','ia058t-operador')`)).toBe('0');
  });

  itDb('duas avaliações CONCORRENTES de incidente reconhecido e agravado: 1 reabertura, sem notificação dupla', async () => {
    const alvo = 'ia058t-race';
    // balde PRÓPRIO (14:00-15:00 de 04/10), fora dos demais casos: só o alvo sintético
    // entra como candidato, então os dois avaliadores disputam apenas a linha deste incidente
    const pRace = '2026-10-04 15:00:00+00';
    q(`update public.ai_anomaly_configs set enabled = false`);
    q(`update public.ai_anomaly_configs
          set enabled=true, window_seconds=3600, threshold=1, min_sample=1
        where scope='capability' and signal='cost'`);
    q(`
      delete from public.notifications where type='ai_anomaly_alert';
      delete from public.ai_anomaly_incidents where target_id='${alvo}';
      delete from public.ai_usage_logs where function_name='${alvo}';
      insert into public.ai_usage_logs (user_id, function_name, model, input_tokens, output_tokens, status, created_at)
        values ('${U1}','${alvo}','${MODELO}',600,400,'success','2026-10-04 14:05:00+00');
    `);
    q(`select public.ai_anomaly_evaluate('${pRace}')`);
    const inc = incident(alvo)!;
    expect(inc.status).toBe('open');
    expect(inc.notification_count).toBe('1');
    expect(notifCount(inc.id)).toBe(ADMINS);
    // reconhece e AGRAVA (custo medido 10 -> 60)
    q(`
      update public.ai_anomaly_incidents set status='acknowledged', acknowledged_at=now()
        where target_id='${alvo}';
      insert into public.ai_usage_logs (user_id, function_name, model, input_tokens, output_tokens, status, created_at)
        select '${U1}','${alvo}','${MODELO}',600,400,'success',('2026-10-04 14:1'||i||':00+00')::timestamptz
          from generate_series(1,5) i;
    `);
    // dois avaliadores REAIS em paralelo sobre o MESMO incidente reconhecido: A segura a linha
    // (select ... for update do avaliador) e dorme; B tenta entrar no meio e só segue depois do
    // commit de A. Sem serialização, os dois notificariam o mesmo agravamento.
    const abre = () => {
      const proc = DB_NAME
        ? spawn('zapp-db-local', ['psql', '.', DB_NAME], { cwd: WS })
        : spawn('psql', [process.env.DATABASE_URL!]);
      proc.stdin.write(`begin;\nselect public.ai_anomaly_evaluate('${pRace}');\n`);
      return proc;
    };
    // 'exit' já emitido não volta: esperar um processo que já saiu travaria o caso
    const saiu = (proc: ReturnType<typeof spawn>) =>
      proc.exitCode !== null || proc.signalCode !== null
        ? Promise.resolve()
        : new Promise((res) => proc.on('exit', res));
    const a = abre();
    a.stdin.write('select pg_sleep(3);\ncommit;\n');
    a.stdin.end();
    await sleep(1200);
    const b = abre();
    b.stdin.write('commit;\n');
    b.stdin.end();
    await saiu(a);
    await saiu(b);
    const depois = incident(alvo)!;
    expect(depois.status).toBe('open'); // reabriu: piora mensurável (60 > 10)
    expect(Number(depois.max_value)).toBe(60);
    expect(depois.notification_count).toBe('2'); // 1 rodada inicial + 1 da reabertura, nunca 3
    expect(notifCount(inc.id)).toBe(2 * ADMINS); // nenhuma rodada duplicada
  });

  itDb('grants/RLS fail-closed: mutação negada a anon e authenticated', () => {
    for (const role of ['anon', 'authenticated']) {
      const ins = psql(
        `set role ${role};
         insert into public.ai_anomaly_incidents (scope,target_id,signal,window_start,window_seconds,measured_value,max_value,threshold,sample_size)
         values ('capability','x','errors','${WS_INI}',3600,1,1,1,1)`,
        ['-v', 'ON_ERROR_STOP=1', '-q'],
      );
      expect(ins.status, `insert como ${role}`).not.toBe(0);
      const upd = psql(
        `set role ${role}; update public.ai_anomaly_configs set enabled=false`,
        ['-v', 'ON_ERROR_STOP=1', '-q'],
      );
      expect(upd.status, `update como ${role}`).not.toBe(0);
      const del = psql(
        `set role ${role}; delete from public.ai_capability_blocks`,
        ['-v', 'ON_ERROR_STOP=1', '-q'],
      );
      expect(del.status, `delete como ${role}`).not.toBe(0);
      const fn = psql(
        `set role ${role}; select public.ai_anomaly_evaluate()`,
        ['-v', 'ON_ERROR_STOP=1', '-q'],
      );
      expect(fn.status, `avaliador como ${role}`).not.toBe(0);
    }
    // leitura operacional só para admin/supervisor: authenticated comum lê 0 linhas
    const leitura = psql(
      `set role authenticated;
       set request.jwt.claim.sub = '${U2}';
       select count(*) from public.ai_anomaly_incidents where target_id='${FN_CUSTO}'`,
      ['-v', 'ON_ERROR_STOP=1', '-At'],
    );
    expect(leitura.status).toBe(0);
    expect(leitura.stdout.trim().split('\n').pop()).toBe('0');
  });
});

/* ------------------------------------------------------------------------- */
/* Guard de verdade: enforceAiGuards contra o banco local (só sob Bun)        */
/* ------------------------------------------------------------------------- */

const itBun = DB_OK && IS_BUN
  ? (name: string, fn: () => unknown) => it(name, fn, 120_000)
  : it.skip;

itBun(
  'enforceAiGuards recusa function_a bloqueada (403 + incidente) e permite function_b',
  async () => {
    const inc = incident(FN_CUSTO)!;
    q(`insert into public.ai_capability_blocks (function_name, incident_id, reason, blocked_by)
        values ('${FN_A}','${inc.id}','custo anômalo IA-058','ia058t-teste')
        on conflict do nothing`);
    const { mock } = await import('bun:test');
    mock.module('https://esm.sh/@supabase/supabase-js@2.87.1', () => ({
      createClient: () => ({
        rpc: async (fn: string, args: Record<string, unknown>) => {
          if (fn === 'ai_capability_active_block') {
            const name = String(args.p_function_name).replaceAll("'", "''");
            const out = psql(
              `select incident_id||'|'||reason||'|'||blocked_at from public.ai_capability_active_block('${name}')`,
              ['-At'],
            );
            const rows = out.stdout.trim()
              ? out.stdout.trim().split('\n').map((l) => {
                  const [incident_id, reason, blocked_at] = l.split('|');
                  return { incident_id, reason, blocked_at };
                })
              : [];
            return { data: rows, error: null };
          }
          if (fn === 'ai_rate_limit_hit') return { data: 1, error: null };
          return { data: null, error: null };
        },
        from: () => {
          const chain: Record<string, unknown> = {
            select: () => chain,
            eq: () => chain,
            limit: () => chain,
            gte: async () => ({ count: 0, error: null }),
            maybeSingle: async () => ({ data: null, error: null }),
            then: (resolve: (v: unknown) => unknown) =>
              resolve({ data: null, error: null }),
          };
          return chain;
        },
      }),
    }));
    (globalThis as Record<string, unknown>).Deno = {
      env: {
        get: (k: string) =>
          ({
            SUPABASE_URL: 'http://127.0.0.1:1',
            SUPABASE_SERVICE_ROLE_KEY: 'ia058t-local',
          })[k],
      },
    };
    const { enforceAiGuards } = await import(
      '../../supabase/functions/_shared/ai-guards.ts'
    );
    const req = new Request('https://local.test/functions/v1/ai', {
      method: 'POST',
      headers: { origin: 'http://localhost:5173' },
    });
    const resA = await enforceAiGuards({
      functionName: FN_A,
      userId: U2,
      perUserPerMinute: 10_000,
      req,
    });
    expect(resA, 'capacidade bloqueada tem de ser recusada').not.toBeNull();
    expect(resA!.status).toBe(403);
    const body = await resA!.text();
    expect(body).toContain(inc.id);
    expect(body).toContain('custo anômalo IA-058');
    const resB = await enforceAiGuards({
      functionName: FN_B,
      userId: U2,
      perUserPerMinute: 10_000,
      req,
    });
    expect(resB, 'capacidade livre segue atendendo').toBeNull();
    // retomada manual: a recusa some junto
    q(`select public.ai_capability_resume('${FN_A}','ia058t-operador')`);
    const resA2 = await enforceAiGuards({
      functionName: FN_A,
      userId: U2,
      perUserPerMinute: 10_000,
      req,
    });
    expect(resA2, 'após retomada manual a capacidade volta').toBeNull();
  },
);

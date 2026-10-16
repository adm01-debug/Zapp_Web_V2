import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Contrato da migration das RPCs do painel admin de cron jobs (paridade V3 -> V2, 11/10/2026).
// Trava o que o painel precisa e o que NAO pode afrouxar: SECURITY DEFINER + search_path fixo,
// guarda de admin dentro da funcao, allow-list fixa (que EXCLUI os jobs de manutencao e de
// limpeza), alter_job NO LUGAR (preserva jobid/historico), auditoria em public.audit_logs,
// ACL sem PUBLIC/anon/service_role, e os tipos gerados batendo com o retorno.

const RAIZ = process.cwd();
const DIR_MIGRACOES = join(RAIZ, 'supabase', 'migrations');
const ARQ_TIPOS = join(RAIZ, 'src', 'integrations', 'supabase', 'types.ts');

function lerMigration(): string {
  const nome = readdirSync(DIR_MIGRACOES).find((f) => f.includes('admin_cron_jobs') && f.endsWith('.sql'));
  if (!nome) throw new Error('migration admin_cron_jobs nao encontrada');
  return readFileSync(join(DIR_MIGRACOES, nome), 'utf8');
}

const sql = lerMigration();
const tipos = readFileSync(ARQ_TIPOS, 'utf8');

// Bloco do array da allow-list (o corpo da funcao admin_cron_jobs_permitidos).
function nomesDaAllowList(): string[] {
  const inicio = sql.indexOf('CREATE OR REPLACE FUNCTION public.admin_cron_jobs_permitidos()');
  if (inicio < 0) throw new Error('admin_cron_jobs_permitidos nao declarada');
  const bloco = sql.slice(inicio, sql.indexOf('$$;', inicio));
  return Array.from(bloco.matchAll(/'([a-z0-9-]+)'/g)).map((m) => m[1]);
}

describe('contrato admin_list_cron_jobs / admin_toggle_cron_job', () => {
  it('declara as duas RPCs e a fonte unica da allow-list', () => {
    expect(sql).toMatch(/create or replace function public\.admin_cron_jobs_permitidos\(\)/i);
    expect(sql).toMatch(/returns text\[\]/i);
    expect(sql).toMatch(/create or replace function public\.admin_list_cron_jobs\(\)/i);
    expect(sql).toMatch(
      /create or replace function public\.admin_toggle_cron_job\(\s*p_jobname\s+text,\s*p_ativo\s+boolean\s*\)/i,
    );
  });

  it('nasce SECURITY DEFINER com search_path fixo (pg_catalog, public, cron)', () => {
    const ddl = sql
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n');
    // as duas RPCs sao SECURITY DEFINER
    expect(ddl.match(/security definer/gi)?.length ?? 0).toBe(2);
    expect(ddl.match(/set search_path = pg_catalog, public, cron/gi)?.length ?? 0).toBe(2);
    // sem search_path mutavel por chamada
    expect(ddl).not.toMatch(/set search_path\s*=\s*'?\{/);
    expect(ddl).not.toMatch(/set search_path from current_user/i);
  });

  it('checa auth.uid() dentro da funcao e falha com 42501 (nao so confia na ACL)', () => {
    expect(sql.match(/if not public\.is_admin\(auth\.uid\(\)\) then/gi)?.length ?? 0).toBe(2);
    expect(sql.match(/errcode = '42501'/gi)?.length ?? 0).toBe(2);
  });

  it('a allow-list tem os jobs da aplicacao e NAO tem job de manutencao nem de limpeza', () => {
    const nomes = nomesDaAllowList().sort();
    expect(nomes).toEqual([
      'ai-jobs-tick-1min',
      'avatars-refresh',
      'connection-health-check',
      'expire-stale-agent-presence',
      'gmail-incremental-sync',
      'multiplix-send-trigger',
      'searchbox-budget-alert',
      'talkx-scheduler-1min',
      'tasks-notify-due',
    ]);
    // manutencao (VACUUM) e limpeza (cache/tabelas) ficam de fora de proposito
    for (const proibido of [
      'vacuum-contacts-daily',
      'vacuum-messages-post-expurgo',
      'cleanup-edge-rate-limits',
      'cleanup-link-preview-cache',
    ]) {
      expect(nomes).not.toContain(proibido);
    }
  });

  it('o toggle usa a MESMA allow-list (fonte unica) e recusa o que esta fora dela', () => {
    const inicio = sql.indexOf('CREATE OR REPLACE FUNCTION public.admin_toggle_cron_job');
    const corpo = sql.slice(inicio, sql.indexOf('$$;', inicio));
    expect(corpo).toMatch(/not \(p_jobname = any \(public\.admin_cron_jobs_permitidos\(\)\)\)/i);
    // job proibido nao aparece no codigo executavel do toggle (so na lista unica)
    expect(corpo).not.toMatch(/vacuum-|cleanup-/);
  });

  it('liga/desliga NO LUGAR (cron.alter_job) e nunca recria por unschedule/schedule', () => {
    const inicio = sql.indexOf('CREATE OR REPLACE FUNCTION public.admin_toggle_cron_job');
    const corpo = sql.slice(inicio, sql.indexOf('$$;', inicio));
    expect(corpo).toMatch(/cron\.alter_job\(job_id := v_jobid, active := p_ativo\)/i);
    expect(sql).not.toMatch(/cron\.unschedule/i);
    expect(sql).not.toMatch(/cron\.schedule\(/i);
  });

  it('audita o toggle em public.audit_logs na mesma transacao', () => {
    const inicio = sql.indexOf('CREATE OR REPLACE FUNCTION public.admin_toggle_cron_job');
    const corpo = sql.slice(inicio, sql.indexOf('$$;', inicio));
    expect(corpo).toMatch(/insert into public\.audit_logs/i);
    expect(corpo).toMatch(/'admin_cron_job_toggle'/);
    expect(corpo).toMatch(/'cron_job'/);
  });

  it('fecha PUBLIC/anon/service_role e so abre para authenticated', () => {
    expect(sql).toMatch(
      /revoke all on function public\.admin_cron_jobs_permitidos\(\)\s*from public, anon, authenticated, service_role;/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.admin_list_cron_jobs\(\)\s*from public, anon, service_role;/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.admin_toggle_cron_job\(text, boolean\)\s*from public, anon, service_role;/i,
    );
    expect(sql).toMatch(/grant execute on function public\.admin_list_cron_jobs\(\) to authenticated;/i);
    expect(sql).toMatch(
      /grant execute on function public\.admin_toggle_cron_job\(text, boolean\) to authenticated;/i,
    );
    // nunca concede a anon nem a public
    expect(sql).not.toMatch(/grant execute on function [^;]+ to [^;]*\banon\b/i);
    expect(sql).not.toMatch(/grant execute on function [^;]+ to [^;]*\bpublic\b/i);
  });

  it('os tipos gerados batem com os campos do retorno de admin_list_cron_jobs', () => {
    const inicio = sql.indexOf('CREATE OR REPLACE FUNCTION public.admin_list_cron_jobs');
    const retorno = sql
      .slice(inicio, sql.indexOf(') language', inicio))
      .match(/returns table \(([\s\S]*?)\)/i)![1]
      .split(',')
      .map((l) => l.trim().split(/\s+/)[0])
      .filter(Boolean)
      .sort();

    const bloco = tipos.slice(tipos.indexOf('admin_list_cron_jobs: {'), tipos.indexOf('admin_set_role: {'));
    const campos = Array.from(bloco.matchAll(/^\s{10}([a-z_]+):/gm)).map((m) => m[1]).sort();
    expect(campos).toEqual(retorno);

    expect(tipos).toMatch(/admin_cron_jobs_permitidos: \{ Args: never; Returns: string\[\] \}/);
    expect(tipos).toMatch(/admin_toggle_cron_job: \{\s*Args: \{ p_ativo: boolean; p_jobname: string \}/);
  });
});

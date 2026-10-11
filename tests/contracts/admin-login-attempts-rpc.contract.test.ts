import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Contrato da migration que cria as RPCs de leitura do painel admin de auth
// (paridade V3 -> V2, 11/10/2026). O teste trava o que o painel precisa e o que
// NAO pode afrouxar: SECURITY DEFINER + search_path fixo, guarda de autorizacao
// dentro da funcao, ACL sem PUBLIC/anon, e os tipos gerados batendo com o retorno.

const RAIZ = process.cwd();
const DIR_MIGRACOES = join(RAIZ, 'supabase', 'migrations');
const ARQ_TIPOS = join(RAIZ, 'src', 'integrations', 'supabase', 'types.ts');

function lerMigration(): string {
  const nome = readdirSync(DIR_MIGRACOES).find((f) => f.includes('admin_login_attempts_rpc') && f.endsWith('.sql'));
  if (!nome) throw new Error('migration admin_login_attempts_rpc nao encontrada');
  return readFileSync(join(DIR_MIGRACOES, nome), 'utf8');
}

const sql = lerMigration();
const tipos = readFileSync(ARQ_TIPOS, 'utf8');

describe('contrato admin_login_attempts / admin_blocked_accounts', () => {
  it('declara as duas RPCs com a assinatura que o painel chama', () => {
    expect(sql).toMatch(/create function public\.admin_login_attempts\(/);
    expect(sql).toMatch(/p_periodo\s+text\s+default '7d'/);
    expect(sql).toMatch(/p_email_like\s+text\s+default null/);
    expect(sql).toMatch(/p_so_falhas\s+boolean\s+default true/);
    expect(sql).toMatch(/p_pagina\s+integer\s+default 1/);
    expect(sql).toMatch(/create function public\.admin_blocked_accounts\(\)/);
  });

  it('nasce SECURITY DEFINER com search_path fixo (pg_catalog, public)', () => {
    // duas funcoes SECURITY DEFINER
    expect(sql.match(/security definer/g)?.length ?? 0).toBe(2);
    // duas ocorrencias do search_path fechado
    expect(sql.match(/set search_path = pg_catalog, public/g)?.length ?? 0).toBe(2);
    // sem search_path mutavel por chamada
    expect(sql).not.toMatch(/set search_path\s*=\s*'?\$?\{/);
    expect(sql).not.toMatch(/set search_path from current_user/i);
  });

  it('checa auth.uid() dentro da funcao e falha com 42501 (nao so confia na RLS)', () => {
    expect(sql.match(/if not public\.is_admin_or_supervisor\(auth\.uid\(\)\) then/g)?.length ?? 0).toBe(2);
    expect(sql.match(/errcode = '42501'/g)?.length ?? 0).toBe(2);
  });

  it('fecha PUBLIC/anon e so abre para authenticated', () => {
    expect(sql).toMatch(
      /revoke all on function public\.admin_login_attempts\(text, text, boolean, integer\) from public, anon;/,
    );
    expect(sql).toMatch(/revoke all on function public\.admin_blocked_accounts\(\) from public, anon;/);
    expect(sql).toMatch(
      /grant execute on function public\.admin_login_attempts\(text, text, boolean, integer\) to authenticated;/,
    );
    expect(sql).toMatch(/grant execute on function public\.admin_blocked_accounts\(\) to authenticated;/);
    // nunca concede a anon nem a public
    expect(sql).not.toMatch(/grant execute on function [^;]+ to [^;]*\banon\b/);
    expect(sql).not.toMatch(/grant execute on function [^;]+ to [^;]*\bpublic\b/);
  });

  it('nao expoe senha nem hash nem token no retorno', () => {
    const ddl = sql
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n');
    for (const coluna of ['password', 'hash', 'token', 'secret']) {
      expect(ddl).not.toMatch(new RegExp(String.raw`\b${coluna}\b`, 'i'));
    }
  });

  it('os tipos gerados batem com os campos do retorno das duas RPCs', () => {
    // campos de retorno declarados na migration
    const retornoLogin = sql
      .slice(sql.indexOf('create function public.admin_login_attempts'), sql.indexOf('$$;', sql.indexOf('create function public.admin_login_attempts')))
      .match(/returns table \(([\s\S]*?)\)\s*language/)![1]
      .split(',')
      .map((l) => l.trim().split(/\s+/)[0])
      .filter(Boolean)
      .sort();

    const blocoTipos = tipos.slice(tipos.indexOf('admin_login_attempts: {'), tipos.indexOf('ai_budget_reconcile:'));
    const camposTipos = Array.from(blocoTipos.matchAll(/^\s{10}([a-z_]+):/gm)).map((m) => m[1]).sort();

    expect(camposTipos).toEqual(retornoLogin);

    // Args opcionais dos 4 parametros com default
    expect(blocoTipos).toMatch(/p_email_like\?: string/);
    expect(blocoTipos).toMatch(/p_pagina\?: number/);
    expect(blocoTipos).toMatch(/p_periodo\?: string/);
    expect(blocoTipos).toMatch(/p_so_falhas\?: boolean/);

    // admin_blocked_accounts sem argumentos
    expect(tipos).toMatch(/admin_blocked_accounts: \{\s*Args: never/);
    expect(tipos).toMatch(/motivo: string/);
  });
});

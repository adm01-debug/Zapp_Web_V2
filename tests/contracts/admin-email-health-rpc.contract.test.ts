import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Contrato da migration que cria a RPC de saude das contas de e-mail do painel admin
// (paridade V3 -> V2, 11/10/2026). Trava o que o painel precisa e o que NAO pode
// afrouxar: SECURITY DEFINER + search_path fixo, guarda de autorizacao DENTRO da funcao
// (42501 para nao-admin), ACL sem PUBLIC/anon, ausencia de token no retorno e os tipos
// gerados batendo com o retorno declarado.

const RAIZ = process.cwd();
const DIR_MIGRACOES = join(RAIZ, 'supabase', 'migrations');
const ARQ_TIPOS = join(RAIZ, 'src', 'integrations', 'supabase', 'types.ts');

function lerMigration(): string {
  const nome = readdirSync(DIR_MIGRACOES).find(
    (f) => f.includes('admin_email_accounts_health') && f.endsWith('.sql'),
  );
  if (!nome) throw new Error('migration admin_email_accounts_health nao encontrada');
  return readFileSync(join(DIR_MIGRACOES, nome), 'utf8');
}

const sql = lerMigration();
const tipos = readFileSync(ARQ_TIPOS, 'utf8');
const semComentario = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

describe('contrato admin_email_accounts_health', () => {
  it('declara a RPC sem argumentos, com a assinatura que o painel chama', () => {
    expect(sql).toMatch(/create or replace function public\.admin_email_accounts_health\(\)/);
    expect(sql).toMatch(/returns table \(/);
    // nao ha overload com argumentos
    expect(sql.match(/create or replace function public\.admin_email_accounts_health\(\)/g)?.length ?? 0).toBe(1);
  });

  it('nasce SECURITY DEFINER com search_path fixo (pg_catalog, public)', () => {
    expect(sql).toMatch(/language plpgsql/);
    expect(sql).toMatch(/security definer/);
    expect(sql).toMatch(/set search_path = pg_catalog, public/);
    // sem search_path mutavel
    expect(sql).not.toMatch(/set search_path\s*=\s*'?\$?\{/);
    expect(sql).not.toMatch(/set search_path from current_user/i);
  });

  it('checa auth.uid() DENTRO da funcao e falha com 42501 (nao so confia na RLS)', () => {
    expect(sql).toMatch(/if not public\.is_admin\(auth\.uid\(\)\) then/);
    expect(sql).toMatch(/errcode = '42501'/);
    expect(sql).toMatch(/raise exception/i);
  });

  it('fecha PUBLIC/anon e so abre para authenticated', () => {
    expect(sql).toMatch(
      /revoke all on function public\.admin_email_accounts_health\(\) from public, anon;/,
    );
    expect(sql).toMatch(
      /grant execute on function public\.admin_email_accounts_health\(\) to authenticated;/,
    );
    // nunca concede a anon nem a public
    expect(sql).not.toMatch(/grant execute on function [^;]+ to [^;]*\banon\b/);
    expect(sql).not.toMatch(/grant execute on function [^;]+ to [^;]*\bpublic\b/);
  });

  it('nao devolve os tokens cifrados: so presenca (booleano) e validade', () => {
    // o retorno nao pode ter coluna com os bytes do token nem bytea
    const retorno = sql
      .slice(sql.indexOf('returns table ('), sql.indexOf('language plpgsql'))
      .toLowerCase();
    expect(retorno).not.toMatch(/encrypted/);
    expect(retorno).not.toMatch(/bytea/);
    expect(retorno).toMatch(/tem_access_token\s+boolean/);
    expect(retorno).toMatch(/tem_refresh_token\s+boolean/);
    expect(retorno).toMatch(/token_expires_at\s+timestamptz/);
    expect(retorno).toMatch(/token_status\s+text/);
    // e o DDL nao seleciona as colunas cifradas como saida
    expect(semComentario).not.toMatch(/bytea/i);
  });

  it('expoe os campos que o painel lista: conta, dono, sincronismo, falhas, validacao', () => {
    for (const coluna of [
      'conta',
      'dono_user_id',
      'dono_nome',
      'dono_email',
      'ultimo_sincronismo',
      'falhas_recentes',
      'em_falha',
      'ultima_validacao',
    ]) {
      expect(sql).toMatch(new RegExp(String.raw`\b${coluna}\b`));
    }
    // a validade do token e derivada; sem refresh_token sempre e sem_token, mesmo com access presente
    expect(sql).toMatch(/when g\.refresh_token_encrypted is null then 'sem_token'/);
    expect(sql).toMatch(/'expirado'/);
    expect(sql).toMatch(/'expirando'/);
    expect(sql).toMatch(/'valido'/);
  });

  it('os tipos gerados batem com os campos do retorno', () => {
    const retorno = sql
      .match(/returns table \(([\s\S]*?)\)\s*language plpgsql/)![1]
      .split(',')
      .map((l) => l.trim().split(/\s+/)[0])
      .filter(Boolean)
      .sort();

    const blocoTipos = tipos.slice(
      tipos.indexOf('admin_email_accounts_health: {'),
      tipos.indexOf('admin_set_role: {'),
    );
    const camposTipos = Array.from(blocoTipos.matchAll(/^\s{10}([a-z_]+):/gm))
      .map((m) => m[1])
      .sort();

    expect(camposTipos).toEqual(retorno);
    // sem argumentos
    expect(blocoTipos).toMatch(/Args: never/);
  });
});

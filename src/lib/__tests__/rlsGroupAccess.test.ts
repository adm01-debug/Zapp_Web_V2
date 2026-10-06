import { describe, it, expect } from 'vitest';
import {
  normSql,
  paridadeDeNomes,
  policiesOn,
  resolveEffectivePolicies,
  type EffectivePolicy,
} from './helpers/rlsSchema';

// ─── RLS REAL: whatsapp_groups e whatsapp_connections ───
// Este arquivo NAO define funcoes-espelho: ele resolve o estado efetivo das
// policies lendo supabase/migrations/*.sql em ordem cronologica (o helper
// aplica CREATE/DROP/ALTER, inclusive drops dinamicos via format()). Se uma
// migration futura enfraquecer um predicado, o teste fica vermelho.

const ESTADO = resolveEffectivePolicies();

/**
 * Paridade de nomes com o manifest do banco real. Tolerante quando existe
 * migration de policy POSTERIOR ao snapshot (o artefato e sincronizado pelo
 * `types-sync` depois do push): nesse caso exige que nada tenha sumido.
 */
function checaManifest(policies: EffectivePolicy[], tabela: string): void {
  const { estrito, manifest, resolvido } = paridadeDeNomes(policies, tabela);
  if (estrito) {
    expect(resolvido).toEqual(manifest);
    return;
  }
  for (const nome of manifest) {
    expect(resolvido, `policy do banco real ausente: ${nome}`).toContain(nome);
  }
}

/** Predicado que restringe a escrita conforme o comando da policy. */
function predicadoDeEscrita(p: EffectivePolicy): string {
  if (p.command === 'INSERT') return p.check ?? '';
  if (p.command === 'ALL') return `${p.using ?? ''} ${p.check ?? ''}`;
  return p.using ?? '';
}

/**
 * Predicado efetivo de escrita — no Postgres, predicado omitido vale `true`.
 * Devolve 'true' quando a policy nao restringe nada.
 */
function predicadoEfetivo(p: EffectivePolicy): { using: string; check: string } {
  const using = normSql(p.using) || 'true';
  const check = p.command === 'INSERT' ? normSql(p.check) || using : normSql(p.check) || 'true';
  return { using, check };
}

const ADMIN_OU_SUPERVISOR = /is_admin_or_supervisor\(\s*auth\.uid\(\)\s*\)/;

describe('RLS real: whatsapp_groups (schema resolvido das migrations)', () => {
  const policies = policiesOn(ESTADO, 'whatsapp_groups');

  it('o conjunto de policies bate com o manifest do schema real', () => {
    checaManifest(policies, 'whatsapp_groups');
  });

  it('SELECT e aberto a todo usuario autenticado', () => {
    const select = policies.filter((p) => p.command === 'SELECT');
    expect(select.length).toBeGreaterThan(0);
    for (const p of select) {
      expect(p.roles).toContain('authenticated');
      expect(normSql(p.using)).toBe('true');
    }
  });

  it('INSERT/UPDATE/DELETE exigem admin ou supervisor', () => {
    const escrita = policies.filter((p) => p.command !== 'SELECT');
    // Sem policy de escrita o teste passaria vazio — exige ao menos uma.
    expect(escrita.length).toBeGreaterThan(0);
    for (const p of escrita) {
      expect(p.roles).toContain('authenticated');
      expect(predicadoDeEscrita(p), `${p.name} (${p.command})`).toMatch(ADMIN_OU_SUPERVISOR);
    }
  });

  it('nenhuma policy de escrita e permissiva (USING/CHECK true)', () => {
    // Uma migration que crie write policy com USING(true)/CHECK(true) fica
    // vermelha aqui — era exatamente o que o espelho nao detectava.
    for (const p of policies.filter((p) => p.command !== 'SELECT')) {
      const { using, check } = predicadoEfetivo(p);
      // Semantica do Postgres: UPDATE/DELETE abrem quando USING e 'true';
      // INSERT quando o CHECK efetivo e 'true'; ALL precisa dos dois.
      const permissiva =
        p.command === 'ALL'
          ? using === 'true' && check === 'true'
          : p.command === 'INSERT'
            ? check === 'true'
            : using === 'true';
      expect(permissiva, `${p.name} permite escrita irrestrita`).toBe(false);
    }
  });
});

describe('RLS real: whatsapp_connections (schema resolvido das migrations)', () => {
  const policies = policiesOn(ESTADO, 'whatsapp_connections');

  it('o conjunto de policies bate com o manifest do schema real', () => {
    checaManifest(policies, 'whatsapp_connections');
  });

  it('SELECT e restrito a admin/supervisor — o espelho antigo dizia "todo autenticado"', () => {
    const select = policies.filter((p) => p.command === 'SELECT');
    expect(select.length).toBeGreaterThan(0);
    for (const p of select) {
      expect(p.roles).toContain('authenticated');
      // Prova de que o teste olha o schema real: a policy vigente NAO e
      // USING(true). O espelho removido afirmava canSelectConnections(true)
      // para qualquer autenticado — divergencia que so a fonte real expoe.
      expect(normSql(p.using), `${p.name} abriu SELECT para todos`).not.toBe('true');
      expect(p.using ?? '', p.name).toMatch(ADMIN_OU_SUPERVISOR);
    }
  });

  it('INSERT/UPDATE/DELETE exigem admin ou supervisor', () => {
    const escrita = policies.filter((p) => p.command !== 'SELECT');
    expect(escrita.length).toBeGreaterThanOrEqual(3);
    const comandos = escrita.map((p) => p.command).sort();
    for (const esperado of ['DELETE', 'INSERT', 'UPDATE']) {
      expect(comandos).toContain(esperado);
    }
    for (const p of escrita) {
      expect(p.roles).toContain('authenticated');
      expect(predicadoDeEscrita(p), `${p.name} (${p.command})`).toMatch(ADMIN_OU_SUPERVISOR);
    }
  });
});

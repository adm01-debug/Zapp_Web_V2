import { describe, it, expect } from 'vitest';
import {
  cobreComando,
  comandoProtegido,
  normSql,
  paridadeDeNomes,
  policiesOn,
  predicadoEfetivo,
  resolveEffectivePolicies,
  type ComandoRls,
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

const ADMIN_OU_SUPERVISOR = /is_admin_or_supervisor\(\s*auth\.uid\(\)\s*\)/;

/** Comandos de escrita — `FOR ALL` e avaliado contra cada um deles. */
const ESCRITA: ComandoRls[] = ['INSERT', 'UPDATE', 'DELETE'];

/** Comandos que a policy cobre de fato: o especifico ou os quatro do ALL. */
function comandosCobertos(p: EffectivePolicy): ComandoRls[] {
  return p.command === 'ALL' ? ['SELECT', ...ESCRITA] : [p.command];
}

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
    const escrita = policies.filter((p) => ESCRITA.some((c) => cobreComando(p, c)));
    // Sem policy de escrita o teste passaria vazio — exige ao menos uma.
    expect(escrita.length).toBeGreaterThan(0);
    for (const p of escrita) {
      expect(p.roles).toContain('authenticated');
      // Um FOR ALL e validado comando a comando: o papel administrativo no
      // WITH CHECK nao salva um USING permissivo (que abre UPDATE/DELETE).
      for (const comando of comandosCobertos(p).filter((c) => c !== 'SELECT')) {
        expect(predicadoEfetivo(p, comando), `${p.name} (${comando})`).toMatch(
          ADMIN_OU_SUPERVISOR,
        );
      }
    }
  });

  it('nenhuma policy de escrita e permissiva — USING(true) reprova mesmo com CHECK de admin', () => {
    // FOR ALL USING(true) WITH CHECK(is_admin...) abre SELECT, UPDATE e
    // DELETE pelo USING: o predicado efetivo de cada comando nao pode ser
    // 'true', nao importa o que o WITH CHECK diga.
    for (const p of policies.filter((p) => p.command !== 'SELECT')) {
      for (const comando of comandosCobertos(p).filter((c) => c !== 'SELECT')) {
        expect(
          predicadoEfetivo(p, comando),
          `${p.name} permite ${comando} irrestrito`,
        ).not.toBe('true');
      }
    }
  });
});

describe('RLS real: whatsapp_connections (schema resolvido das migrations)', () => {
  const policies = policiesOn(ESTADO, 'whatsapp_connections');

  it('o conjunto de policies bate com o manifest do schema real', () => {
    checaManifest(policies, 'whatsapp_connections');
  });

  it('SELECT e restrito a admin/supervisor — o espelho antigo dizia "todo autenticado"', () => {
    const select = policies.filter((p) => cobreComando(p, 'SELECT'));
    expect(select.length).toBeGreaterThan(0);
    for (const p of select) {
      expect(p.roles).toContain('authenticated');
      // Prova de que o teste olha o schema real: a policy vigente NAO e
      // USING(true). O espelho removido afirmava canSelectConnections(true)
      // para qualquer autenticado — divergencia que so a fonte real expoe.
      const predicado = predicadoEfetivo(p, 'SELECT');
      expect(predicado, `${p.name} abriu SELECT para todos`).not.toBe('true');
      expect(predicado, p.name).toMatch(ADMIN_OU_SUPERVISOR);
    }
  });

  it('INSERT/UPDATE/DELETE exigem admin ou supervisor', () => {
    // FOR ALL cobre os quatro comandos: cada comando de escrita precisa de
    // ao menos uma policy cobridora, toda ela com predicado de admin.
    for (const comando of ESCRITA) {
      expect(
        comandoProtegido(policies, comando, ADMIN_OU_SUPERVISOR),
        `${comando} sem cobertura admin/supervisor`,
      ).toBe(true);
    }
    const escrita = policies.filter((p) => ESCRITA.some((c) => cobreComando(p, c)));
    for (const p of escrita) {
      expect(p.roles).toContain('authenticated');
    }
  });
});

import { describe, expect, it } from 'vitest';
import {
  comandoProtegido,
  policiesOn,
  predicadoEfetivo,
  resolveEffectivePolicies,
} from '../../src/lib/__tests__/helpers/rlsSchema';

// CX0 (12/10/2026) · Z1 — CONTRATO: excluir conexão é admin-only no banco.
//
// O defeito real: a policy de DELETE de `whatsapp_connections` aceitava
// `is_admin_or_supervisor`, então um supervisor apagava a conexão pela tabela
// (e a Edge `evolution-api`, que fala com o banco por service_role e ignora a
// RLS, liberava `delete-instance` pelo gate genérico). A correção é a migration
// 20261012113232 (DELETE passa a exigir `is_admin` estrito) + o gate
// `requireAdminOnly` na Edge (casos CX0 em
// `supabase/functions/evolution-api/index.test.ts`).
//
// Este contrato trava o lado BANCO lendo as migrations reais (mesmo resolvedor
// de `src/lib/__tests__/rlsGroupAccess.test.ts` — sem espelho, sem mock):
//   * existe UMA ÚNICA policy de DELETE em `whatsapp_connections`;
//   * o predicado efetivo dela é `is_admin(auth.uid())` ESTRITO — casa
//     `is_admin(` mas NÃO `is_admin_or_supervisor(`;
//   * a policy continua restrita ao papel `authenticated`.
//
// Se uma migration futura devolver o DELETE ao supervisor (ou duplicar a
// policy com predicado permissivo), isto fica vermelho.
// Roda em `bun run test:contracts` (vitest.contracts.config.ts, passo
// "Run Edge Function contract tests (tests/contracts)" do ci.yml, por glob —
// sem passo dedicado e sem edição de workflow).

const ESTADO = resolveEffectivePolicies();
const TABELA = 'whatsapp_connections';

const SOMENTE_ADMIN = /is_admin\(\s*auth\.uid\(\)\s*\)/;
const ADMIN_OU_SUPERVISOR = /is_admin_or_supervisor\(\s*auth\.uid\(\)\s*\)/;

describe('CX0/Z1: DELETE de whatsapp_connections é admin-only', () => {
  const deletes = policiesOn(ESTADO, TABELA).filter((p) => p.command === 'DELETE');

  it('existe uma única policy de DELETE', () => {
    expect(
      deletes.map((p) => p.name),
      'mais de uma policy de DELETE abre brecha por cobertura parcial',
    ).toHaveLength(1);
  });

  it('o predicado do DELETE é is_admin estrito (supervisor não exclui)', () => {
    expect(deletes.length).toBeGreaterThan(0);
    for (const p of deletes) {
      const predicado = predicadoEfetivo(p, 'DELETE');
      expect(predicado, `${p.name}: predicado permissivo`).not.toBe('true');
      expect(predicado, `${p.name}: não exige is_admin`).toMatch(SOMENTE_ADMIN);
      expect(predicado, `${p.name}: ainda aceita supervisor`).not.toMatch(
        ADMIN_OU_SUPERVISOR,
      );
    }
    expect(
      comandoProtegido(policiesOn(ESTADO, TABELA), 'DELETE', SOMENTE_ADMIN),
      'DELETE sem cobertura só-admin',
    ).toBe(true);
  });

  it('a policy de DELETE continua restrita ao papel authenticated', () => {
    expect(deletes.length).toBeGreaterThan(0);
    for (const p of deletes) {
      expect(p.roles).toContain('authenticated');
    }
  });
});

import { describe, it, expect } from 'vitest';
import {
  cobreComando,
  paridadeDeNomes,
  policiesOn,
  predicadoEfetivo,
  resolveEffectivePolicies,
  resolvePolicyState,
  type EffectivePolicy,
} from './helpers/rlsSchema';

// ─── RLS REAL: contacts e messages ───
// Sem funcoes-espelho: o estado efetivo das policies sai de
// supabase/migrations/*.sql (ordem cronologica, CREATE/DROP/ALTER/drop
// dinamico resolvidos). O acesso de conversas no schema real NAO e "dono ou
// fila vazia" como o espelho antigo modelava — e o predicado unico
// can_edit_contact (admin/supervisor OU assigned_to visivel OU membro
// ativo da fila). Qualquer migration que enfraquecer isso fica vermelha.

const ESTADO = resolveEffectivePolicies();

/**
 * Paridade de nomes com o manifest do banco real. Tolerante quando existe
 * migration de policy POSTERIOR ao snapshot (o artefato e sincronizado pelo
 * `types-sync` depois do push): nesse caso exige que nada tenha sumido.
 */
function checaManifest(policies: ReturnType<typeof policiesOn>, tabela: string): void {
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
const AGENTES_VISIVEIS = /get_visible_agent_ids\(\s*auth\.uid\(\)\s*\)/;
const MEMBRO_DE_FILA = /queue_members[\s\S]*?is_active\s*=\s*true/;
const PERFIL_DO_CHAMADOR = /profiles[\s\S]*?user_id\s*=\s*auth\.uid\(\)/;

/**
 * Contrato de DELETE de `messages`: hoje nao existe policy cobrindo o comando
 * (a exclusao passa pelo fluxo proprio, sob o predicado de visibilidade). Se
 * uma policy passar a cobrir DELETE, ela so e aceita carregando exatamente o
 * predicado contratado — e `FOR ALL` CONTA como cobertura (semantica do
 * Postgres), logo nao escapa desta checagem. Devolve o nome de cada policy que
 * cobre DELETE sem atender o contrato.
 */
function deleteSemContrato(policies: EffectivePolicy[]): string[] {
  return policies
    .filter((p) => cobreComando(p, 'DELETE'))
    .filter((p) => {
      const predicado = predicadoEfetivo(p, 'DELETE');
      return !(
        predicado !== 'true' &&
        ADMIN_OU_SUPERVISOR.test(predicado) &&
        AGENTES_VISIVEIS.test(predicado) &&
        MEMBRO_DE_FILA.test(predicado)
      );
    })
    .map((p) => p.name);
}

describe('RLS real: contacts (schema resolvido das migrations)', () => {
  const policies = policiesOn(ESTADO, 'contacts');

  it('o conjunto de policies bate com o manifest do schema real', () => {
    checaManifest(policies, 'contacts');
  });

  it('SELECT delega ao predicado canonico can_edit_contact (dono, fila ou admin)', () => {
    const select = policies.filter((p) => cobreComando(p, 'SELECT'));
    expect(select.length).toBeGreaterThan(0);
    for (const p of select) {
      expect(p.roles).toContain('authenticated');
      // O predicado unico cobre admin/supervisor + assigned_to visivel +
      // membro ativo de fila — tudo via can_edit_contact, ponto unico da regra.
      const predicado = predicadoEfetivo(p, 'SELECT');
      expect(predicado, p.name).toMatch(/can_edit_contact\(/);
      expect(predicado, `${p.name} abriu SELECT para todos`).not.toBe('true');
    }
  });

  it('INSERT exige admin/supervisor OU auto-atribuicao (assigned_to = proprio perfil)', () => {
    const insert = policies.filter((p) => cobreComando(p, 'INSERT'));
    expect(insert.length).toBeGreaterThan(0);
    for (const p of insert) {
      const check = predicadoEfetivo(p, 'INSERT');
      expect(check, p.name).toMatch(ADMIN_OU_SUPERVISOR);
      expect(check, p.name).toMatch(/assigned_to/);
      expect(check, p.name).toMatch(PERFIL_DO_CHAMADOR);
    }
  });

  it('UPDATE usa o mesmo predicado canonico do SELECT', () => {
    const update = policies.filter((p) => cobreComando(p, 'UPDATE'));
    expect(update.length).toBeGreaterThan(0);
    for (const p of update) {
      expect(predicadoEfetivo(p, 'UPDATE'), p.name).toMatch(/can_edit_contact\(/);
    }
  });

  it('nao existe policy de DELETE — exclusao e soft-delete via RPC can_edit_contact', () => {
    // O schema real nao tem DELETE policy em contacts: delete_contact() faz
    // UPDATE deleted_at com a mesma regra can_edit_contact. Se surgir uma
    // policy de DELETE — ou um FOR ALL que a cubra — este teste forca
    // revisao consciente.
    expect(policies.filter((p) => cobreComando(p, 'DELETE'))).toEqual([]);
  });
});

describe('RLS real: messages (schema resolvido das migrations)', () => {
  const policies = policiesOn(ESTADO, 'messages');

  it('o conjunto de policies bate com o manifest do schema real', () => {
    checaManifest(policies, 'messages');
  });

  it('SELECT ve so mensagens de contatos visiveis (admin OU dono OU fila)', () => {
    const select = policies.filter((p) => cobreComando(p, 'SELECT'));
    expect(select.length).toBeGreaterThan(0);
    for (const p of select) {
      expect(p.roles).toContain('authenticated');
      const using = predicadoEfetivo(p, 'SELECT');
      // Os 3 ramos reais da visibilidade — remover qualquer um fica vermelho.
      expect(using, p.name).toMatch(ADMIN_OU_SUPERVISOR);
      expect(using, p.name).toMatch(AGENTES_VISIVEIS);
      expect(using, p.name).toMatch(MEMBRO_DE_FILA);
      expect(using, `${p.name} abriu SELECT para todos`).not.toBe('true');
    }
  });

  it('INSERT exige contato visivel E agent_id do proprio perfil (ou admin)', () => {
    const insert = policies.filter((p) => cobreComando(p, 'INSERT'));
    expect(insert.length).toBeGreaterThan(0);
    for (const p of insert) {
      const check = predicadoEfetivo(p, 'INSERT');
      // A brecha fechada pela migration 20260925120000: inserir mensagem em
      // contato que o agente nao ve. Sem o ramo de visibilidade, volta o IDOR.
      expect(check, p.name).toMatch(ADMIN_OU_SUPERVISOR);
      expect(check, p.name).toMatch(/agent_id/);
      expect(check, p.name).toMatch(PERFIL_DO_CHAMADOR);
      expect(check, p.name).toMatch(AGENTES_VISIVEIS);
      expect(check, p.name).toMatch(MEMBRO_DE_FILA);
      expect(check, `${p.name} permite INSERT irrestrito`).not.toBe('true');
    }
  });

  it('UPDATE tem paridade com SELECT (dono, fila ou admin)', () => {
    const update = policies.filter((p) => cobreComando(p, 'UPDATE'));
    expect(update.length).toBeGreaterThan(0);
    for (const p of update) {
      const using = predicadoEfetivo(p, 'UPDATE');
      expect(using, p.name).toMatch(AGENTES_VISIVEIS);
      expect(using, p.name).toMatch(MEMBRO_DE_FILA);
      expect(using, p.name).toMatch(ADMIN_OU_SUPERVISOR);
    }
  });

  it('DELETE exige o predicado contratado — ausencia total de cobertura ou FOR ALL com o mesmo predicado', () => {
    // O contrato vigente nao tem policy de DELETE em messages. Qualquer policy
    // que cubra DELETE — inclusive `FOR ALL` — tem de carregar o predicado
    // contratado de visibilidade; `true` nunca passa, nem como WITH CHECK
    // restritivo, porque DELETE e filtrado pelo USING.
    for (const p of policies.filter((p) => cobreComando(p, 'DELETE'))) {
      expect(predicadoEfetivo(p, 'DELETE'), `${p.name} abriu DELETE`).not.toBe('true');
    }
    expect(deleteSemContrato(policies)).toEqual([]);
  });
});

describe('RLS real: mensagens nao dao DELETE por atalho (regressivo FOR ALL)', () => {
  const PREDICADO_CONTRATADO =
    'is_admin_or_supervisor(auth.uid()) OR contact_id IN (SELECT c.id FROM public.contacts c WHERE c.assigned_to IN (SELECT get_visible_agent_ids(auth.uid())) OR c.queue_id IN (SELECT queue_id FROM public.queue_members WHERE is_active = true))';

  const estadoDe = (sql: string) =>
    policiesOn(resolvePolicyState([{ name: '0001_policy.sql', sql }]), 'messages');

  it('FOR ALL USING (true) cobre DELETE e nao contorna a exigencia', () => {
    const policies = estadoDe(
      `CREATE POLICY "tudo em messages" ON public.messages FOR ALL TO authenticated
       USING (true) WITH CHECK (is_admin_or_supervisor(auth.uid()));`,
    );
    // A validacao anterior (so `command === 'DELETE'`) nao enxergava esta
    // policy: e exatamente a brecha da recusa.
    expect(policies.filter((p) => p.command === 'DELETE')).toEqual([]);
    // A validacao corrigida enxerga: FOR ALL cobre DELETE e o predicado
    // efetivo e 'true' (o WITH CHECK restritivo nao protege DELETE).
    expect(cobreComando(policies[0], 'DELETE')).toBe(true);
    expect(predicadoEfetivo(policies[0], 'DELETE')).toBe('true');
    expect(deleteSemContrato(policies)).toEqual(['tudo em messages']);
  });

  it('FOR ALL com o predicado contratado passa — a exigencia e o predicado, nao a forma', () => {
    const policies = estadoDe(
      `CREATE POLICY "contratado" ON public.messages FOR ALL TO authenticated
       USING (${PREDICADO_CONTRATADO}) WITH CHECK (${PREDICADO_CONTRATADO});`,
    );
    expect(cobreComando(policies[0], 'DELETE')).toBe(true);
    expect(predicadoEfetivo(policies[0], 'DELETE')).not.toBe('true');
    expect(deleteSemContrato(policies)).toEqual([]);
  });
});

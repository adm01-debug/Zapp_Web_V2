import { describe, it, expect } from 'vitest';
import {
  cobreComando,
  paridadeDeNomes,
  policiesOn,
  predicadoEfetivo,
  resolveEffectivePolicies,
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
});

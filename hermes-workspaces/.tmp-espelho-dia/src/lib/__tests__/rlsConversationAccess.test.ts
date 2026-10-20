import { describe, it, expect } from 'vitest';
import {
  cobreComando,
  normSql,
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

/** Ramo de OR que, sozinho, nao restringe nada. */
const RAMO_PERMISSIVO = /^(true|1\s*=\s*1)$/;

/**
 * Ramificacoes de OR de nivel zero de um predicado, normalizadas e ordenadas.
 * E a forma canonica que compara dois predicados: um ramo a mais muda o
 * resultado, entao `true OR <contrato>` NAO passa por ser "parecido" — era
 * exatamente o buraco da checagem por trechos/regex.
 */
function ramosDeOr(predicado: string): string[] {
  const ramos: string[] = [];
  let profundidade = 0;
  let inicio = 0;
  for (let i = 0; i < predicado.length; i++) {
    const char = predicado[i];
    if (char === '(') profundidade++;
    else if (char === ')') profundidade--;
    else if (profundidade === 0 && /\s/.test(char)) {
      const separador = /^\s+OR\s+/i.exec(predicado.slice(i));
      if (separador) {
        ramos.push(predicado.slice(inicio, i));
        i += separador[0].length;
        inicio = i;
        i--;
      }
    }
  }
  ramos.push(predicado.slice(inicio));
  return ramos
    .map((ramo) => normSql(ramo))
    .filter((ramo) => ramo.length > 0)
    .sort();
}

/**
 * Forma canonica do contrato VIGENTE de visibilidade de `messages`, lida do
 * schema REAL (`ESTADO`, resolvido das migrations): o predicado que hoje
 * autoriza enxergar a mensagem. Sai do schema real, nunca do estado sob teste —
 * senao a propria policy enfraquecida viraria o contrato dela mesma.
 */
function contratoDeVisibilidade(policies: EffectivePolicy[]): string[] {
  const ramos = policies
    .filter((p) => cobreComando(p, 'SELECT'))
    .map((p) => predicadoEfetivo(p, 'SELECT'))
    .flatMap((predicado) => ramosDeOr(predicado));
  return [...new Set(ramos)].sort();
}

const CONTRATO_VISIBILIDADE_MESSAGES = contratoDeVisibilidade(policiesOn(ESTADO, 'messages'));

/** `true` quando o predicado reproduz exatamente a forma canonica do contrato. */
function mesmaForma(predicado: string, contrato: string[]): boolean {
  return JSON.stringify(ramosDeOr(predicado)) === JSON.stringify(contrato);
}

/**
 * Contrato de DELETE de `messages`: hoje o schema real NAO tem policy cobrindo
 * o comando (a exclusao passa pelo fluxo proprio, sob o predicado de
 * visibilidade). Entao toda policy que cobrir DELETE — e `FOR ALL` CONTA, pela
 * semantica do Postgres — tem de reproduzir EXATAMENTE a forma canonica do
 * contrato vigente. Predicado irrestrito (`true`, `1 = 1`) ou ramo permissivo
 * a mais (`true OR <contrato>`) reprovam: nao basta conter os trechos do
 * contrato. Devolve o nome de cada policy que cobre DELETE sem atender isso.
 */
function deleteSemContrato(policies: EffectivePolicy[]): string[] {
  return policies
    .filter((p) => cobreComando(p, 'DELETE'))
    .filter((p) => {
      const predicado = predicadoEfetivo(p, 'DELETE');
      const ramos = ramosDeOr(predicado);
      if (ramos.length === 0 || ramos.some((ramo) => RAMO_PERMISSIVO.test(ramo))) return true;
      return !mesmaForma(predicado, CONTRATO_VISIBILIDADE_MESSAGES);
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

  it('o contrato de visibilidade lido do schema real nao tem ramo permissivo', () => {
    // Se o proprio predicado de visibilidade ganhar um ramo que nao restringe
    // (`true`, `1 = 1`), ele deixaria de ser contrato — e o DELETE abaixo
    // passaria a aceitar o enfraquecimento. Este teste fecha esse atalho.
    expect(CONTRATO_VISIBILIDADE_MESSAGES.length).toBeGreaterThan(0);
    for (const ramo of CONTRATO_VISIBILIDADE_MESSAGES) {
      expect(ramo, 'ramo permissivo no contrato de visibilidade de messages').not.toMatch(
        RAMO_PERMISSIVO,
      );
    }
  });

  it('DELETE exige o contrato vigente inteiro — ausencia total de cobertura ou predicado identico', () => {
    // O contrato vigente nao tem policy de DELETE em messages: a exclusao passa
    // pelo fluxo proprio. Qualquer policy que cubra DELETE — inclusive `FOR ALL`
    // — so passa reproduzindo exatamente as ramificacoes do contrato de
    // visibilidade; `true`, `1 = 1` ou um ramo permissivo a mais reprovam,
    // porque DELETE e filtrado pelo USING (o WITH CHECK nao protege).
    for (const p of policies.filter((p) => cobreComando(p, 'DELETE'))) {
      expect(predicadoEfetivo(p, 'DELETE'), `${p.name} abriu DELETE`).not.toBe('true');
    }
    expect(deleteSemContrato(policies)).toEqual([]);
  });
});

describe('RLS real: mensagens nao dao DELETE por atalho (regressivo FOR ALL)', () => {
  // O predicado contratado e a propria forma canonica lida do schema real
  // (SELECT de messages): quem cobrir DELETE tem de reproduzi-la inteira.
  const PREDICADO_CONTRATADO = CONTRATO_VISIBILIDADE_MESSAGES.join(' OR ');

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

  it('FOR ALL com o predicado contratado passa — a exigencia e a forma, nao a policy', () => {
    const policies = estadoDe(
      `CREATE POLICY "contratado" ON public.messages FOR ALL TO authenticated
       USING (${PREDICADO_CONTRATADO}) WITH CHECK (${PREDICADO_CONTRATADO});`,
    );
    expect(cobreComando(policies[0], 'DELETE')).toBe(true);
    expect(predicadoEfetivo(policies[0], 'DELETE')).not.toBe('true');
    expect(deleteSemContrato(policies)).toEqual([]);
  });

  it('FOR ALL com `true OR <predicado contratado>` e recusado — sobra o ramo permissivo', () => {
    const policies = estadoDe(
      `CREATE POLICY "atalho" ON public.messages FOR ALL TO authenticated
       USING (true OR ${PREDICADO_CONTRATADO});`,
    );
    const predicado = predicadoEfetivo(policies[0], 'DELETE');
    // Os TRES trechos do contrato estao presentes — era exatamente isto que a
    // checagem antiga por regex/trechos aceitava:
    expect(predicado).toMatch(ADMIN_OU_SUPERVISOR);
    expect(predicado).toMatch(AGENTES_VISIVEIS);
    expect(predicado).toMatch(MEMBRO_DE_FILA);
    expect(predicado).not.toBe('true');
    expect(cobreComando(policies[0], 'DELETE')).toBe(true);
    // ... e ainda assim a policy e recusada, porque sobra o ramo `true`.
    expect(ramosDeOr(predicado)).toContain('true');
    expect(deleteSemContrato(policies)).toEqual(['atalho']);
  });

  // Predicado parcial: o contrato real sem o ramo de fila. Nao tem ramo
  // permissivo, entao so `mesmaForma` pode recusa-lo — o `true OR` acima cai
  // antes no RAMO_PERMISSIVO e nao exercita a comparacao de forma.
  const RAMO_DE_FILA = CONTRATO_VISIBILIDADE_MESSAGES.find((r) => /queue_members/.test(r));
  const PARCIAL_SEM_FILA = CONTRATO_VISIBILIDADE_MESSAGES.filter((r) => r !== RAMO_DE_FILA).join(
    ' OR ',
  );

  it('o predicado parcial sem fila e um subconjunto proprio do contrato', () => {
    expect(RAMO_DE_FILA, 'contrato real sem ramo de fila — o parcial nao provaria nada').toBeDefined();
    expect(PARCIAL_SEM_FILA.length).toBeGreaterThan(0);
    const ramosParcial = ramosDeOr(PARCIAL_SEM_FILA);
    expect(ramosParcial.length).toBeLessThan(CONTRATO_VISIBILIDADE_MESSAGES.length);
    expect(ramosParcial.some((ramo) => RAMO_PERMISSIVO.test(ramo))).toBe(false);
  });

  it('FOR DELETE com o contrato sem o ramo de fila e recusado', () => {
    const policies = estadoDe(
      `CREATE POLICY "messages_delete_sem_fila" ON public.messages FOR DELETE TO authenticated
       USING (${PARCIAL_SEM_FILA});`,
    );
    expect(cobreComando(policies[0], 'DELETE')).toBe(true);
    expect(predicadoEfetivo(policies[0], 'DELETE')).not.toMatch(MEMBRO_DE_FILA);
    expect(deleteSemContrato(policies)).toEqual(['messages_delete_sem_fila']);
  });

  it('FOR ALL com o contrato sem o ramo de fila e recusado', () => {
    const policies = estadoDe(
      `CREATE POLICY "messages_all_parcial" ON public.messages FOR ALL TO authenticated
       USING (${PARCIAL_SEM_FILA});`,
    );
    expect(cobreComando(policies[0], 'DELETE')).toBe(true);
    expect(predicadoEfetivo(policies[0], 'DELETE')).not.toBe('true');
    expect(deleteSemContrato(policies)).toEqual(['messages_all_parcial']);
  });

  it('ausencia total de policy cobrindo DELETE e aceita', () => {
    const policies = estadoDe(
      `CREATE POLICY "s" ON public.messages FOR SELECT TO authenticated
       USING (${PARCIAL_SEM_FILA});
       CREATE POLICY "i" ON public.messages FOR INSERT TO authenticated
       WITH CHECK (${PARCIAL_SEM_FILA});`,
    );
    expect(policies.map((p) => p.name).sort()).toEqual(['i', 's']);
    expect(policies.filter((p) => cobreComando(p, 'DELETE'))).toEqual([]);
    expect(deleteSemContrato(policies)).toEqual([]);
  });
});

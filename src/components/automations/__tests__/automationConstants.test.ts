import { describe, expect, it } from 'vitest';
import {
  ACTION_TYPES,
  OBSOLETE_AUTOMATION_LABEL,
  TRIGGER_TYPES,
  filterActionConfig,
  isObsoleteAutomation,
} from '../automationConstants';

// A função de tags foi removida do sistema (decisão do dono). As listas abaixo
// são a fonte única do que o editor oferece; a asserção é sobre a LISTA EXATA
// — e não sobre "não contém X" — para que recolocar uma opção removida ou
// perder uma opção viva também quebre o teste.
const GATILHOS_VIVOS = ['new_message', 'keyword', 'time_inactive', 'business_hours'];
const ACOES_VIVAS = ['send_message', 'assign_agent', 'send_notification', 'close_conversation'];

describe('automationConstants — as opções de tag saíram do editor', () => {
  it('TRIGGER_TYPES é exatamente a lista viva, na ordem', () => {
    expect(TRIGGER_TYPES.map((t) => t.type)).toEqual(GATILHOS_VIVOS);
  });

  it('ACTION_TYPES é exatamente a lista viva, na ordem', () => {
    expect(ACTION_TYPES.map((a) => a.type)).toEqual(ACOES_VIVAS);
  });

  it('toda opção oferecida tem rótulo, ícone e descrição (nenhum badge da lista fica vazio)', () => {
    for (const item of [...TRIGGER_TYPES, ...ACTION_TYPES]) {
      expect(item.label).toBeTruthy();
      expect(item.description).toBeTruthy();
      expect(item.icon).toBeTruthy();
    }
  });
});

describe('isObsoleteAutomation — reconhece o registro antigo, sem apagar nada', () => {
  const viva = { trigger_type: 'new_message', actions: [{ type: 'send_message', config: {} }] };

  it('automação só com tipos vivos não é obsoleta', () => {
    expect(isObsoleteAutomation(viva)).toBe(false);
  });

  it('gatilho que a tela não oferece mais marca a automação como obsoleta', () => {
    expect(isObsoleteAutomation({ ...viva, trigger_type: 'gatilho_que_saiu' })).toBe(true);
  });

  it('qualquer ação que a tela não oferece mais marca a automação como obsoleta', () => {
    expect(
      isObsoleteAutomation({
        trigger_type: 'keyword',
        actions: [{ type: 'send_message', config: {} }, { type: 'acao_que_saiu', config: {} }],
      })
    ).toBe(true);
  });

  it('chave de config desconhecida NÃO torna a automação obsoleta (só o tipo importa)', () => {
    expect(
      isObsoleteAutomation({
        trigger_type: 'keyword',
        actions: [{ type: 'assign_agent', config: { parametro_futuro: 1 } }],
      })
    ).toBe(false);
  });

  it('ações ausentes não marcam; item de ação sem tipo marca (sem quebrar a lista)', () => {
    expect(isObsoleteAutomation({ trigger_type: 'keyword' })).toBe(false);
    expect(isObsoleteAutomation({ trigger_type: 'keyword', actions: [{ config: {} }] })).toBe(true);
    expect(isObsoleteAutomation({ trigger_type: 'keyword', actions: 'texto' })).toBe(false);
  });

  it('o rótulo mostrado na lista é o combinado com o dono', () => {
    expect(OBSOLETE_AUTOMATION_LABEL).toBe('Obsoleta (tag removida)');
  });
});

describe('filterActionConfig — contrato preservado na troca de tipo', () => {
  it('remove a chave dona do tipo antigo e mantém as desconhecidas', () => {
    expect(filterActionConfig('assign_agent', { message: 'x', delay_seconds: 3 })).toEqual({ delay_seconds: 3 });
  });
});

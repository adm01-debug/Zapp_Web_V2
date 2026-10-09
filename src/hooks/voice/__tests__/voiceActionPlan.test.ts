/**
 * Contrato do comando de voz → estado da view (`src/hooks/voice/voiceActionPlan.ts`).
 * Função pura: ação + query string → plano (view/params/applied/message/level). Os casos
 * de borda são "chegou incompleto", "a lista não consome esse parâmetro" e "nada para
 * limpar" — todos exigem `applied: false` e nenhum texto de sucesso (defeito do item 340).
 */
import { describe, expect, it } from 'vitest';
import { planVoiceAction } from '../voiceActionPlan';
import type { VoiceAgentAction } from '../types';

const acao = (over: Partial<VoiceAgentAction>): VoiceAgentAction => ({
  action: 'answer',
  response: '',
  ...over,
});

const params = (query = '') => new URLSearchParams(query);

describe('navigate', () => {
  it('navega para a seção pedida', () => {
    const plano = planVoiceAction(acao({ action: 'navigate', data: { route: 'contacts' } }), params());
    expect(plano).toEqual({
      view: 'contacts',
      params: {},
      applied: true,
      message: 'Navegando para contacts',
      level: 'success',
    });
  });

  it('sem seção não anuncia navegação', () => {
    const plano = planVoiceAction(acao({ action: 'navigate', data: {} }), params());
    expect(plano.applied).toBe(false);
    expect(plano.view).toBeUndefined();
    expect(plano.level).toBe('warning');
    expect(plano.message).toMatch(/sem a seção/i);
  });
});

describe('search', () => {
  it('grava o termo em `q` na inbox', () => {
    const plano = planVoiceAction(acao({ action: 'search', data: { query: '  joão  ' } }), params());
    expect(plano.view).toBe('inbox');
    expect(plano.params).toEqual({ q: 'joão' });
    expect(plano.applied).toBe(true);
    expect(plano.level).toBe('success');
    expect(plano.message).toBe('Buscando: "joão"');
  });

  it('termo vazio ou só espaços não aplica busca', () => {
    for (const query of ['', '   ', undefined]) {
      const plano = planVoiceAction(acao({ action: 'search', data: { query } }), params());
      expect(plano.applied, JSON.stringify(query)).toBe(false);
      expect(plano.params).toEqual({});
      expect(plano.message).toMatch(/sem o termo/i);
    }
  });
});

describe('filter', () => {
  it('aplica status reconhecido pelo filtro do inbox', () => {
    const plano = planVoiceAction(acao({ action: 'filter', data: { filters: { status: 'unread' } } }), params());
    expect(plano.params).toEqual({ status: 'unread' });
    expect(plano.applied).toBe(true);
    expect(plano.level).toBe('success');
  });

  it('status fora do vocabulário da inbox não vira parâmetro', () => {
    const plano = planVoiceAction(acao({ action: 'filter', data: { filters: { status: 'urgente' } } }), params());
    expect(plano.params).toEqual({});
    expect(plano.applied).toBe(false);
    expect(plano.level).toBe('warning');
  });

  it('traduz unread: true em status=unread e ignora unread: false', () => {
    const ativo = planVoiceAction(acao({ action: 'filter', data: { filters: { unread: true } } }), params());
    expect(ativo.params).toEqual({ status: 'unread' });
    expect(ativo.message).toContain('não lidas');

    const inativo = planVoiceAction(acao({ action: 'filter', data: { filters: { unread: false } } }), params());
    expect(inativo.applied).toBe(false);
  });

  it('apara o tipo de contato e ignora tipo em branco', () => {
    const comTipo = planVoiceAction(acao({ action: 'filter', data: { filters: { contactType: ' cliente ' } } }), params());
    expect(comTipo.params).toEqual({ type: 'cliente' });

    const semTipo = planVoiceAction(acao({ action: 'filter', data: { filters: { contactType: '   ' } } }), params());
    expect(semTipo.applied).toBe(false);
  });

  it('anuncia em parte quando algo é ignorado, sem dizer que aplicou tudo', () => {
    const plano = planVoiceAction(
      acao({ action: 'filter', data: { filters: { status: 'pending', sentiment: 'negativo', category: 'vendas', assigned: true } } }),
      params(),
    );
    expect(plano.params).toEqual({ status: 'pending' });
    expect(plano.applied).toBe(true);
    expect(plano.level).toBe('warning');
    expect(plano.message).toContain('aplicado em parte');
    expect(plano.message).toContain('sem efeito');
    expect(plano.message).toContain('sentimento: negativo');
    expect(plano.message).toContain('categoria: vendas');
    expect(plano.message).toContain('atribuição');
  });

  it('não aplica nada quando só vieram critérios ignorados', () => {
    const plano = planVoiceAction(acao({ action: 'filter', data: { filters: { sentiment: 'negativo' } } }), params());
    expect(plano.params).toEqual({});
    expect(plano.applied).toBe(false);
    expect(plano.level).toBe('warning');
    expect(plano.message).toMatch(/não tem efeito/i);
  });

  it('sem critérios não inventa aplicação', () => {
    const plano = planVoiceAction(acao({ action: 'filter', data: { filters: {} } }), params());
    expect(plano.applied).toBe(false);
    expect(plano.message).toMatch(/sem os critérios|não tem efeito/i);
  });
});

describe('sort', () => {
  it('não existe ordenação por voz: recusa com motivo, sem prometer mudança', () => {
    const plano = planVoiceAction(acao({ action: 'sort', data: { sortBy: 'data' } }), params());
    expect(plano).toEqual({
      params: {},
      applied: false,
      message: 'Ordenação por comando de voz ainda não está disponível.',
      level: 'warning',
    });
    expect(plano.view).toBeUndefined();
  });
});

describe('clear', () => {
  it('remove só os parâmetros de filtro/busca ativos', () => {
    const plano = planVoiceAction(
      acao({ action: 'clear' }),
      params('q=joao&status=unread&type=lead&page=3'),
    );
    expect(plano.view).toBe('inbox');
    expect(plano.params).toEqual({ q: null, status: null, type: null });
    expect(plano.applied).toBe(true);
    expect(plano.message).toBe('Filtros limpos');
    expect(plano.level).toBe('success');
  });

  it('sem filtro ativo informa que não havia nada, sem anunciar sucesso', () => {
    const plano = planVoiceAction(acao({ action: 'clear' }), params('page=2'));
    expect(plano.applied).toBe(false);
    expect(plano.level).toBe('info');
    expect(plano.message).toBe('Nenhum filtro ou busca ativa para limpar.');
  });
});

describe('answer e ações desconhecidas', () => {
  it('não mexe no estado e não anuncia nada', () => {
    expect(planVoiceAction(acao({ action: 'answer', response: 'oi' }), params('q=x'))).toEqual({
      params: {},
      applied: false,
      message: '',
      level: 'info',
    });
  });

  it('ação desconhecida cai no mesmo caminho neutro', () => {
    const plano = planVoiceAction(acao({ action: 'desconhecida' as VoiceAgentAction['action'] }), params());
    expect(plano.applied).toBe(false);
    expect(plano.message).toBe('');
    expect(plano.level).toBe('info');
  });
});

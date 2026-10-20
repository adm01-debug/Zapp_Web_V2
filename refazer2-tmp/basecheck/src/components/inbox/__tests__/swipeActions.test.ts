import { describe, it, expect, vi } from 'vitest';
import {
  SWIPE_ACTIONS,
  DEFAULT_LEFT_ACTION,
  DEFAULT_RIGHT_ACTION,
} from '../swipeActions';

// ── Ações padrão ──────────────────────────────────────────────────────────────

describe('DEFAULT_LEFT_ACTION / DEFAULT_RIGHT_ACTION', () => {
  it('a ação padrão da esquerda marca como lido', () => {
    expect(DEFAULT_LEFT_ACTION.label).toBe('Lido');
    expect(DEFAULT_LEFT_ACTION.bgColor).toBe('bg-success');
    expect(typeof DEFAULT_LEFT_ACTION.action).toBe('function');
  });

  it('a ação padrão da direita arquiva', () => {
    expect(DEFAULT_RIGHT_ACTION.label).toBe('Arquivar');
    expect(DEFAULT_RIGHT_ACTION.bgColor).toBe('bg-warning');
    expect(typeof DEFAULT_RIGHT_ACTION.action).toBe('function');
  });

  it('as ações padrão são no-op (não explodem ao chamar)', () => {
    expect(() => DEFAULT_LEFT_ACTION.action()).not.toThrow();
    expect(() => DEFAULT_RIGHT_ACTION.action()).not.toThrow();
  });
});

// ── Fábricas pré-configuradas ─────────────────────────────────────────────────

describe('SWIPE_ACTIONS — rótulo e cor de cada ação', () => {
  const casos: Array<[keyof typeof SWIPE_ACTIONS, string, string]> = [
    ['markAsRead', 'Lido', 'bg-success'],
    ['markAsUnread', 'Não lido', 'bg-info'],
    ['archive', 'Arquivar', 'bg-warning'],
    ['delete', 'Excluir', 'bg-destructive'],
    ['pin', 'Fixar', 'bg-primary'],
    ['unpin', 'Desafixar', 'bg-muted-foreground'],
    ['star', 'Favoritar', 'bg-warning'],
    ['mute', 'Silenciar', 'bg-muted'],
    ['unmute', 'Ativar som', 'bg-info'],
  ];

  it.each(casos)('%s tem rótulo "%s" e fundo %s', (nome, label, bgColor) => {
    const action = SWIPE_ACTIONS[nome](() => {});
    expect(action.label).toBe(label);
    expect(action.bgColor).toBe(bgColor);
    expect(action.color).toBe('text-primary-foreground');
    expect(action.icon).toBeTruthy();
  });
});

describe('SWIPE_ACTIONS — a ação chama de volta o callback recebido', () => {
  it('cada fábrica entrega o MESMO callback como action', () => {
    const onAction = vi.fn();
    (Object.keys(SWIPE_ACTIONS) as Array<keyof typeof SWIPE_ACTIONS>).forEach((nome) => {
      const action = SWIPE_ACTIONS[nome](onAction);
      action.action();
    });
    // uma chamada por fábrica, e nenhuma perdida
    expect(onAction).toHaveBeenCalledTimes(Object.keys(SWIPE_ACTIONS).length);
  });

  it('fábricas diferentes guardam callbacks diferentes', () => {
    const a = vi.fn();
    const b = vi.fn();
    SWIPE_ACTIONS.archive(a).action();
    SWIPE_ACTIONS.delete(b).action();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).not.toBe(b);
  });
});

import { describe, it, expect } from 'vitest';
import {
  FORWARD_MAX_ITEMS,
  FORWARD_MAX_SENDS,
  FORWARD_MAX_TARGETS,
  FORWARD_CONFIRM_THRESHOLD,
  forwardConfirmMessage,
  forwardLimitError,
  forwardSendCount,
  needsForwardConfirmation,
} from '../forward-limits';

describe('forward-limits (etapa 39)', () => {
  it('conta envios como arquivos x destinos', () => {
    expect(forwardSendCount(4, 10)).toBe(40);
    expect(forwardSendCount(0, 5)).toBe(0);
    expect(forwardSendCount(-3, 5)).toBe(0);
  });

  it('aceita o teto exato de 10 x 10 = 100 envios', () => {
    expect(FORWARD_MAX_ITEMS).toBe(10);
    expect(FORWARD_MAX_TARGETS).toBe(10);
    expect(FORWARD_MAX_SENDS).toBe(100);
    expect(forwardLimitError(10, 10)).toBeNull();
    expect(forwardLimitError(1, 10)).toBeNull();
  });

  it('primeiro limiar: acima de 10 arquivos o botão fica desabilitado com o motivo', () => {
    const reason = forwardLimitError(11, 1);
    expect(reason).toBe('Máximo de 10 arquivos por operação (você selecionou 11).');
    expect(forwardLimitError(11, 10)).not.toBeNull();
  });

  it('primeiro limiar: acima de 10 destinos o botão fica desabilitado com o motivo', () => {
    const reason = forwardLimitError(2, 11);
    expect(reason).toBe('Máximo de 10 destinos por operação (você selecionou 11).');
  });

  it('o produto acima de 100 envios também bloqueia', () => {
    const reason = forwardLimitError(10, 11);
    expect(reason).toContain('Máximo de 10 destinos por operação');
    // 6 x 10 = 60: dentro dos limites por dimensão (não dispara)
    expect(forwardLimitError(10, 10)).toBeNull();
  });

  it('segundo limiar: confirmação explícita a partir de 20 envios', () => {
    expect(FORWARD_CONFIRM_THRESHOLD).toBe(20);
    expect(needsForwardConfirmation(1, 19)).toBe(false);
    expect(needsForwardConfirmation(1, 20)).toBe(true);
    expect(needsForwardConfirmation(10, 4)).toBe(true);
  });

  it('texto de confirmação no formato do plano', () => {
    expect(forwardConfirmMessage(10, 4)).toBe('Vai enviar 40 mensagens para 4 contatos. Continuar?');
    expect(forwardConfirmMessage(1, 1)).toBe('Vai enviar 1 mensagens para 1 contato. Continuar?');
  });
});

/**
 * CV-072 — testes do hook useObjectionHandler.
 */
import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useObjectionHandler } from '../useObjectionHandler';

describe('useObjectionHandler', () => {
  it('não detecta objeção em mensagem neutra', () => {
    const { result } = renderHook(() =>
      useObjectionHandler({ clientText: 'Olá, tudo bem?' }),
    );
    expect(result.current.detected).toBe(false);
    expect(result.current.type).toBeNull();
  });

  it('detecta objeção de preço', () => {
    const { result } = renderHook(() =>
      useObjectionHandler({ clientText: 'Está muito caro, não vou conseguir pagar isso.' }),
    );
    expect(result.current.detected).toBe(true);
    expect(result.current.type).toBe('preco');
    expect(result.current.treatmentSteps.length).toBeGreaterThan(0);
    expect(result.current.suggestedReply).toBeTruthy();
  });

  it('detecta objeção de prazo', () => {
    const { result } = renderHook(() =>
      useObjectionHandler({ clientText: 'Preciso com urgência, não tenho tempo de esperar.' }),
    );
    expect(result.current.detected).toBe(true);
    expect(result.current.type).toBe('prazo');
  });

  it('detecta objeção de quantidade mínima', () => {
    const { result } = renderHook(() =>
      useObjectionHandler({ clientText: 'Preciso de poucas unidades apenas.' }),
    );
    expect(result.current.detected).toBe(true);
    expect(result.current.type).toBe('quantidade_minima');
  });

  it('detecta objeção de concorrente', () => {
    const { result } = renderHook(() =>
      useObjectionHandler({ clientText: 'Cotei em outra empresa e ficou mais barato.' }),
    );
    expect(result.current.detected).toBe(true);
    expect(result.current.type).toBe('concorrente');
  });

  it('detecta "vou pensar" como objeção genérica', () => {
    const { result } = renderHook(() =>
      useObjectionHandler({ clientText: 'Vou pensar e te retorno.' }),
    );
    expect(result.current.detected).toBe(true);
    expect(result.current.type).toBe('generica');
  });

  it('sinaliza smokescreen em "vou pensar" com sinal de compra no contexto', () => {
    const { result } = renderHook(() =>
      useObjectionHandler({ clientText: 'Vou pensar, mas gostei bastante.' }),
    );
    expect(result.current.isSmokescreen).toBe(true);
  });
});

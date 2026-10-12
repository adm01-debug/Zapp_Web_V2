import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { isBenignClientNoise, createClientErrorHandlers } from '@/lib/clientNoise';

// Raiz do projeto (o vitest roda com cwd na raiz). Leitura só para provar onde os
// listeners globais são registrados — não depende do conteúdo do módulo.
const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
const mainSource = readFileSync(resolve(process.cwd(), 'src/main.tsx'), 'utf8');

function listenersIn(source: string, name: string): number {
  return source.split(`addEventListener('${name}'`).length - 1;
}

describe('isBenignClientNoise — ruído benigno do browser', () => {
  it('reconhece ResizeObserver loop (as duas redações do browser)', () => {
    expect(isBenignClientNoise(new Error('ResizeObserver loop limit exceeded'))).toBe(true);
    expect(
      isBenignClientNoise(new Error('ResizeObserver loop completed with undelivered notifications.'))
    ).toBe(true);
  });

  it('reconhece o "Script error." sem detalhes (vindo como string ou ErrorEvent.message)', () => {
    expect(isBenignClientNoise('Script error.')).toBe(true);
    expect(isBenignClientNoise(new Error('Script error.'))).toBe(true);
  });

  it('reconhece origens de extensão do browser', () => {
    expect(isBenignClientNoise('chrome-extension://abcdef/inject.js')).toBe(true);
    expect(isBenignClientNoise('moz-extension://uuid/content.js')).toBe(true);
    expect(isBenignClientNoise('Extension context invalidated.')).toBe(true);
  });

  it('reconhece AbortError de navegação', () => {
    const abort = new Error('The operation was aborted.');
    abort.name = 'AbortError';
    expect(isBenignClientNoise(abort)).toBe(true);
  });

  it('reconhece o ruído por error.name que os handlers já silenciavam (TimeoutError/InvalidStateError)', () => {
    const timeout = new Error('skipWaiting timed out');
    timeout.name = 'TimeoutError';
    const invalid = new Error('database connection is closing');
    invalid.name = 'InvalidStateError';
    expect(isBenignClientNoise(timeout)).toBe(true);
    expect(isBenignClientNoise(invalid)).toBe(true);
  });

  it('NÃO filtra erro real (nada de suprimir demais)', () => {
    expect(isBenignClientNoise(new TypeError('Cannot read properties of undefined'))).toBe(false);
    expect(isBenignClientNoise(new ReferenceError('ResizeObserver is not defined'))).toBe(false);
    // 'Script error.' COM detalhes é acionável — não é o ruído cross-origin puro.
    expect(isBenignClientNoise('Script error: TypeError: x is not a function')).toBe(false);
    expect(isBenignClientNoise('Failed to execute script error handler')).toBe(false);
    expect(isBenignClientNoise(undefined)).toBe(false);
    expect(isBenignClientNoise(null)).toBe(false);
  });
});

describe('handlers globais — ruído não reporta, erro real reporta uma vez', () => {
  const makeHandlers = () => {
    const logError = vi.fn();
    const report = vi.fn();
    return { ...createClientErrorHandlers({ logError, report }), logError, report };
  };

  const rejectionEvent = (reason: unknown) => ({
    reason,
    preventDefault: vi.fn(),
  }) as unknown as PromiseRejectionEvent;

  const errorEvent = (error: unknown, message = '') => ({
    error,
    message,
    preventDefault: vi.fn(),
  }) as unknown as ErrorEvent;

  it('rejeição de ruído é silenciada: sem log e sem reportClientError', () => {
    const h = makeHandlers();
    const event = rejectionEvent(new Error('ResizeObserver loop limit exceeded'));
    h.onUnhandledRejection(event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(h.logError).not.toHaveBeenCalled();
    expect(h.report).not.toHaveBeenCalled();
  });

  it('erro de window de ruído (Script error.) é silenciado', () => {
    const h = makeHandlers();
    const event = errorEvent(undefined, 'Script error.');
    h.onWindowError(event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(h.logError).not.toHaveBeenCalled();
    expect(h.report).not.toHaveBeenCalled();
  });

  it('erro real é logado uma única vez e reportado uma única vez', () => {
    const h = makeHandlers();
    const boom = new TypeError('boom');
    h.onUnhandledRejection(rejectionEvent(boom));
    expect(h.logError).toHaveBeenCalledTimes(1);
    expect(h.report).toHaveBeenCalledTimes(1);
    expect(h.report).toHaveBeenCalledWith(boom, { source: 'unhandledrejection' });
  });

  it('erro real de window é reportado com a origem window.onerror', () => {
    const h = makeHandlers();
    const boom = new RangeError('boom');
    h.onWindowError(errorEvent(boom));
    expect(h.logError).toHaveBeenCalledTimes(1);
    expect(h.report).toHaveBeenCalledTimes(1);
    expect(h.report).toHaveBeenCalledWith(boom, { source: 'window.onerror' });
  });
});

describe('registro único — sem listener duplicado entre App.tsx e main.tsx', () => {
  it('App.tsx não registra mais os listeners globais de erro', () => {
    expect(listenersIn(appSource, 'unhandledrejection')).toBe(0);
    expect(listenersIn(appSource, 'error')).toBe(0);
  });

  it('main.tsx registra exatamente um par de listeners', () => {
    expect(listenersIn(mainSource, 'unhandledrejection')).toBe(1);
    expect(listenersIn(mainSource, 'error')).toBe(1);
  });
});

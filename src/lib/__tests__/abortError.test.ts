import { describe, expect, it } from 'vitest';
import { isAbortLikeError, isIntentionalAbort } from '../abortError';

describe('isIntentionalAbort — aborto por nome, nunca por texto', () => {
  it('reconhece DOMException e Error com name=AbortError', () => {
    expect(isIntentionalAbort(new DOMException('Page unload', 'AbortError'))).toBe(true);
    const err = new Error('The operation was aborted.');
    err.name = 'AbortError';
    expect(isIntentionalAbort(err)).toBe(true);
  });

  it('nao confunde erro comum nem DOMException de outro tipo', () => {
    expect(isIntentionalAbort(new Error('network down'))).toBe(false);
    expect(isIntentionalAbort(new TypeError('Failed to fetch'))).toBe(false);
    expect(isIntentionalAbort(new DOMException('timeout', 'TimeoutError'))).toBe(false);
    expect(isIntentionalAbort({ name: 'AbortError' })).toBe(false);
    expect(isIntentionalAbort(null)).toBe(false);
    expect(isIntentionalAbort('AbortError solto')).toBe(false);
  });
});

describe('isAbortLikeError — padrao PostgREST e semaforo', () => {
  it.each([
    { message: 'AbortError: The operation was aborted' },
    { message: 'signal is aborted without reason' },
    { message: 'AbortError: Supabase slot acquire aborted' },
    { message: 'Request cancelled during page unload' },
  ])('reconhece aborto embrulhado: $message', (erro) => {
    expect(isAbortLikeError(erro)).toBe(true);
  });

  it('nao esconde falhas comuns nem valores invalidos', () => {
    expect(isAbortLikeError(new Error('network unavailable'))).toBe(false);
    expect(isAbortLikeError({ message: 'permission denied' })).toBe(false);
    expect(isAbortLikeError(null)).toBe(false);
    expect(isAbortLikeError('AbortError como string solta')).toBe(false);
  });
});

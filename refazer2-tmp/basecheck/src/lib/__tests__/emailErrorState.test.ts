import { describe, expect, it, vi } from 'vitest';
import { classifyEmailError, emailLoadErrorCopy, isEmailOutcomeUnknown } from '@/lib/emailErrorState';

describe('emailErrorState', () => {
  it('distingue offline, permissão, autenticação, limite e servidor', () => {
    expect(classifyEmailError({ name: 'FunctionsFetchError', message: 'Failed to fetch' })).toBe('offline');
    expect(classifyEmailError({ context: { status: 403 } })).toBe('permission');
    expect(classifyEmailError({ context: { status: 401 } })).toBe('authentication');
    expect(classifyEmailError({ context: { status: 429 } })).toBe('rate-limit');
    expect(classifyEmailError({ context: { status: 503 } })).toBe('server');
  });

  it('considera transporte e respostas 5xx inconclusivos para envio', () => {
    expect(isEmailOutcomeUnknown({ name: 'FunctionsFetchError' })).toBe(true);
    expect(isEmailOutcomeUnknown({ name: 'FunctionsRelayError' })).toBe(true);
    expect(isEmailOutcomeUnknown({ context: { status: 503 } })).toBe(true);
    expect(isEmailOutcomeUnknown({ context: { status: 403 } })).toBe(false);
  });

  it('fornece mensagens operacionais sem expor detalhes internos', () => {
    expect(emailLoadErrorCopy({ context: { status: 403 } }).title).toContain('não autorizado');
    vi.stubGlobal('navigator', { onLine: false });
    expect(emailLoadErrorCopy(new Error('qualquer')).title).toContain('offline');
    vi.unstubAllGlobals();
  });
});

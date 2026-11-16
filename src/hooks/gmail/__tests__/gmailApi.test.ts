import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: mocks.getSession }, functions: { invoke: mocks.invoke } },
}));

import { callGmailFunction, GmailFunctionError } from '../gmailApi';

describe('callGmailFunction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'token-de-teste' } } });
  });

  it('preserva status e classifica 403 como rejeição conclusiva', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { name: 'FunctionsHttpError', message: 'Forbidden', context: { status: 403 } } });
    const error = await callGmailFunction('gmail-send', { action: 'send' }).catch(value => value);
    expect(error).toBeInstanceOf(GmailFunctionError);
    expect(error).toMatchObject({ kind: 'permission', status: 403, outcomeUnknown: false });
  });

  it('marca falha de transporte como resultado inconclusivo', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { name: 'FunctionsFetchError', message: 'Failed to fetch' } });
    const error = await callGmailFunction('gmail-send', { action: 'send' }).catch(value => value);
    expect(error).toMatchObject({ kind: 'offline', outcomeUnknown: true });
  });

  it('lê o `code` do corpo JSON da Response de erro', async () => {
    const context = new Response(JSON.stringify({ code: 'reauth_required', error: 'x' }), { status: 409 });
    mocks.invoke.mockResolvedValue({ data: null, error: { name: 'FunctionsHttpError', message: 'non-2xx', context } });
    const error = await callGmailFunction('gmail-sync', { action: 'sync-inbox' }).catch(value => value);
    expect(error).toMatchObject({ status: 409, code: 'reauth_required' });
  });

  it('corpo não-JSON ou já consumido não quebra: fica sem `code`', async () => {
    const context = new Response('<html>bad gateway</html>', { status: 502 });
    mocks.invoke.mockResolvedValue({ data: null, error: { name: 'FunctionsHttpError', message: 'non-2xx', context } });
    const error = await callGmailFunction('gmail-sync', { action: 'sync-inbox' }).catch(value => value);
    expect(error).toBeInstanceOf(GmailFunctionError);
    expect(error.code).toBeUndefined();
    expect(error.status).toBe(502);
  });

  it('não invoca função sem uma sessão autenticada', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    await expect(callGmailFunction('gmail-send', { action: 'send' })).rejects.toThrow('Not authenticated');
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});

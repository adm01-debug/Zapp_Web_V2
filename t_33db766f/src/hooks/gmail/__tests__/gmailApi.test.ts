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

  it('não invoca função sem uma sessão autenticada', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    await expect(callGmailFunction('gmail-send', { action: 'send' })).rejects.toThrow('Not authenticated');
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});

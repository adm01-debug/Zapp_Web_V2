import { beforeEach, describe, expect, it } from 'vitest';

import { SUPABASE_URL } from '@/config/supabase';
import { readAuthenticatedUserId } from '../authenticatedUserId';

const chaveDoProjeto = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
const sessao = (userId: string) => JSON.stringify({ access_token: 't', user: { id: userId } });

describe('readAuthenticatedUserId', () => {
  beforeEach(() => localStorage.clear());

  it('lê a sessão do projeto configurado', () => {
    localStorage.setItem(chaveDoProjeto, sessao('usuario-certo'));
    expect(readAuthenticatedUserId()).toBe('usuario-certo');
  });

  it('ignora sessão de outro projeto, mesmo vindo primeiro no storage', () => {
    localStorage.setItem('sb-outroprojeto-auth-token', sessao('usuario-alheio'));
    localStorage.setItem(chaveDoProjeto, sessao('usuario-certo'));
    expect(readAuthenticatedUserId()).toBe('usuario-certo');
  });

  it('sem sessão do projeto configurado devolve null', () => {
    localStorage.setItem('sb-outroprojeto-auth-token', sessao('usuario-alheio'));
    expect(readAuthenticatedUserId()).toBeNull();
  });
});

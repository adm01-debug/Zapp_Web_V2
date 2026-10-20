/**
 * `createSafeStorage` — adapter de storage do cliente Supabase.
 *
 * Antes o `client.ts` passava `window.localStorage` direto: em modo privado /
 * com cookies bloqueados, o MESMO acesso à propriedade pode lançar
 * (SecurityError) já no import do módulo e derrubar a página. O adapter tem de
 * sobreviver à leitura bloqueada e à escrita bloqueada, caindo para memória.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSafeStorage } from '@/lib/safeStorage';

describe('createSafeStorage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('persiste no localStorage quando ele está disponível', () => {
    const storage = createSafeStorage();
    storage.setItem('zapp-sessao', 'token-1');
    expect(localStorage.getItem('zapp-sessao')).toBe('token-1');
    expect(storage.getItem('zapp-sessao')).toBe('token-1');
    storage.removeItem('zapp-sessao');
    expect(storage.getItem('zapp-sessao')).toBeNull();
  });

  it('cai para a memória quando o acesso ao localStorage lança', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('SecurityError: cookies bloqueados');
    });

    // Criar o adapter não pode lançar (é o que derrubava o boot da página).
    const storage = createSafeStorage();

    expect(storage.getItem('zapp-sessao')).toBeNull();
    storage.setItem('zapp-sessao', 'token-2');
    expect(storage.getItem('zapp-sessao')).toBe('token-2');
    storage.removeItem('zapp-sessao');
    expect(storage.getItem('zapp-sessao')).toBeNull();
  });

  it('mantém o valor em memória quando a escrita no localStorage falha', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    const storage = createSafeStorage();
    storage.setItem('zapp-sessao', 'token-3');

    expect(storage.getItem('zapp-sessao')).toBe('token-3');
  });
});

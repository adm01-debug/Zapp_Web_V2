import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useMediaVolume } from '@/hooks/communication/useMediaVolume';

/**
 * Q02 (S33–S35, D07/B7) — o hook é a superfície real dos players e do
 * `MediaVolumeControl`. Ele NÃO é montado sob `AuthProvider` (os players vivem
 * fora dele e `useAuth` lança fora do provider), então a identidade do volume é
 * resolvida dentro do store, a partir da sessão que o `supabase-js` já persiste
 * no `localStorage` — o mesmo padrão de `e2e/fixtures/e2e-contact.ts`.
 *
 * Estes testes provam, pela superfície que o usuário toca, que o valor é lido e
 * gravado nas chaves do usuário logado, que trocar de usuário troca de chave (o
 * bug B7 era justamente dois usuários no mesmo navegador dividindo o valor) e
 * que o formato do retorno não mudou.
 */
const SESSAO = 'sb-testref-auth-token';

/** Sessão falsa no formato que o `supabase-js` grava (só o que o store lê). */
const sessaoDe = (userId: string): void => {
  window.localStorage.setItem(
    SESSAO,
    JSON.stringify({ access_token: 'token-de-teste', user: { id: userId } }),
  );
};

describe('useMediaVolume — volume por usuário no aparelho (Q02/S33)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('lê e grava nas chaves do usuário logado, sem AuthProvider', () => {
    sessaoDe('u1');
    const { result } = renderHook(() => useMediaVolume());

    expect(result.current.volume).toBe(80);
    expect(result.current.muted).toBe(false);

    act(() => result.current.setVolume(45));
    expect(result.current.volume).toBe(45);
    expect(result.current.gain).toBeCloseTo(0.2025, 10);
    expect(window.localStorage.getItem('zapp.media.volume.u1')).toBe('45');

    act(() => result.current.toggleMuted());
    expect(result.current.muted).toBe(true);
    expect(window.localStorage.getItem('zapp.media.muted.u1')).toBe('true');

    // a chave antiga (sem usuário) não é mais escrita por quem está logado
    expect(window.localStorage.getItem('zapp.media.volume')).toBeNull();
    expect(window.localStorage.getItem('zapp.media.muted')).toBeNull();
  });

  it('a API do hook não mudou (contrato com players e MediaVolumeControl)', () => {
    sessaoDe('u1');
    const { result } = renderHook(() => useMediaVolume());

    expect(Object.keys(result.current).sort()).toEqual([
      'gain',
      'isSupported',
      'muted',
      'setMuted',
      'setVolume',
      'toggleMuted',
      'volume',
    ]);
    expect(result.current.toggleMuted).toBeTypeOf('function');
    expect(result.current.setMuted).toBeTypeOf('function');
  });

  it('usuário trocado na mesma aba passa a ler e a gravar na chave do novo usuário', () => {
    sessaoDe('u1');
    const { result, rerender } = renderHook(() => useMediaVolume());
    act(() => result.current.setVolume(35));
    expect(window.localStorage.getItem('zapp.media.volume.u1')).toBe('35');

    act(() => sessaoDe('u2'));
    rerender();

    // não herda o valor do primeiro usuário (B7)
    expect(result.current.volume).toBe(80);

    act(() => result.current.setVolume(15));
    expect(window.localStorage.getItem('zapp.media.volume.u2')).toBe('15');
    expect(window.localStorage.getItem('zapp.media.volume.u1')).toBe('35');
  });
});

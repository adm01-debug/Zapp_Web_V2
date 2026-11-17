import { describe, it, expect, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCustomShortcuts } from '../useCustomShortcuts';

/**
 * Melhoria recuperada da branch `claude/ga-ci-verde-261020` (bloco C, veredito em
 * `analise-prs/VEREDITOS-BLOCO-C-261117.md`).
 *
 * O rótulo do atalho anunciava `Ctrl` em toda plataforma. No Mac a tecla é `⌘` e
 * não existe `Ctrl` com essa função: o usuário lia uma instrução que não dava
 * para seguir.
 */

const original = Object.getOwnPropertyDescriptor(navigator, 'platform');

function fingirPlataforma(valor: string) {
  Object.defineProperty(navigator, 'platform', { value: valor, configurable: true });
}

afterEach(() => {
  if (original) Object.defineProperty(navigator, 'platform', original);
});

function primeiroAtalhoComCtrl(formatar: (s: never) => string[], atalhos: unknown[]) {
  for (const a of atalhos as Array<{ defaultModifiers?: { ctrlKey?: boolean } }>) {
    if (a.defaultModifiers?.ctrlKey) return formatar(a as never);
  }
  return null;
}

describe('useCustomShortcuts — rótulo do modificador por plataforma', () => {
  it('no Mac mostra ⌘ em vez de Ctrl', () => {
    fingirPlataforma('MacIntel');
    const { result } = renderHook(() => useCustomShortcuts());
    const partes = primeiroAtalhoComCtrl(result.current.formatShortcut, result.current.shortcuts);

    expect(partes).not.toBeNull();
    expect(partes).toContain('⌘');
    expect(partes).not.toContain('Ctrl');
  });

  it('fora do Mac segue mostrando Ctrl', () => {
    fingirPlataforma('Win32');
    const { result } = renderHook(() => useCustomShortcuts());
    const partes = primeiroAtalhoComCtrl(result.current.formatShortcut, result.current.shortcuts);

    expect(partes).toContain('Ctrl');
    expect(partes).not.toContain('⌘');
  });

  it('plataforma vazia (SSR, nó) cai em Ctrl, como antes', () => {
    fingirPlataforma('');
    const { result } = renderHook(() => useCustomShortcuts());
    const partes = primeiroAtalhoComCtrl(result.current.formatShortcut, result.current.shortcuts);

    expect(partes).toContain('Ctrl');
  });
});

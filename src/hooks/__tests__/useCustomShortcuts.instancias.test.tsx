/**
 * R2-PLAT-008 — editar atalhos em instâncias separadas.
 *
 * A tela de Configurações monta um `useCustomShortcuts()` por linha de atalho e
 * o registry global monta outro; enquanto cada instância tiver estado próprio,
 * carregado do `localStorage` só no mount:
 *   1. a edição feita numa instância não chega às outras — o listener global
 *      segue com a combinação antiga e o painel não atualiza o que exibe;
 *   2. `saveShortcuts` grava o conjunto COMPLETO da instância que editou, então
 *      a segunda edição apaga a primeira que já estava no storage.
 *
 * Aqui se usam duas instâncias separadas de verdade (`renderHook` duas vezes) e o
 * listener global de produção (`useGlobalKeyboardShortcuts`), com o evento que
 * ele despacha (`toggle-sidebar`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, renderHook, act, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

import { useCustomShortcuts } from '@/hooks/ui/useCustomShortcuts';
import { useGlobalKeyboardShortcuts } from '@/hooks/ui/useGlobalKeyboardShortcuts';
import { KeyboardShortcutsSettings } from '@/components/settings/KeyboardShortcutsSettings';
import { log } from '@/lib/logger';

const CHAVE = 'custom-keyboard-shortcuts';

/** O que está gravado no storage agora (o mapa de personalizações). */
function gravados(): Record<string, { key: string; modifiers: Record<string, boolean> }> {
  return JSON.parse(localStorage.getItem(CHAVE) ?? '{}');
}

/** Uma instância do hook — é assim que cada linha de atalho e o registry montam. */
function instancia() {
  return renderHook(() => useCustomShortcuts());
}

function Registry() {
  useGlobalKeyboardShortcuts();
  return null;
}

function montarRegistry() {
  window.history.replaceState(null, '', '/?view=inbox');
  render(
    <MemoryRouter>
      <Registry />
    </MemoryRouter>
  );
}

function teclar(key: string, extra: KeyboardEventInit = {}) {
  fireEvent.keyDown(window, { key, ...extra });
}

describe('R2-PLAT-008 — atalhos personalizados em instâncias separadas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // O store é compartilhado por toda a aba: zera pela própria API pública
    // (é o mesmo caminho do botão "Restaurar Padrões") antes de cada caso.
    localStorage.clear();
    const limpeza = instancia();
    act(() => { limpeza.result.current.resetAllShortcuts(); });
    limpeza.unmount();
    localStorage.clear();
  });

  it('duas edições seguidas em instâncias separadas preservam as duas', () => {
    const a = instancia();
    const b = instancia();

    act(() => { a.result.current.updateShortcut('send-message', 'j', { ctrlKey: true }); });
    act(() => { b.result.current.updateShortcut('clear-selection', 'w', { ctrlKey: true, shiftKey: true }); });

    // A segunda gravação não pode apagar a primeira.
    expect(gravados()['send-message']).toEqual({ key: 'j', modifiers: { ctrlKey: true } });
    expect(gravados()['clear-selection']).toEqual({ key: 'w', modifiers: { ctrlKey: true, shiftKey: true } });

    // E a instância A enxerga o que a B personalizou (e vice-versa).
    expect(a.result.current.getShortcutById('clear-selection')?.customKey).toBe('w');
    expect(b.result.current.getShortcutById('send-message')?.customKey).toBe('j');
  });

  it('o listener global passa a consumir a combinação nova e abandona a antiga', () => {
    montarRegistry();
    const ouvir = vi.fn();
    document.addEventListener('toggle-sidebar', ouvir);

    // Outra instância (a tela de Configurações) troca Ctrl+B por Ctrl+J.
    const settings = instancia();
    act(() => { settings.result.current.updateShortcut('toggle-sidebar', 'j', { ctrlKey: true }); });

    teclar('j', { ctrlKey: true });
    expect(ouvir).toHaveBeenCalledTimes(1);

    // A combinação antiga não dispara mais nada.
    teclar('b', { ctrlKey: true });
    expect(ouvir).toHaveBeenCalledTimes(1);

    document.removeEventListener('toggle-sidebar', ouvir);
  });

  it('resetar numa instância reflete na outra e limpa a preferência gravada', () => {
    const a = instancia();
    const b = instancia();

    act(() => { a.result.current.updateShortcut('send-message', 'j', { ctrlKey: true }); });
    expect(gravados()['send-message']).toBeDefined();

    act(() => { b.result.current.resetShortcut('send-message'); });

    expect(gravados()['send-message']).toBeUndefined();
    expect(a.result.current.getShortcutById('send-message')?.customKey).toBeUndefined();
    expect(b.result.current.getShortcutById('send-message')?.customKey).toBeUndefined();
  });

  it('remontar sem perder a primeira personalização', () => {
    const a = instancia();
    act(() => { a.result.current.updateShortcut('send-message', 'j', { ctrlKey: true }); });
    const b = instancia();
    act(() => { b.result.current.updateShortcut('clear-selection', 'w', { ctrlKey: true }); });

    a.unmount();
    b.unmount();

    // Remontagem (nova aba de Configurações) lê a preferência vigente.
    const c = instancia();
    expect(c.result.current.getShortcutById('send-message')?.customKey).toBe('j');
    expect(c.result.current.getShortcutById('clear-selection')?.customKey).toBe('w');
  });

  it('a gravação é um modo único: confirmar em outra instância grava a tecla capturada', () => {
    const a = instancia();
    const b = instancia();

    act(() => { a.result.current.startRecording('send-message'); });
    // Só a instância que abriu a gravação não basta: a tecla é capturada e a
    // confirmação vem do botão da linha, que tem a própria instância do hook.
    teclar('j', { ctrlKey: true });
    act(() => { b.result.current.stopRecording(); });

    expect(gravados()['send-message']).toEqual({ key: 'j', modifiers: { ctrlKey: true } });
    expect(b.result.current.getShortcutById('send-message')?.customKey).toBe('j');
    expect(b.result.current.isRecording).toBeNull();
  });

  it('preferência gravada fora do store (outra aba) é adotada por toda a instância', () => {
    const a = instancia();

    localStorage.setItem(CHAVE, JSON.stringify({ 'send-message': { key: 'j', modifiers: { ctrlKey: true } } }));
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: CHAVE })); });

    expect(a.result.current.getShortcutById('send-message')?.customKey).toBe('j');
    expect(a.result.current.formatShortcut(a.result.current.getShortcutById('send-message')!)).toEqual(['Ctrl', 'j']);
  });

  it('gravação de outra aba ilegível não apaga a preferência vigente (registra o erro)', () => {
    const a = instancia();
    act(() => { a.result.current.updateShortcut('send-message', 'j', { ctrlKey: true }); });

    localStorage.setItem(CHAVE, '{isso não é json');
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: CHAVE })); });

    expect(log.error).toHaveBeenCalled();
    expect(a.result.current.getShortcutById('send-message')?.customKey).toBe('j');
  });

  it('a tela de Configurações (pai + linhas, cada uma com sua instância) exibe a edição de fora', () => {
    const tela = render(<KeyboardShortcutsSettings />);
    // Quem edita é outra instância do hook (o registry global, o painel de ajuda).
    const outro = instancia();
    act(() => { outro.result.current.updateShortcut('send-message', 'j', { ctrlKey: true }); });

    expect(tela.getByText('Personalizado')).toBeDefined();
    expect(tela.getByText('j')).toBeDefined();
    expect(tela.queryByText('Enter')).toBeNull();
  });
});

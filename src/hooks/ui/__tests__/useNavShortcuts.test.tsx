/**
 * E08 — o atalho Alt+P deixa de existir (plano da fusão Quadro→Tarefas, decisão E04).
 *
 * `useNavShortcuts` é o mapa global de Alt+letra da casca (`AppShell`). Até esta
 * etapa o hook não tinha teste: tirar `KeyP` não era provado por nada e uma
 * regressão (recolocar a tecla) passaria batido — a entrada "Quadro" do menu é
 * a mesma tela de Tarefas, e o atalho era uma segunda porta para ela.
 *
 * O teste chama o hook REAL e fixa as duas pontas: Alt+K continua levando a
 * Tarefas, Alt+P não navega para lugar nenhum. A chave é o `event.code` (tecla
 * física), não o `event.key`: no macOS o Alt compõe caracteres ("Option+P" vira
 * "π") e só o código continua estável — o próprio hook documenta isso.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { useNavShortcuts } from '@/hooks/ui/useNavShortcuts';

/** Dispara Alt+<código da tecla> na janela, como o navegador faz. */
function teclar(codigo: string, extra: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', {
    code: codigo,
    altKey: true,
    bubbles: true,
    cancelable: true,
    ...extra,
  });
  window.dispatchEvent(event);
  return event;
}

describe('E08 — Alt+P não navega mais para o módulo Quadro', () => {
  let onNavigate: Mock<(viewId: string) => void>;

  beforeEach(() => {
    onNavigate = vi.fn<(viewId: string) => void>();
    renderHook(() => useNavShortcuts(onNavigate));
  });

  afterEach(() => {
    cleanup();
  });

  it('Alt+K navega para tasks', () => {
    const event = teclar('KeyK');

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith('tasks');
    // caminho que FUNCIONA segue consumindo o evento (não vaza para o navegador)
    expect(event.defaultPrevented).toBe(true);
  });

  it('Alt+P não navega para lugar nenhum', () => {
    const event = teclar('KeyP');

    expect(onNavigate).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalledWith('pipeline');
    expect(event.defaultPrevented).toBe(false);
  });
});

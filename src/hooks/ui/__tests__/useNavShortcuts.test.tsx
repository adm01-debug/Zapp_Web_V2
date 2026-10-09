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
import { NavigationService } from '@/services/navigation.service';

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

/**
 * FASE 5 do design system Promo Gifts — o atalho ANUNCIADO na sidebar tem de
 * navegar. A nav primária (`NavigationService.getPrimaryNav`) publica o
 * `shortcut` que a sidebar mostra no `kbd` (`SidebarNavItem`), mas nada obrigava
 * o mapa de Alt+letra do shell (`SHORTCUT_TO_VIEW`) a ter a tecla: a tela
 * anunciava "Alt+A" no Catálogo e "Alt+Q" nas Conquistas e apertar o atalho não
 * fazia nada — o usuário seguia a dica da própria tela e ficava parado.
 *
 * O teste lê o anúncio REAL (NavigationService) e aperta a tecla física
 * (`event.code`, o mesmo motivo documentado no hook: no macOS o Alt compõe
 * caracteres em `event.key`), esperando a navegação — o par anúncio/handler
 * tem de bater. Cobre só as teclas que este hook é dono: Alt+T/Telefonia
 * colide com o binding global 'open-tasks-tab' (`defaultShortcuts.ts`) e é
 * tratado fora daqui.
 */
describe('FASE 5 — atalho anunciado na nav primária navega', () => {
  afterEach(() => {
    cleanup();
  });

  const anuncios = NavigationService.getPrimaryNav().filter(
    (item) => item.id === 'catalog' || item.id === 'achievements'
  );

  it('a nav primária anuncia Alt+A no Catálogo e Alt+Q nas Conquistas', () => {
    expect(anuncios.map((item) => [item.id, item.shortcut])).toEqual([
      ['catalog', 'Alt+A'],
      ['achievements', 'Alt+Q'],
    ]);
  });

  // Os casos saem do anúncio REAL (a mesma fonte que o `kbd` da sidebar usa): o
  // teste não monta a tecla à mão, ele aperta a letra que a tela promete.
  it.each(anuncios.map((item) => [item.id, item.shortcut ?? '']))(
    '%s: o atalho anunciado (%s) navega para a view',
    (viewId, anuncio) => {
      const onNavigate = vi.fn<(viewId: string) => void>();
      renderHook(() => useNavShortcuts(onNavigate));

      const event = teclar(anuncio.replace('Alt+', 'Key'));

      expect(onNavigate).toHaveBeenCalledTimes(1);
      expect(onNavigate).toHaveBeenCalledWith(viewId);
      // atalho que FUNCIONA consome o evento (não vaza para o navegador)
      expect(event.defaultPrevented).toBe(true);
    }
  );
});

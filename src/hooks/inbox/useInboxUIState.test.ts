import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInboxUIState } from './useInboxUIState';

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
}

describe('useInboxUIState', () => {
  const originalWidth = window.innerWidth;

  afterEach(() => {
    setViewportWidth(originalWidth);
    window.history.replaceState(null, '', '/');
  });

  it('starts with showDetails=false no celular (evita o painel abrir sozinho e tampar o chat)', () => {
    setViewportWidth(390);
    const { result } = renderHook(() => useInboxUIState());
    expect(result.current.showDetails).toBe(false);
  });

  it('starts with showDetails=true no desktop (comportamento atual preservado)', () => {
    setViewportWidth(1280);
    const { result } = renderHook(() => useInboxUIState());
    expect(result.current.showDetails).toBe(true);
  });

  it('toggleDetails abre o painel no celular quando o agente pede explicitamente', () => {
    setViewportWidth(390);
    const { result } = renderHook(() => useInboxUIState());
    expect(result.current.showDetails).toBe(false);
    act(() => result.current.toggleDetails());
    expect(result.current.showDetails).toBe(true);
  });

  // SL-206 / etapa 064 — deep link `?view=inbox&contact=<id>`: o link colado no
  // chat interno (ou vindo de qualquer tela) abre a conversa daquele contato. O
  // parâmetro alimenta o mesmo `pendingContactId` já consumido pelo
  // RealtimeInboxView (seleciona a conversa, marca como lida e limpa o pendente).
  describe('deep link ?contact=', () => {
    it('nasce com a conversa pendente do contato do link', () => {
      window.history.replaceState(null, '', '/?view=inbox&contact=c9');
      const { result } = renderHook(() => useInboxUIState());
      expect(result.current.pendingContactId).toBe('c9');
    });

    it('sem ?contact= não abre conversa nenhuma (comportamento anterior preservado)', () => {
      window.history.replaceState(null, '', '/?view=inbox');
      const { result } = renderHook(() => useInboxUIState());
      expect(result.current.pendingContactId).toBeNull();
    });

    it('?contact= vazio ou só com espaços não abre conversa (não busca id inválido)', () => {
      window.history.replaceState(null, '', '/?view=inbox&contact=');
      const c1 = renderHook(() => useInboxUIState());
      expect(c1.result.current.pendingContactId).toBeNull();

      window.history.replaceState(null, '', '/?view=inbox&contact=%20%20');
      const c2 = renderHook(() => useInboxUIState());
      expect(c2.result.current.pendingContactId).toBeNull();
    });

    it('?contact= convive com os demais filtros da URL (não é confundido com eles)', () => {
      window.history.replaceState(null, '', '/?view=inbox&q=ana&status=unread&contact=c9');
      const { result } = renderHook(() => useInboxUIState());
      expect(result.current.pendingContactId).toBe('c9');
    });
  });
});

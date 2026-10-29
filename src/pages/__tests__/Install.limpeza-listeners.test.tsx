/**
 * Polimento das telas de auth (t_051c55b9).
 *
 * Antes: o listener de "appinstalled" era registrado com uma arrow inline e
 * nunca removido — o cleanup só tratava "beforeinstallprompt". Ao desmontar a
 * tela, sobrava um handler vivo mexendo no estado de um componente morto.
 * Agora os dois listeners são removidos no cleanup.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import Install from '../Install';

type ListenerCall = [string, EventListenerOrEventListenerObject];

function cenario() {
  return render(
    <MemoryRouter>
      <Install />
    </MemoryRouter>,
  );
}

describe('Install — limpeza dos listeners do PWA (t_051c55b9)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('remove o listener de "appinstalled" ao desmontar', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = cenario();

    const added = addSpy.mock.calls as unknown as ListenerCall[];
    const handlerAppInstalled = added.find((c) => c[0] === 'appinstalled')?.[1];
    expect(typeof handlerAppInstalled).toBe('function');

    unmount();

    const removed = removeSpy.mock.calls as unknown as ListenerCall[];
    const removido = removed.find((c) => c[0] === 'appinstalled')?.[1];
    expect(removido).toBe(handlerAppInstalled);
  });

  it('ainda atualiza o estado quando o app é instalado (listener ativo)', () => {
    cenario();

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(screen.getByText('App já instalado!')).toBeTruthy();
  });
});

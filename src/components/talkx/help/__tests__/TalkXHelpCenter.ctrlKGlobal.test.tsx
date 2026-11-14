import { act, cleanup, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

import { useGlobalKeyboardShortcuts } from '@/hooks/ui/useGlobalKeyboardShortcuts';
import { CTRL_K_LOCAL_ATTRIBUTE } from '@/hooks/ui/ctrlKLocal';
import { TalkXHelpCenter } from '../TalkXHelpCenter';
import type { TalkXHelpRoute } from '../talkxHelpRoute';

// Defeito (E2E talkx.spec.ts:108, instável no webkit; reproduzido 20/20 em
// navegador real): o registry global de atalhos é montado pelo shell ANTES da
// Ajuda e escuta a janela em captura, como a Ajuda. O `stopPropagation` da
// Ajuda não alcança um listener do mesmo alvo, então o Ctrl+K da Ajuda também
// disparava `open-global-search` e a paleta de comandos abria por cima.

function Registry() {
  useGlobalKeyboardShortcuts();
  return null;
}

function Ajuda() {
  const [route, setRoute] = useState<TalkXHelpRoute>({});
  return <TalkXHelpCenter route={route} onRouteChange={setRoute} onClose={() => {}} />;
}

function Shell({ comAjuda }: { comAjuda: boolean }) {
  return (
    <MemoryRouter>
      <Registry />
      {comAjuda ? <Ajuda /> : null}
    </MemoryRouter>
  );
}

function ctrlK() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }));
}

describe('Ctrl+K na Ajuda do Talk X x paleta global', () => {
  let aberturasDaPaleta = 0;
  const contar = () => { aberturasDaPaleta += 1; };

  beforeEach(() => {
    aberturasDaPaleta = 0;
    localStorage.clear();
    window.history.replaceState(null, '', '/?view=talkx&screen=help');
    document.addEventListener('open-global-search', contar);
  });
  afterEach(() => {
    document.removeEventListener('open-global-search', contar);
    cleanup();
    window.history.replaceState(null, '', '/');
  });

  it('sem a Ajuda montada, Ctrl+K abre a paleta (contraprova)', () => {
    render(<Shell comAjuda={false} />);
    act(() => ctrlK());
    expect(aberturasDaPaleta).toBe(1);
  });

  it('com a Ajuda montada depois do registry, Ctrl+K foca a busca e NÃO abre a paleta', async () => {
    const { rerender } = render(<Shell comAjuda={false} />);
    rerender(<Shell comAjuda />);
    const busca = await screen.findByPlaceholderText('O que você precisa de ajuda hoje?');
    busca.blur();

    act(() => ctrlK());

    expect(aberturasDaPaleta).toBe(0);
    expect(document.activeElement).toBe(busca);
    expect(document.querySelector(`[${CTRL_K_LOCAL_ATTRIBUTE}]`)).not.toBeNull();
  });

  it('ao sair da Ajuda, o Ctrl+K volta a abrir a paleta', async () => {
    const { rerender } = render(<Shell comAjuda />);
    await screen.findByPlaceholderText('O que você precisa de ajuda hoje?');
    rerender(<Shell comAjuda={false} />);
    act(() => ctrlK());
    expect(aberturasDaPaleta).toBe(1);
  });
});

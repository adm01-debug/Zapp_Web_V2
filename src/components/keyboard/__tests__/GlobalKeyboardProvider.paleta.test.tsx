import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// O host real carrega o palette rico + os hooks de dados (catálogo, Talk X, busca
// global). Aqui só interessa QUANTAS superfícies o provider abre e fecha — e para
// onde vai o foco. O mock inclui um campo focável para simular a armadilha de foco
// do Dialog real (Radix move o foco para dentro ao abrir).
vi.mock('@/components/keyboard/CommandPaletteHost', () => ({
  CommandPaletteHost: ({ open }: { open: boolean }) =>
    open ? (
      <div role="dialog" aria-label="Paleta de comandos">
        <input aria-label="campo da paleta" />
      </div>
    ) : null,
}));

import { GlobalKeyboardProvider } from '@/components/keyboard/GlobalKeyboardProvider';

function montar() {
  return render(
    <MemoryRouter>
      <GlobalKeyboardProvider>
        <div>app</div>
      </GlobalKeyboardProvider>
    </MemoryRouter>,
  );
}

const paletas = () => screen.queryAllByRole('dialog', { name: 'Paleta de comandos' });

const teclar = (init: KeyboardEventInit) =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', bubbles: true, cancelable: true, ...init }));
  });

describe('GlobalKeyboardProvider — dono único do estado da paleta (R2-INF-035)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('Ctrl+K abre UM diálogo (não dois) e a segunda pressão fecha', async () => {
    montar();

    teclar({ ctrlKey: true });
    await screen.findByRole('dialog', { name: 'Paleta de comandos' });
    expect(paletas()).toHaveLength(1);

    teclar({ ctrlKey: true });
    await waitFor(() => expect(paletas()).toHaveLength(0));
  });

  it('⌘K (Meta+K) abre o MESMO diálogo, uma única vez', async () => {
    montar();

    teclar({ metaKey: true });
    await screen.findByRole('dialog', { name: 'Paleta de comandos' });
    expect(paletas()).toHaveLength(1);
  });

  it('o `open-global-search` dos botões de busca abre a mesma paleta', async () => {
    montar();

    act(() => {
      document.dispatchEvent(new CustomEvent('open-global-search'));
    });
    await screen.findByRole('dialog', { name: 'Paleta de comandos' });
    expect(paletas()).toHaveLength(1);
  });

  it('Ctrl+K fecha e devolve o foco ao elemento de origem (R2-INF-035)', async () => {
    montar();

    const origem = document.createElement('button');
    origem.textContent = 'origem do foco';
    document.body.appendChild(origem);
    try {
      act(() => {
        origem.focus();
      });
      expect(origem).toHaveFocus();

      teclar({ ctrlKey: true });
      await screen.findByRole('dialog', { name: 'Paleta de comandos' });

      // O Dialog real puxa o foco para dentro; sem isso o teste passaria por
      // acidente (o foco nunca teria saído da origem).
      act(() => {
        screen.getByLabelText('campo da paleta').focus();
      });

      teclar({ ctrlKey: true });
      await waitFor(() => expect(paletas()).toHaveLength(0));
      expect(origem).toHaveFocus();
    } finally {
      origem.remove();
    }
  });
});

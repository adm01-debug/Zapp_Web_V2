/**
 * Resgate de `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`.
 *
 * O arquivo original cobria 7 pontos (a..g). Três deles ja entraram na main por
 * outras PRs e tem teste proprio, entao NAO são repetidos aqui:
 *  - `TableHead` com scope="col" -> primitivos-recuperados.test.tsx:16,36
 *  - temporizadores limpos no desmonte -> timers-unmount.test.tsx e
 *    primitivos-recuperados.test.tsx:52,72
 *  - `Sparkline` aria-hidden -> sparkline.a11y.test.tsx
 *
 * Os testes de polling de 1,5 s do original tambem não voltam: a main trocou a
 * varredura por intervalo por MutationObserver (skip-link.tsx:94-109) e tem uma
 * guarda que PROÍBE o intervalo (timers-unmount.test.tsx:71). O que sobrevive
 * daquele bloco e o COMPORTAMENTO — alvo montado ou removido depois da primeira
 * pintura — reescrito contra o mecanismo da main.
 *
 * Ficam aqui os três defeitos que a main ainda tinha:
 *  (a) `DialogContent` sem descrição acessível;
 *  (b) `SkipLink` que chama focus() em alvo não focável (scroll sem foco);
 *  (c) `AvatarGroup` com key={index}.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { SkipLinks } from '@/components/ui/skip-link';
import { AvatarGroup } from '@/components/ui/avatar';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('(a) DialogContent — descrição acessível de fallback', () => {
  it('diálogo SEM aria-describedby ganha a descrição oculta em pt-BR', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Aviso</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    const diálogo = screen.getByRole('dialog');
    const id = diálogo.getAttribute('aria-describedby');
    expect(id).toBeTruthy();

    const descricao = document.getElementById(id as string);
    expect(descricao).not.toBeNull();
    expect(descricao).toHaveTextContent('Conteúdo da caixa de diálogo');
    expect(descricao).toHaveClass('sr-only');
  });

  it('diálogo com aria-describedby={undefined} de propósito NAO ganha descrição injetada', () => {
    // Varias telas da V2 passam `aria-describedby={undefined}` justamente para
    // silenciar o aviso do Radix sem descrição — a decisao e respeitada.
    const propsDeProposito = { 'aria-describedby': undefined };
    render(
      <Dialog open>
        <DialogContent {...propsDeProposito}>
          <DialogTitle>Sem descrição de propósito</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    const diálogo = screen.getByRole('dialog');
    expect(diálogo).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByText('Conteúdo da caixa de diálogo')).toBeNull();
  });

  it('diálogo com aria-describedby do chamador preserva o valor e não duplica', () => {
    render(
      <Dialog open>
        <DialogContent aria-describedby="ajuda-do-diálogo">
          <DialogTitle>Com descrição própria</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    const diálogo = screen.getByRole('dialog');
    expect(diálogo).toHaveAttribute('aria-describedby', 'ajuda-do-diálogo');
    expect(screen.queryByText('Conteúdo da caixa de diálogo')).toBeNull();
  });

  it('diálogo com DialogDescription filho NAO recebe fallback e mantém o vínculo do Radix', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Com filho</DialogTitle>
          <DialogDescription>Descrição real da tela</DialogDescription>
        </DialogContent>
      </Dialog>,
    );

    const diálogo = screen.getByRole('dialog');
    const idReal = screen.getByText('Descrição real da tela').id;
    expect(idReal).toBeTruthy();
    // O aria-describedby aponta para a descrição real resolvida pelo Radix.
    expect(diálogo).toHaveAttribute('aria-describedby', idReal);
    expect(screen.queryByText('Conteúdo da caixa de diálogo')).toBeNull();
  });
});

describe('(b) SkipLink — alvo não focável', () => {
  it('poe tabindex=-1 no alvo sem tabindex e move o foco para ele', () => {
    Element.prototype.scrollIntoView = vi.fn() as unknown as Element['scrollIntoView'];
    // Sem tabindex de propósito: e o caso de `<nav id="main-navigation">`
    // (Sidebar.tsx:101), onde o atalho rolava a tela sem levar o foco.
    const alvo = document.createElement('section');
    alvo.id = 'main-content';
    document.body.appendChild(alvo);
    expect(alvo.hasAttribute('tabindex')).toBe(false);

    render(<SkipLinks />);
    fireEvent.click(screen.getByRole('link', { name: /pular para conteúdo principal/i }));

    expect(alvo.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(alvo);
  });

  it('alvo que JÁ tem tabindex não e sobrescrito', () => {
    Element.prototype.scrollIntoView = vi.fn() as unknown as Element['scrollIntoView'];
    const alvo = document.createElement('section');
    alvo.id = 'main-content';
    alvo.setAttribute('tabindex', '0');
    document.body.appendChild(alvo);

    render(<SkipLinks />);
    fireEvent.click(screen.getByRole('link', { name: /pular para conteúdo principal/i }));

    expect(alvo.getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(alvo);
  });
});

describe('(g) SkipLinks — alvo que aparece ou sai depois da primeira pintura', () => {
  it('alvo montado DEPOIS ganha o link', async () => {
    render(<SkipLinks />);
    expect(screen.queryByRole('link', { name: /pular para conteúdo principal/i })).toBeNull();

    const alvo = document.createElement('main');
    alvo.id = 'main-content';
    document.body.appendChild(alvo);

    await waitFor(() =>
      expect(screen.getByRole('link', { name: /pular para conteúdo principal/i })).toBeInTheDocument(),
    );
  });

  it('alvo removido do DOM perde o link', async () => {
    const alvo = document.createElement('main');
    alvo.id = 'main-content';
    document.body.appendChild(alvo);
    render(<SkipLinks />);
    expect(screen.getByRole('link', { name: /pular para conteúdo principal/i })).toBeInTheDocument();

    alvo.remove();

    await waitFor(() =>
      expect(screen.queryByRole('link', { name: /pular para conteúdo principal/i })).toBeNull(),
    );
  });
});

describe('(f) AvatarGroup — chave estável', () => {
  it('usa chave derivada do conteúdo: trocar o avatar recria o nó em vez de reusar o índice', () => {
    const { rerender } = render(<AvatarGroup avatars={[{ fallback: 'A' }]} />);
    const antes = screen.getByText('A');

    rerender(<AvatarGroup avatars={[{ fallback: 'Z' }]} />);
    const depois = screen.getByText('Z');

    // Com `key={index}` o mesmo no seria reutilizado (só o texto mudaria) e um
    // <AvatarImage> antigo continuaria na mesma posição. Com a chave derivada do
    // conteúdo o nó é recriado.
    expect(depois).not.toBe(antes);
  });
});

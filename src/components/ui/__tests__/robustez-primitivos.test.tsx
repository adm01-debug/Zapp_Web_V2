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
 * Ficam aqui dois defeitos que a main ainda tinha:
 *  (b) `SkipLink` que chama focus() em alvo não focável (scroll sem foco);
 *  (f) `AvatarGroup` com key={index}.
 *
 * O terceiro defeito do arquivo original — `DialogContent` sem descrição
 * acessível — NÃO entrou. Decidir se o diálogo já tem descrição exige olhar
 * depois da montagem: o Radix registra a descrição no contexto dele em OUTRO
 * commit (ver o comentário de `container` em dialog.tsx:56-62), e inspecionar
 * `children` não alcança descrição declarada dentro de um componente próprio
 * (QuickReplyDialog.tsx:93-109 passa `<QuickReplyForm>` sem `children`, e é o
 * form que renderiza a descrição). Em efeito, a decisão cai na regra de lint
 * `react-hooks/set-state-in-effect`; derivada no render, a leitura do DOM não
 * converge com a registração do Radix. Fica como item próprio em vez de meia
 * correção que injeta descrição duplicada.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { SkipLinks } from '@/components/ui/skip-link';
import { AvatarGroup } from '@/components/ui/avatar';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
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

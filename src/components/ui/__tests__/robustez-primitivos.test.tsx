/**
 * Robustez dos primitivos de `src/components/ui` — paridade V3 → V2 (Parte 7).
 *
 * Seis lacunas de robustez portadas da V3, cada uma com um caso próprio aqui:
 * (a) `DialogContent` injeta descrição oculta quando falta `aria-describedby` e
 *     NÃO injeta quando o chamador passa `aria-describedby={undefined}` de propósito;
 * (b) o atalho de navegação (`SkipLink`) torna o alvo focável (`tabindex=-1`) antes de focar;
 * (c) os `setTimeout` de `useAnnounce`, do indicador do `SkipLinks` e do `useOfflineStatus`
 *     são limpos no desmonte (nenhum temporizador fica pendente);
 * (d) `TableHead` emite `scope="col"` por padrão;
 * (e) o `Sparkline` decorativo é `aria-hidden`;
 * (f) `AvatarGroup` usa chave derivada do conteúdo, não do índice.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { SkipLinks } from '@/components/ui/skip-link';
import { useAnnounce } from '@/components/ui/visually-hidden';
import { useOfflineStatus } from '@/components/ui/offline-indicator';
import { Table, TableHeader, TableRow, TableHead } from '@/components/ui/table';
import { Sparkline } from '@/components/ui/sparkline';
import { AvatarGroup } from '@/components/ui/avatar';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
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

    const dialogo = screen.getByRole('dialog');
    const id = dialogo.getAttribute('aria-describedby');
    expect(id).toBeTruthy();

    const descricao = document.getElementById(id as string);
    expect(descricao).not.toBeNull();
    expect(descricao).toHaveTextContent('Conteúdo da caixa de diálogo');
    expect(descricao).toHaveClass('sr-only');
  });

  it('diálogo com aria-describedby={undefined} de propósito NÃO ganha descrição injetada', () => {
    // Vários diálogos da V2 passam `aria-describedby={undefined}` justamente para
    // silenciar o aviso do Radix sem descrição — nesse caso não injetamos nada.
    const propsDeProposito = { 'aria-describedby': undefined };
    render(
      <Dialog open>
        <DialogContent {...propsDeProposito}>
          <DialogTitle>Sem descrição de propósito</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    const dialogo = screen.getByRole('dialog');
    expect(dialogo).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByText('Conteúdo da caixa de diálogo')).toBeNull();
  });

  it('diálogo com aria-describedby do chamador preserva o valor e não duplica', () => {
    render(
      <Dialog open>
        <DialogContent aria-describedby="ajuda-do-dialogo">
          <DialogTitle>Com descrição própria</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    const dialogo = screen.getByRole('dialog');
    expect(dialogo).toHaveAttribute('aria-describedby', 'ajuda-do-dialogo');
    // O texto de fallback só existe quando o chamador não descreve o diálogo.
    expect(screen.queryByText('Conteúdo da caixa de diálogo')).toBeNull();
  });
});

describe('(b) SkipLink — alvo não focável', () => {
  it('põe tabindex=-1 no alvo sem tabindex e move o foco para ele', () => {
    Element.prototype.scrollIntoView = vi.fn() as unknown as Element['scrollIntoView'];
    const alvo = document.createElement('section');
    alvo.id = 'main-content';
    document.body.appendChild(alvo);
    expect(alvo.hasAttribute('tabindex')).toBe(false);

    render(<SkipLinks />);
    fireEvent.click(screen.getByRole('link', { name: /pular para conteúdo principal/i }));

    expect(alvo.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(alvo);
  });
});

describe('(c) temporizadores limpos no desmonte', () => {
  it('useAnnounce não deixa o temporizador do anúncio pendente ao desmontar', () => {
    vi.useFakeTimers();
    function Harness() {
      const { announce } = useAnnounce();
      return <button onClick={() => announce('pronto')}>anunciar</button>;
    }
    const { unmount } = render(<Harness />);

    fireEvent.click(screen.getByText('anunciar'));
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('SkipLinks limpa o temporizador do aviso de Tab ao desmontar', () => {
    vi.useFakeTimers();
    const alvo = document.createElement('main');
    alvo.id = 'main-content';
    document.body.appendChild(alvo);
    const { unmount } = render(<SkipLinks />);

    fireEvent.keyDown(window, { key: 'Tab' });
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('useOfflineStatus limpa o temporizador do aviso "voltou"', () => {
    vi.useFakeTimers();
    const setSpy = vi.spyOn(globalThis, 'setTimeout');
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    function Harness() {
      const { wasOffline } = useOfflineStatus();
      return <span>{wasOffline ? 'voltou' : 'ok'}</span>;
    }
    const { unmount } = render(<Harness />);

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByText('voltou')).toBeInTheDocument();

    unmount();

    // O hook guarda o id do `setTimeout` e o limpa (na troca de estado e no desmonte).
    // Sem a limpeza, nenhum clearTimeout referencia um id agendado pelo próprio hook.
    const idsAgendados = setSpy.mock.results.map((r) => r.value as number);
    const limpouUmIdProprio = clearSpy.mock.calls.some((call) => idsAgendados.includes(call[0] as number));
    expect(limpouUmIdProprio).toBe(true);
  });
});

describe('(d) TableHead — cabeçalho de coluna', () => {
  it('emite scope="col" por padrão e aceita override', () => {
    const { container } = render(
      <table>
        <thead>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead scope="row">Valor</TableHead>
          </TableRow>
        </thead>
      </table>,
    );

    const cabecalhos = container.querySelectorAll('th');
    expect(cabecalhos[0]).toHaveAttribute('scope', 'col');
    expect(cabecalhos[1]).toHaveAttribute('scope', 'row');
  });
});

describe('(e) Sparkline — decorativo', () => {
  it('marca o SVG como aria-hidden', () => {
    const { container } = render(<Sparkline data={[1, 3, 2]} />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('(f) AvatarGroup — chave estável', () => {
  it('usa chave derivada do conteúdo: trocar o avatar recria o nó em vez de reusar o índice', () => {
    const { rerender } = render(<AvatarGroup avatars={[{ fallback: 'A' }]} />);
    const antes = screen.getByText('A');

    rerender(<AvatarGroup avatars={[{ fallback: 'Z' }]} />);
    const depois = screen.getByText('Z');

    // Com `key={index}` o mesmo nó seria reutilizado (só o texto mudaria). Com a chave
    // derivada do conteúdo, o nó é recriado — sem estado/imagem antigos na mesma posição.
    expect(depois).not.toBe(antes);
  });
});

/**
 * J05 — `Collapse`: expandir/recolher das mensagens agrupadas com altura animada,
 * 200 ms. O painel publica o `id` e o gatilho carrega `aria-expanded`/
 * `aria-controls`; com "reduzir movimento" abre e fecha direto, sem animação.
 *
 * A prova do item animado é o estado em que ele NASCE ao abrir: o painel entra
 * com `height: 0px` (é daí que a altura cresce). Na versão sem movimento não
 * existe altura nenhuma para animar — o painel nasce sem `height`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { Collapse } from '../Collapse';

const instrumentacao = vi.hoisted(() => ({ reduzido: false }));

vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  useReducedMotion: () => instrumentacao.reduzido,
}));

const gatilho = <span>7 mensagens recebidas</span>;

function cartao(open: boolean, onToggle = vi.fn()): ReactElement {
  return (
    <Collapse open={open} id="episodio-1" onToggle={onToggle} trigger={gatilho}>
      <p>mensagem agrupada</p>
    </Collapse>
  );
}

/** Monta fechado e abre — é assim que o usuário chega ao painel animado. */
function abrir(onToggle = vi.fn()) {
  const utils = render(cartao(false, onToggle));
  utils.rerender(cartao(true, onToggle));
  return { ...utils, onToggle };
}

beforeEach(() => {
  instrumentacao.reduzido = false;
});

afterEach(() => {
  cleanup();
});

describe('J05 Collapse', () => {
  it('(1) fechado: o conteúdo não fica na tela e o gatilho diz que está fechado', () => {
    render(cartao(false));

    expect(screen.queryByText('mensagem agrupada')).toBeNull();
    const botao = screen.getByRole('button', { name: '7 mensagens recebidas' });
    expect(botao).toHaveAttribute('aria-expanded', 'false');
    expect(botao).toHaveAttribute('aria-controls', 'episodio-1');
  });

  it('(2) ao abrir: o painel nasce com altura zero e cresce até o conteúdo, e o gatilho aponta para ele', () => {
    abrir();

    const painel = screen.getByTestId('collapse-panel');
    expect(painel).toHaveAttribute('id', 'episodio-1');
    expect(painel.style.height).toBe('0px'); // é daqui que a altura cresce
    expect(painel.className).toContain('overflow-hidden');
    // o conteúdo já está no documento mesmo durante a animação (nada escondido)
    expect(screen.getByText('mensagem agrupada')).toBeInTheDocument();

    const botao = screen.getByRole('button', { name: '7 mensagens recebidas' });
    expect(botao).toHaveAttribute('aria-expanded', 'true');
    expect(botao).toHaveAttribute('aria-controls', 'episodio-1');
  });

  it('(3) o clique no gatilho chega em quem controla, mesmo com o painel animando', () => {
    const { onToggle } = abrir();
    const botao = screen.getByRole('button', { name: '7 mensagens recebidas' });

    fireEvent.click(botao);
    expect(botao).toBeEnabled();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('(4) com reduzir movimento abre direto: nenhuma altura para animar', () => {
    instrumentacao.reduzido = true;
    abrir();

    const painel = screen.getByTestId('collapse-panel');
    expect(painel.style.height).toBe('');
    expect(painel.className).not.toContain('overflow-hidden');
    expect(screen.getByText('mensagem agrupada')).toBeInTheDocument();
  });

  it('(5) com reduzir movimento fecha direto: o painel sai do documento', () => {
    instrumentacao.reduzido = true;
    const onToggle = vi.fn();
    const { rerender } = abrir(onToggle);
    expect(screen.getByTestId('collapse-panel')).toBeInTheDocument();

    rerender(cartao(false, onToggle));
    expect(screen.queryByTestId('collapse-panel')).toBeNull();
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  });

  it('(6) sem gatilho, o painel publica o id e o próprio estado, e nenhum botão é criado', () => {
    render(
      <Collapse open id="episodio-2">
        <p>conteúdo solto</p>
      </Collapse>,
    );

    const painel = screen.getByTestId('collapse-panel');
    expect(painel).toHaveAttribute('id', 'episodio-2');
    expect(painel).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('button')).toBeNull();
  });
});

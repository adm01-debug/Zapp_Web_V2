import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { HELP_EXAMPLE_QUERIES } from '../talkxHelpIndex';
import { TalkXHelpCenter } from '../TalkXHelpCenter';
import type { TalkXHelpRoute } from '../talkxHelpRoute';

const SEARCH_PLACEHOLDER = 'O que você precisa de ajuda hoje?';

function Harness() {
  const [route, setRoute] = useState<TalkXHelpRoute>({});
  return <TalkXHelpCenter route={route} onRouteChange={setRoute} onClose={() => {}} />;
}

async function openHelp() {
  render(<Harness />);
  expect(await screen.findByRole('heading', { name: 'Ajuda do Talk X' })).toBeTruthy();
  // O índice carrega de forma assíncrona (import.meta.glob sob demanda).
  return await screen.findByPlaceholderText(SEARCH_PLACEHOLDER);
}

describe('tela da Ajuda do Talk X (X189)', () => {
  it('mostra o cabeçalho, a busca e a grade de tópicos com a contagem real', async () => {
    await openHelp();

    expect(screen.getByText('Aprenda a criar campanhas melhores com velocidade e segurança.')).toBeTruthy();
    expect(screen.getByText('Pressione ⌘ K para buscar')).toBeTruthy();
    expect(screen.getByRole('button', { name: /ver todos os artigos/i })).toBeTruthy();

    // Contagem por tópico vem do índice: 2 + 2 artigos e 1 artigo.
    expect(screen.getAllByText('2 artigos')).toHaveLength(2);
    expect(screen.getByText('1 artigo')).toBeTruthy();

    expect(screen.getByText('Guias recomendados')).toBeTruthy();
    const guia = screen.getByRole('button', { name: /como criar sua primeira campanha no talk x/i });
    expect(within(guia).getByText('Do segmento ao envio em poucos minutos.')).toBeTruthy();
    expect(within(guia).getByText('Iniciante')).toBeTruthy();
    expect(within(guia).getByText(/\d+ min/)).toBeTruthy();
  });

  it('acha sem acento, abre o artigo com Enter e volta para a busca preenchida', async () => {
    const input = await openHelp();

    fireEvent.change(input, { target: { value: 'supressao' } });

    const resultados = await screen.findByRole('listbox', { name: 'Resultados da busca da Ajuda' });
    expect(within(resultados).getByText('Segmentos de contatos')).toBeTruthy();

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByRole('heading', { level: 1, name: 'Segmentos de contatos' })).toBeTruthy();
    // O corpo do arquivo markdown é renderizado no leitor (título de seção do arquivo real).
    expect(
      screen.getByRole('heading', { level: 2, name: 'Antes de disparar, confira a lista de supressão' }),
    ).toBeTruthy();
    expect(screen.getByText(/Segmento é uma lista reutilizável de contatos/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /voltar à ajuda/i }));

    const volta = await screen.findByPlaceholderText(SEARCH_PLACEHOLDER);
    expect(volta).toHaveValue('supressao');
    expect(screen.getByRole('listbox', { name: 'Resultados da busca da Ajuda' })).toBeTruthy();
  });

  it('as setas mudam a seleção e o Enter abre o artigo selecionado', async () => {
    const input = await openHelp();

    fireEvent.change(input, { target: { value: 'campanha' } });

    const resultados = await screen.findByRole('listbox', { name: 'Resultados da busca da Ajuda' });
    const opcoes = within(resultados).getAllByRole('option');
    expect(opcoes.length).toBeGreaterThan(1);
    expect(opcoes[0]).toHaveAttribute('aria-selected', 'true');
    // O título aparece com o trecho casado destacado, então comparamos o texto
    // do item inteiro (o destaque não muda o que a pessoa lê).
    expect(opcoes[0].textContent).toContain('Como criar sua primeira campanha no Talk X');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[1].textContent).toContain('Ciclo de vida de uma campanha');
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Ciclo de vida de uma campanha' })).toBeTruthy();
  });

  it('avisa quando a busca não acha nada', async () => {
    const input = await openHelp();

    fireEvent.change(input, { target: { value: 'assunto inexistente' } });

    expect(await screen.findByText(/nenhum artigo encontrado para “assunto inexistente”/i)).toBeTruthy();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('todo chip de exemplo leva a pelo menos um artigo', async () => {
    const input = await openHelp();

    for (const chip of HELP_EXAMPLE_QUERIES) {
      fireEvent.click(screen.getByRole('button', { name: chip }));
      const resultados = await screen.findByRole('listbox', { name: 'Resultados da busca da Ajuda' });
      expect(within(resultados).getAllByRole('option').length).toBeGreaterThan(0);
      expect(screen.queryByText(/nenhum artigo encontrado/i)).toBeNull();
      expect(input).toHaveValue(chip);
    }
  });

  it('⌘K dentro da Ajuda foca a busca e não chega na paleta global', async () => {
    const paletaGlobal = vi.fn();
    window.addEventListener('keydown', paletaGlobal);

    try {
      const input = await openHelp();
      (document.activeElement as HTMLElement | null)?.blur();
      expect(input).not.toHaveFocus();

      fireEvent.keyDown(document.body, { key: 'k', metaKey: true });

      expect(input).toHaveFocus();
      expect(paletaGlobal).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', paletaGlobal);
    }
  });

  it('fora da Ajuda o atalho continua chegando na paleta global', async () => {
    const paletaGlobal = vi.fn();
    window.addEventListener('keydown', paletaGlobal);

    try {
      const { unmount } = render(<Harness />);
      await screen.findByRole('heading', { name: 'Ajuda do Talk X' });
      unmount();
      paletaGlobal.mockClear();

      fireEvent.keyDown(document.body, { key: 'k', metaKey: true });

      expect(paletaGlobal).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('keydown', paletaGlobal);
    }
  });
});

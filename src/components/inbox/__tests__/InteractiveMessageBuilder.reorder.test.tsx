/**
 * Construtor de mensagem interativa — reordenar a linha (item de seção) e subir
 * o botão. A ordem dos itens/botões é a ordem enviada ao WhatsApp: até aqui o
 * construtor só sabia APAGAR (o ícone de grip do botão era decorativo e não
 * existia arrastar), então uma linha trocada de posição só se resolvia
 * apagando e recriando.
 *
 * Prova (vermelho antes / verde depois): o teste renderiza o construtor REAL,
 * preenche os títulos e clica nas setas — a ordem em tela tem de mudar sem
 * perder id/título/descrição da linha.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InteractiveMessageBuilder } from '@/components/inbox/InteractiveMessageBuilder';
import type { InteractiveMessage } from '@/types/chat';

function renderizar() {
  return render(
    <InteractiveMessageBuilder open onOpenChange={vi.fn()} onSend={vi.fn().mockResolvedValue(undefined)} />,
  );
}

/** Abre a aba Lista e cria uma seção com dois itens titulados. */
function comporListaComDuasLinhas() {
  // Radix Tabs ativa no mouseDown (o clique só não troca a aba).
  fireEvent.mouseDown(screen.getByRole('tab', { name: /lista/i }));
  fireEvent.click(screen.getByRole('button', { name: /^seção$/i }));
  // A seção nasce expandida com seu ID estável, pronta para receber itens.

  fireEvent.click(screen.getByRole('button', { name: /^item$/i }));
  fireEvent.click(screen.getByRole('button', { name: /^item$/i }));

  const titulos = screen.getAllByPlaceholderText(/título do item/i);
  fireEvent.change(titulos[0], { target: { value: 'Primeiro' } });
  fireEvent.change(titulos[1], { target: { value: 'Segundo' } });
}

const ordemDosItens = () =>
  screen.getAllByPlaceholderText(/título do item/i).map((i) => (i as HTMLInputElement).value);

describe('InteractiveMessageBuilder — reordenar linha da lista', () => {
  it('desce a primeira linha uma posição, preservando o conteúdo', () => {
    renderizar();
    comporListaComDuasLinhas();
    expect(ordemDosItens()).toEqual(['Primeiro', 'Segundo']);

    fireEvent.click(screen.getAllByRole('button', { name: 'Descer item' })[0]);

    expect(ordemDosItens()).toEqual(['Segundo', 'Primeiro']);
  });

  it('sobe a última linha de volta para a primeira posição', () => {
    renderizar();
    comporListaComDuasLinhas();

    fireEvent.click(screen.getAllByRole('button', { name: 'Subir item' })[1]);

    expect(ordemDosItens()).toEqual(['Segundo', 'Primeiro']);
  });

  it('desabilita a seta nos extremos: sem subir na primeira, sem descer na última', () => {
    renderizar();
    comporListaComDuasLinhas();

    expect(screen.getAllByRole('button', { name: 'Subir item' })[0]).toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Descer item' })[1]).toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Subir item' })[1]).toBeEnabled();
    expect(screen.getAllByRole('button', { name: 'Descer item' })[0]).toBeEnabled();
  });

  it('remove a seção pelo controle separado sem acionar o disclosure', async () => {
    renderizar();
    comporListaComDuasLinhas();

    fireEvent.click(screen.getByRole('button', { name: 'Remover seção 1' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Seção 1' })).toBeNull());
    expect(screen.getByText('Adicione seções para criar a lista')).toBeInTheDocument();
  });

  it('mantém a seção remanescente expandida depois de remover a anterior', async () => {
    renderizar();
    fireEvent.mouseDown(screen.getByRole('tab', { name: /lista/i }));
    fireEvent.click(screen.getByRole('button', { name: /^seção$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^seção$/i }));

    const sectionTitles = screen.getAllByPlaceholderText('Ex: Categorias, Opções, Produtos...');
    fireEvent.change(sectionTitles[0], { target: { value: 'Primeira' } });
    fireEvent.change(sectionTitles[1], { target: { value: 'Segunda' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remover seção 1' }));

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('Ex: Categorias, Opções, Produtos...')).toHaveLength(1);
      expect(screen.getByPlaceholderText('Ex: Categorias, Opções, Produtos...')).toHaveValue('Segunda');
    });
    expect(screen.getByRole('button', { name: 'Seção 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^item$/i })).toBeInTheDocument();
  });

  it('envia a ordem reordenada e preserva conteúdo no payload final', async () => {
    const onSend = vi.fn(async (_message: InteractiveMessage) => {});
    render(
      <InteractiveMessageBuilder open onOpenChange={vi.fn()} onSend={onSend} />,
    );
    comporListaComDuasLinhas();

    fireEvent.change(screen.getByPlaceholderText('Digite o corpo da mensagem...'), {
      target: { value: 'Escolha um produto' },
    });
    fireEvent.change(screen.getByPlaceholderText('Ex: Categorias, Opções, Produtos...'), {
      target: { value: 'Produtos' },
    });
    const descricoes = screen.getAllByPlaceholderText(/Descrição \(opcional/i);
    fireEvent.change(descricoes[0], { target: { value: 'Cerâmica' } });
    fireEvent.change(descricoes[1], { target: { value: 'Algodão' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Descer item' })[0]);

    fireEvent.click(screen.getByRole('button', { name: 'Enviar Mensagem' }));

    await waitFor(() => expect(onSend).toHaveBeenCalledWith(expect.objectContaining({
      type: 'list',
      sections: [expect.objectContaining({
        title: 'Produtos',
        rows: [
          expect.objectContaining({ title: 'Segundo', description: 'Algodão' }),
          expect.objectContaining({ title: 'Primeiro', description: 'Cerâmica' }),
        ],
      })],
    })));
  });
});

describe('InteractiveMessageBuilder — subir o botão para a primeira posição', () => {
  function comporDoisBotoes() {
    fireEvent.click(screen.getByRole('button', { name: /^resposta$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^resposta$/i }));

    const titulos = screen.getAllByPlaceholderText(/título do botão/i);
    fireEvent.change(titulos[0], { target: { value: 'Primeiro' } });
    fireEvent.change(titulos[1], { target: { value: 'Segundo' } });
  }

  const ordemDosBotoes = () =>
    screen.getAllByPlaceholderText(/título do botão/i).map((i) => (i as HTMLInputElement).value);

  it('leva o segundo botão para a primeira posição e desabilita a seta no primeiro', () => {
    renderizar();
    comporDoisBotoes();
    expect(ordemDosBotoes()).toEqual(['Primeiro', 'Segundo']);
    expect(screen.getAllByRole('button', { name: 'Subir botão para a primeira posição' })[0]).toBeDisabled();

    fireEvent.click(screen.getAllByRole('button', { name: 'Subir botão para a primeira posição' })[1]);

    expect(ordemDosBotoes()).toEqual(['Segundo', 'Primeiro']);
    expect(screen.getAllByRole('button', { name: 'Subir botão para a primeira posição' })[0]).toBeDisabled();
  });
});

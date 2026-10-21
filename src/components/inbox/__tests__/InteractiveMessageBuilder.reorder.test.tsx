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
import { render, screen, fireEvent } from '@testing-library/react';
import { InteractiveMessageBuilder } from '@/components/inbox/InteractiveMessageBuilder';

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
  // A seção nasce recolhida: abre pelo cabeçalho para os itens aparecerem.
  // Ancorado: o gatilho da seção é nomeado "Seção 1"; o botão de remover
  // (a11y, UK-13) também diz "seção 1" no meio do rótulo e o regex solto casava os dois.
  fireEvent.click(screen.getByRole('button', { name: /^seção 1\b/i }));

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

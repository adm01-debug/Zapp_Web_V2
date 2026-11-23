import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

/**
 * X076/IA-161 — "Sugerir com IA" no construtor de segmentos.
 *
 * O kind `segment_suggestion` da edge `talkx-ai` existia sem tela. Aqui o
 * componente e renderizado de verdade e o hook vira stub, para provar o ciclo
 * que importa para o negocio:
 *
 *   A. pedido vazio nao gastou chamada paga;
 *   B. sugestao valida VIRA condicao no construtor (o usuario ve antes de salvar);
 *   C. sugestao com campo que o produto nao tem nao aplica nada e diz o motivo;
 *   D. recusa da edge (IA desligada) aparece na tela em vez de sumir.
 */

const mutate = vi.fn();
vi.mock('@/hooks/talkx/useTalkxAi', () => ({
  useTalkxAi: () => ({ mutate, isPending: false }),
}));

// A estimativa de audiencia faz request; aqui o construtor nao precisa dela.
vi.mock('@/hooks/integrations/useTalkXSegments', async () => {
  const real = await vi.importActual<typeof import('@/hooks/integrations/useTalkXSegments')>(
    '@/hooks/integrations/useTalkXSegments',
  );
  return { ...real, useAudienceEstimate: () => ({ data: undefined, isFetching: false }) };
});

import { TalkXSegmentBuilder } from '../TalkXSegmentBuilder';
import { createBuilderState } from '../segmentBuilderReducer';

const INICIAL = createBuilderState({ name: 'Base ativa', description: 'Clientes engajados', rules: { groups: [{ id: 'g1', match: 'and', rules: [] }], join: 'or' } });

function renderBuilder() {
  return render(<TalkXSegmentBuilder initial={INICIAL} isNew saving={false} onSave={vi.fn()} onCancel={vi.fn()} />);
}

function abrirIa() {
  fireEvent.click(screen.getByRole('button', { name: /Sugerir com IA/i }));
}

function pedir(texto: string) {
  fireEvent.change(screen.getByLabelText(/Descreva em palavras/i), { target: { value: texto } });
  fireEvent.click(screen.getByRole('button', { name: /^Sugerir$/ }));
}

/** Resposta de sucesso da edge, no formato que ela devolve (`{ ok, kind, output, ... }`). */
function resposta(output: unknown) {
  return { ok: true as const, kind: 'segment_suggestion' as const, cached: false, output };
}

describe('TalkXSegmentBuilder · Sugerir com IA', () => {
  beforeEach(() => { mutate.mockReset(); });

  it('A: pedido vazio é recusado no cliente e não gasta chamada paga', () => {
    renderBuilder();
    abrirIa();
    fireEvent.click(screen.getByRole('button', { name: /^Sugerir$/ }));

    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(/Escreva em palavras/i);
  });

  it('B: sugestão válida vira condição real no construtor e entra no histórico', async () => {
    mutate.mockImplementation((_pedido, opts) => {
      opts.onSuccess(resposta({ groups: [{ match: 'and', rules: [{ field: 'city', op: 'eq', value: 'São Paulo' }] }] }));
    });
    renderBuilder();
    abrirIa();
    pedir('clientes de São Paulo');

    expect(mutate).toHaveBeenCalledWith(
      { kind: 'segment_suggestion', input: { pedido: 'clientes de São Paulo' } },
      expect.anything(),
    );

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/1 condição\(ões\) aplicada/i));
    // A condição aparece no construtor (o usuário confere antes de salvar):
    // o campo cidade passa a existir com o valor que a IA devolveu.
    expect(screen.getByDisplayValue('São Paulo')).toBeInTheDocument();
    // E o botão Desfazer fica habilitado: a sugestão é reversível.
    expect(screen.getByRole('button', { name: 'Desfazer' })).toBeEnabled();
  });

  it('C: sugestão com campo inexistente não aplica nada e explica o motivo', async () => {
    mutate.mockImplementation((_pedido, opts) => {
      opts.onSuccess(resposta({ groups: [{ match: 'and', rules: [{ field: 'renda_mensal_declarada', op: 'eq', value: '5000' }] }] }));
    });
    renderBuilder();
    abrirIa();
    pedir('quem ganha mais de 5 mil');

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/renda_mensal_declarada/i));
    // Nada foi aplicado: não há condição com esse campo no construtor.
    expect(screen.queryByText('renda_mensal_declarada')).not.toBeInTheDocument();
  });

  it('D: recusa da edge (IA desligada) aparece na tela com o motivo do servidor', async () => {
    mutate.mockImplementation((_pedido, opts) => {
      opts.onError(Object.assign(new Error('A IA do Talk X está desligada. Um administrador precisa definir o teto mensal em Ajustes.'), { code: 'ai_disabled' }));
    });
    renderBuilder();
    abrirIa();
    pedir('clientes vip');

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/está desligada/i));
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { state } = vi.hoisted(() => ({
  state: { current: {} as Record<string, unknown> },
}));

vi.mock('@/hooks/integrations/useTalkXSegmentTags', () => ({
  useTalkXSegmentTags: () => state.current,
}));

import { SegmentTagsBlock } from '../segments/SegmentTagsBlock';

/**
 * X157 — bloco "Tags mais usadas no público" do painel de detalhes do segmento.
 * Antes dele a RPC `talkx_segment_tags` existia sem nenhuma tela lendo (C-11):
 * o operador só via os critérios do segmento, nunca as tags dos contatos.
 */

function setState(partial: Record<string, unknown>) {
  state.current = { tags: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn(), ...partial };
  return state.current;
}

beforeEach(() => {
  setState({});
});

describe('SegmentTagsBlock', () => {
  it('mostra o esqueleto enquanto carrega', () => {
    setState({ isLoading: true });
    render(<SegmentTagsBlock segmentId="seg-1" />);
    expect(screen.getByText('Tags mais usadas no público')).toBeInTheDocument();
    expect(screen.getByLabelText('Carregando tags do público')).toHaveAttribute('aria-busy', 'true');
  });

  it('mostra as tags com a quantidade de contatos', () => {
    setState({ tags: [{ tag: 'Lead-quente', count: 3 }, { tag: 'VIP', count: 1 }] });
    render(<SegmentTagsBlock segmentId="seg-1" />);
    expect(screen.getByText('Lead-quente')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('VIP')).toBeInTheDocument();
    expect(screen.getByText('contatos')).toBeInTheDocument();
    expect(screen.getByText('contato')).toBeInTheDocument();
  });

  it('lista vazia explica que as tags vêm dos envios, não mostra "erro"', () => {
    setState({ tags: [] });
    render(<SegmentTagsBlock segmentId="seg-1" />);
    expect(screen.getByText(/Nenhuma tag nos contatos deste público/)).toBeInTheDocument();
    expect(screen.queryByText(/Não foi possível carregar/)).not.toBeInTheDocument();
  });

  it('erro dá caminho de volta com "Tentar de novo"', () => {
    const refetch = vi.fn();
    setState({ isError: true, error: new Error('boom'), refetch });
    render(<SegmentTagsBlock segmentId="seg-1" />);
    expect(screen.getByText('Não foi possível carregar as tags.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Tentar de novo/ }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('resposta indefinida (sem segmento) cai no estado vazio, não em erro', () => {
    setState({ tags: undefined });
    render(<SegmentTagsBlock segmentId="seg-1" />);
    expect(screen.getByText(/Nenhuma tag nos contatos deste público/)).toBeInTheDocument();
  });
});
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TalkXQueryBoundary } from '../states';

/**
 * X047 — matriz de aceite do TalkXQueryBoundary.
 *
 * A regra da etapa: quando uma consulta FALHA, a tela mostra o ERRO, nunca o
 * vazio. Antes deste componente, `campaigns` virava [] no erro e a tela dizia
 * "nenhuma campanha encontrada" — o sistema mentia sobre a falha.
 *
 * Cada linha abaixo e uma combinacao de estado da consulta e o unico resultado
 * aceitavel para ela. A ordem testada e: carregando -> erro -> vazio -> conteudo.
 */

const query = (over: Partial<Parameters<typeof TalkXQueryBoundary>[0]['query']> = {}) => ({
  isLoading: false,
  isFetching: false,
  isError: false,
  error: null,
  ...over,
});

function renderBoundary(q: ReturnType<typeof query>, isEmpty = false) {
  return render(
    <TalkXQueryBoundary
      query={q}
      entity="campanhas"
      onRetry={vi.fn()}
      skeleton={<div>esqueleto</div>}
      isEmpty={isEmpty}
      empty={<div>vazio</div>}
    >
      <div>conteudo</div>
    </TalkXQueryBoundary>,
  );
}

describe('TalkXQueryBoundary (matriz de estados — X047)', () => {
  it('carregando: mostra o esqueleto e marca aria-busy', () => {
    const { container } = renderBoundary(query({ isLoading: true }));
    expect(screen.getByText('esqueleto')).toBeTruthy();
    expect(screen.queryByText('conteudo')).toBeNull();
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(container.querySelector('[data-talkx-query="loading"]')).toBeTruthy();
  });

  it('erro: mostra o erro e NUNCA o vazio (nem com a lista vazia)', () => {
    const err = new Error('Falha de rede: servidor X047 indisponivel');
    const { container } = renderBoundary(query({ isError: true, error: err }), true);
    // o defeito que a etapa corrige: vazio aparecendo no lugar do erro
    expect(screen.queryByText('vazio')).toBeNull();
    expect(screen.queryByText('conteudo')).toBeNull();
    expect(container.querySelector('[data-talkx-query="empty"]')).toBeNull();
    // e o erro e mostrado, com a entidade no titulo
    expect(screen.getByText(/campanhas/i)).toBeTruthy();
  });

  it('vazio sem erro: mostra o vazio', () => {
    const { container } = renderBoundary(query(), true);
    expect(screen.getByText('vazio')).toBeTruthy();
    expect(screen.queryByText('conteudo')).toBeNull();
    expect(container.querySelector('[data-talkx-query="empty"]')).toBeTruthy();
  });

  it('conteudo: mostra os filhos', () => {
    const { container } = renderBoundary(query());
    expect(screen.getByText('conteudo')).toBeTruthy();
    expect(screen.queryByText('vazio')).toBeNull();
    expect(container.querySelector('[data-talkx-query="content"]')).toBeTruthy();
  });

  it('refetch em andamento: conteudo continua visivel, com aria-busy', () => {
    const { container } = renderBoundary(query({ isFetching: true }));
    expect(screen.getByText('conteudo')).toBeTruthy();
    const el = container.querySelector('[data-talkx-query="content"]') as HTMLElement;
    expect(el.getAttribute('aria-busy')).toBe('true');
  });

  it('precedencia: erro vence o carregamento? nao — carregando vence, e o erro aparece depois', () => {
    const { container } = renderBoundary(query({ isLoading: true, isError: true }));
    // durante a PRIMEIRA carga nao se anuncia erro: mostra esqueleto
    expect(screen.getByText('esqueleto')).toBeTruthy();
    expect(container.querySelector('[data-talkx-query="error"]')).toBeNull();
  });
});

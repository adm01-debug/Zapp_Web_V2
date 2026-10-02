/**
 * CT-83 — CatalogHelpSheet: ajuda "Como usar o catálogo" (5 passos) + tour de
 * 4 dicas persistido em `localStorage` na chave `catalog.tourDone`.
 *
 * Cobre os 4 comportamentos exigidos pelo plano:
 *  1. renderiza com `localStorage` vazio → tour aparece na 1ª visita;
 *  2. concluir o tour marca `catalog.tourDone`;
 *  3. na próxima montagem com a chave marcada o tour NÃO reaparece;
 *  4. com armazenamento indisponível (getItem/setItem lançando) o componente
 *     não quebra e segue mostrando o painel.
 *
 * O aceite "5 passos com prints reais" NÃO é coberto por imagem: os prints
 * reais não existem no repositório (docs/catalogo/screens/ só tem mocks de
 * 11/09/2026). Os passos são texto — nenhum print falso é embutido.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CatalogHelpSheet, CATALOG_TOUR_DONE_KEY } from '../CatalogHelpSheet';

// Radix Dialog mede o conteúdo com ResizeObserver em alguns caminhos; o jsdom
// não implementa a API (mesmo polyfill dos testes de catálogo existentes).
if (typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

function renderSheet(open = true) {
  const onOpenChange = vi.fn();
  const utils = render(<CatalogHelpSheet open={open} onOpenChange={onOpenChange} />);
  return { ...utils, onOpenChange };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('CT-83 — CatalogHelpSheet (ajuda + tour)', () => {
  it('com localStorage vazio, mostra o tour da 1ª visita e os 5 passos do fluxo', () => {
    renderSheet();

    expect(screen.getByText('Como usar o catálogo')).toBeInTheDocument();
    const tour = screen.getByTestId('catalog-tour');
    expect(tour).toBeInTheDocument();
    expect(screen.getByText('Dica 1 de 4')).toBeInTheDocument();

    const steps = screen.getByTestId('catalog-help-steps');
    expect(steps.querySelectorAll('li')).toHaveLength(5);
    expect(screen.getByText('Encontre o produto')).toBeInTheDocument();
    expect(screen.getByText('Selecione o contato e envie')).toBeInTheDocument();
  });

  it('concluir o tour (4ª dica) marca catalog.tourDone', () => {
    renderSheet();

    // Próxima até a última dica.
    fireEvent.click(screen.getByRole('button', { name: /Próxima/ }));
    fireEvent.click(screen.getByRole('button', { name: /Próxima/ }));
    fireEvent.click(screen.getByRole('button', { name: /Próxima/ }));
    expect(screen.getByText('Dica 4 de 4')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Concluir tour/ }));

    expect(localStorage.getItem(CATALOG_TOUR_DONE_KEY)).toBe('true');
    expect(screen.queryByTestId('catalog-tour')).not.toBeInTheDocument();
    // A ajuda continua disponível depois do tour.
    expect(screen.getByTestId('catalog-help-steps')).toBeInTheDocument();
  });

  it('"Pular tour" também marca catalog.tourDone', () => {
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: /Pular tour/ }));

    expect(localStorage.getItem(CATALOG_TOUR_DONE_KEY)).toBe('true');
    expect(screen.queryByTestId('catalog-tour')).not.toBeInTheDocument();
  });

  it('na próxima montagem com a chave marcada, o tour não reaparece', () => {
    const first = renderSheet();
    fireEvent.click(screen.getByRole('button', { name: /Pular tour/ }));
    expect(localStorage.getItem(CATALOG_TOUR_DONE_KEY)).toBe('true');
    first.unmount();

    renderSheet();

    expect(screen.queryByTestId('catalog-tour')).not.toBeInTheDocument();
    expect(screen.getByText('Como usar o catálogo')).toBeInTheDocument();
    expect(screen.getByTestId('catalog-help-steps').querySelectorAll('li')).toHaveLength(5);
  });

  it('sem armazenamento (getItem/setItem lançando) não quebra e mostra o painel', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });

    renderSheet();

    expect(screen.getByText('Como usar o catálogo')).toBeInTheDocument();
    expect(screen.getByTestId('catalog-tour')).toBeInTheDocument();

    // Concluir não pode lançar mesmo com setItem falhando.
    fireEvent.click(screen.getByRole('button', { name: /Pular tour/ }));
    expect(screen.queryByTestId('catalog-tour')).not.toBeInTheDocument();
  });
});

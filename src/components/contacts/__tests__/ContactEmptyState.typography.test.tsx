import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContactEmptyState } from '../ContactEmptyState';

/**
 * O título do estado vazio é o MESMO papel semântico nos três estados
 * (`no-contacts`, `no-results`, `filtered-empty`), então tem de ter o MESMO
 * peso de fonte. Hoje `no-contacts` usa `font-semibold` e os outros dois usam
 * `font-bold`, sem motivo funcional. A prova renderiza o componente REAL e
 * confere o peso aplicado a cada título (jsdom não calcula o estilo final).
 */
describe('ContactEmptyState — peso do título do estado vazio', () => {
  it('"sem contatos" usa font-semibold (nunca font-bold), mantendo text-lg', () => {
    render(<ContactEmptyState type="no-contacts" />);
    const titulo = screen.getByRole('heading', { level: 3, name: 'Comece sua base de contatos' });

    expect(titulo.className).toContain('font-semibold');
    expect(titulo.className).not.toContain('font-bold');
    expect(titulo.className).toContain('text-lg');
  });

  it('"sem resultados" usa o mesmo peso (font-semibold) dos outros títulos', () => {
    render(<ContactEmptyState type="no-results" searchQuery="zzz" />);
    const titulo = screen.getByRole('heading', { level: 3, name: 'Nenhum resultado encontrado' });

    expect(titulo.className).toContain('font-semibold');
    expect(titulo.className).not.toContain('font-bold');
    expect(titulo.className).toContain('text-lg');
  });

  it('"filtro sem resultados" usa o mesmo peso (font-semibold) dos outros títulos', () => {
    render(<ContactEmptyState type="filtered-empty" activeFilters={2} />);
    const titulo = screen.getByRole('heading', { level: 3, name: 'Sem contatos neste filtro' });

    expect(titulo.className).toContain('font-semibold');
    expect(titulo.className).not.toContain('font-bold');
    expect(titulo.className).toContain('text-lg');
  });
});

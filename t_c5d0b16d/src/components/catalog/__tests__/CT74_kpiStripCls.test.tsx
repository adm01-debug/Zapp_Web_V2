import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CatalogKpiStrip } from '../catalogShared';

/**
 * CT-74 — reserva de espaço do strip de KPIs.
 *
 * Medido em produção (Lighthouse, 02/10): o layout shift de 0,2211 (de 0,2455
 * totais) vinha do `<div class="grid …" data-testid="catalog-kpi-strip">`. A causa
 * está no código: quando não há número em `stats`, o componente devolvia `null` —
 * o strip **nascia depois do primeiro paint** e empurrava a grade para baixo.
 *
 * Aqui o estado sem dados também ocupa o lugar (esqueleto), em vez de devolver null.
 */
describe('CatalogKpiStrip — reserva de espaço (CT-74)', () => {
  it('sem stats e sem loading, ainda ocupa o lugar (nunca devolve null)', () => {
    const { container } = render(<CatalogKpiStrip stats={undefined} loading={false} />);

    expect(container.querySelector('[data-testid="catalog-kpi-strip-placeholder"]')).not.toBeNull();
    expect(screen.queryByTestId('catalog-kpi-strip')).toBeNull();
  });
});

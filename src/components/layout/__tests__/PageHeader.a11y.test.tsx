import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PageHeader } from '../PageHeader';

describe('a11y: PageHeader — breadcrumb sem <li> dentro de <li>', () => {
  it('BreadcrumbSeparator nao esta aninhado dentro de BreadcrumbItem', () => {
    const { container } = render(
      <MemoryRouter>
        <PageHeader
          title="Título"
          breadcrumbs={[{ label: 'Pai' }, { label: 'Filho' }]}
        />
      </MemoryRouter>,
    );

    // Cada li de BreadcrumbItem não deve conter outro li de BreadcrumbSeparator como descendente direto
    const breadcrumbItems = container.querySelectorAll('li[class*="inline-flex"]');
    for (const item of breadcrumbItems) {
      const separatorsInside = item.querySelectorAll('li[aria-hidden="true"]');
      expect(separatorsInside).toHaveLength(0);
    }
  });

  it('os separadores da trilha sao elementos irmos dos itens, nao aninhados', () => {
    const { container } = render(
      <MemoryRouter>
        <PageHeader
          title="Título"
          breadcrumbs={[{ label: 'Pai' }, { label: 'Filho' }]}
        />
      </MemoryRouter>,
    );

    const list = container.querySelector('ol, ul');
    expect(list).toBeDefined();

    // O list deve conter li de BreadcrumbItem e li de BreadcrumbSeparator como filhos diretos (não aninhados)
    const children = Array.from(list?.children ?? []);
    const hasSeparatorAsDirectChild = children.some(
      (child) => child.tagName === 'LI' && child.getAttribute('aria-hidden') === 'true',
    );
    expect(hasSeparatorAsDirectChild).toBe(true);
  });

  it('o heading da página é h1', () => {
    const { container } = render(
      <MemoryRouter>
        <PageHeader title="Minha Página" />
      </MemoryRouter>,
    );

    const h1 = container.querySelector('h1');
    expect(h1).toBeDefined();
    expect(h1?.textContent).toContain('Minha Página');
  });
});
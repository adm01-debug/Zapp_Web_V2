import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ComponentProps } from 'react';
import { LayoutProvider } from '@/contexts/LayoutContext';
import { PageHeader } from '../PageHeader';

const breadcrumbs = [{ label: 'Relatórios' }, { label: 'Vendas' }];

function renderHeader(hide: boolean | undefined, extra: Partial<ComponentProps<typeof PageHeader>> = {}) {
  const header = <PageHeader title="Painel" breadcrumbs={breadcrumbs} {...extra} />;
  return render(
    <MemoryRouter>
      {hide === undefined ? header : <LayoutProvider value={{ hidePageBreadcrumbs: hide }}>{header}</LayoutProvider>}
    </MemoryRouter>
  );
}

describe('PageHeader — trilha própria', () => {
  it('desktop (hidePageBreadcrumbs=true): não desenha a trilha, mantém o título', () => {
    renderHeader(true);
    expect(screen.queryByText('Relatórios')).toBeNull();
    expect(screen.queryByText('Vendas')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Painel' })).toBeDefined();
  });

  it('mobile/zen (hidePageBreadcrumbs=false): desenha a trilha', () => {
    renderHeader(false);
    expect(screen.getByText('Relatórios')).toBeDefined();
    expect(screen.getByText('Vendas')).toBeDefined();
  });

  it('sem provider (padrão): desenha a trilha', () => {
    renderHeader(undefined);
    expect(screen.getByText('Relatórios')).toBeDefined();
    expect(screen.getByText('Vendas')).toBeDefined();
  });

  it('desktop: topRight continua aparecendo mesmo sem trilha', () => {
    renderHeader(true, { topRight: <span>Ações</span> });
    expect(screen.getByText('Ações')).toBeDefined();
    expect(screen.queryByText('Relatórios')).toBeNull();
  });

  it('desktop: sem breadcrumbs não quebra e só mostra o título', () => {
    renderHeader(true, { breadcrumbs: [] });
    expect(screen.getByRole('heading', { name: 'Painel' })).toBeDefined();
  });

  it.each([
    { origem: 'implícito', trilha: breadcrumbs },
    { origem: 'explícito', trilha: [{ label: 'Início' }, ...breadcrumbs] },
  ])('Início $origem: separadores e itens são irmãos no ol, sem li aninhado', ({ trilha }) => {
    renderHeader(false, { breadcrumbs: trilha });
    const nav = screen.getByRole('navigation', { name: 'breadcrumb' });
    const lista = nav.querySelector('ol');
    expect(lista).not.toBeNull();
    expect(nav.querySelectorAll('li li')).toHaveLength(0);
    const separadores = nav.querySelectorAll('li[role="presentation"][aria-hidden="true"]');
    expect(separadores).toHaveLength(2);
    for (const separador of separadores) expect(separador.parentElement).toBe(lista);
    expect(lista?.children).toHaveLength(5);
    expect(screen.getAllByRole('link', { name: 'Início' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Vendas' })).toHaveAttribute('aria-current', 'page');
  });
});

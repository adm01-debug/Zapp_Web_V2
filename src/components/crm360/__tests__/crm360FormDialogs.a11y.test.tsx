import { axe } from 'vitest-axe';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';

/**
 * N-075 — os cinco seletores dos formulários de empresa e de contato
 * têm nome acessível ligado ao rótulo visível (getByRole combobox + axe
 * label/button-name zerado).
 *
 * Sem a correção (Label sem htmlFor / Select sem id):
 *  - getByRole('combobox', {name}) não encontra o elemento;
 *  - axe reporta violações de label/button-name.
 */

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { CompanyFormDialog } from '../CompanyFormDialog';
import { ContactFormDialog } from '../ContactFormDialog';

const COMBOBOX_LABELS_COMPANY = ['Status', 'Porte RF'];
const COMBOBOX_LABELS_CONTACT = ['Sexo', 'Estágio', 'Sentimento'];

function renderCompany(open = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}><CompanyFormDialog open={open} onOpenChange={vi.fn()} /></QueryClientProvider>);
}

function renderContact(open = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}><ContactFormDialog open={open} onOpenChange={vi.fn()} /></QueryClientProvider>);
}

describe('CompanyFormDialog — seletores com nome acessível', () => {
  it('getByRole("combobox") encontra Status e Porte RF com o rótulo visível ligado', () => {
    renderCompany();
    for (const label of COMBOBOX_LABELS_COMPANY) {
      expect(screen.getByRole('combobox', { name: label })).toBeInTheDocument();
    }
  });

  it('axe label/button-name zerado no diálogo de empresa', async () => {
    const { container } = renderCompany();
    const results = await axe(container, {
      runOnly: { type: 'rule', values: ['label', 'button-name'] },
    });
    expect(results).toHaveNoViolations();
  });
});

describe('ContactFormDialog — seletores com nome acessível', () => {
  it('getByRole("combobox") encontra Sexo, Estágio e Sentimento com o rótulo visível ligado', () => {
    renderContact();
    for (const label of COMBOBOX_LABELS_CONTACT) {
      expect(screen.getByRole('combobox', { name: label })).toBeInTheDocument();
    }
  });

  it('axe label/button-name zerado no diálogo de contato', async () => {
    const { container } = renderContact();
    const results = await axe(container, {
      runOnly: { type: 'rule', values: ['label', 'button-name'] },
    });
    expect(results).toHaveNoViolations();
  });
});
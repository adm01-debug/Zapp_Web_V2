/**
 * N-158 — Provedores de IA: nomes acessíveis no seletor e nos interruptores.
 *
 * O seletor de tipo e os dois interruptores (Ativo / Provedor Padrão)
 * não tinham aria-label, o que impedia que leitores de tela e
 * getByLabelText os encontrassem. A correção adiciona aria-label nos
 * três controles.
 *
 * Este teste FALHA sem a correção (getByLabelText lança) e PASSA com ela.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { AIProviderFormDialog } from '../AIProviderFormDialog';
import { EMPTY_FORM } from '../types';

const criarQueryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function renderizar() {
  const qc = criarQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <AIProviderFormDialog
        open={true}
        onOpenChange={() => {}}
        form={EMPTY_FORM}
        setForm={() => {}}
        editingId={null}
        isPending={false}
        onSave={() => {}}
        toggleUseFor={() => {}}
      />
    </QueryClientProvider>,
  );
}

describe('AIProviderFormDialog — acessibilidade', () => {
  it('encontra o seletor de tipo pelo aria-label', () => {
    renderizar();
    expect(screen.getByLabelText('Tipo de Provedor')).toBeInTheDocument();
  });

  it('encontra o interruptor Ativo pelo aria-label', () => {
    renderizar();
    expect(screen.getByLabelText('Ativo')).toBeInTheDocument();
  });

  it('encontra o interruptor Provedor Padrão pelo aria-label', () => {
    renderizar();
    expect(screen.getByLabelText('Provedor Padrão')).toBeInTheDocument();
  });

  it('não viola regras de acessibilidade do axe', async () => {
    const { container } = renderizar();
    const resultados = await axe(container);
    expect(resultados).toHaveNoViolations();
  });
});

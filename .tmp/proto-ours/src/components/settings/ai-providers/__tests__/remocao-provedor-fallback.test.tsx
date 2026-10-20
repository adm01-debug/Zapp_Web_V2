import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * R2-API-046 (#220) — "Exclusão de provedor promete fallback automático que o
 * roteamento não executa".
 *
 * Antes: a confirmação de remoção (AIProviderCard) dizia que as funcionalidades
 * seriam "automaticamente redirecionadas para o provedor padrão (Lovable AI)".
 * O roteador (`_shared/ai-routing.ts`) NÃO faz fallback: sem candidato
 * ativo+padrão para a finalidade ele lança NO_PROVIDER (503), e o único trigger
 * do banco é BEFORE INSERT OR UPDATE — no DELETE ninguém é eleito sucessor.
 *
 * Estes testes provam o comportamento novo: a confirmação declara as
 * finalidades que ficariam sem provedor e não promete redirecionamento.
 */

const banco = vi.hoisted(() => ({ provedores: [] as unknown[] }));

vi.mock('@/integrations/supabase/client', () => {
  const cadeia = (tabela: string) => {
    const builder: Record<string, unknown> = {};
    const mesmo = () => builder;
    builder.select = mesmo;
    builder.eq = mesmo;
    builder.gte = mesmo;
    builder.order = mesmo;
    builder.limit = mesmo;
    builder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({
        data: tabela === 'ai_providers' ? banco.provedores : [],
        error: null,
      }).then(resolve);
    return builder;
  };
  return { supabase: { from: (tabela: string) => cadeia(tabela) } };
});

import { TooltipProvider } from '@/components/ui/tooltip';
import { AIProviderCard } from '@/components/settings/ai-providers/AIProviderCard';
import { AIProvidersManager } from '@/components/settings/AIProvidersManager';
import {
  purposesLosingDefaultProvider,
  formatPurposeList,
} from '@/components/settings/ai-providers/deletionImpact';
import type { AIProvider } from '@/components/settings/ai-providers/types';

const provedor = (over: Partial<AIProvider> = {}): AIProvider => ({
  id: 'p1',
  name: 'Provedor A',
  description: null,
  provider_type: 'openai_compatible',
  api_endpoint: null,
  api_key_secret_name: null,
  model: 'gpt-4o',
  system_prompt: null,
  config: {},
  is_active: true,
  is_default: true,
  use_for: ['copilot'],
  created_at: '2026-10-01T00:00:00.000Z',
  ...over,
});

describe('R2-API-046 — confirmação de remoção não promete fallback inexistente', () => {
  it('declara as finalidades que ficam SEM provedor e não anuncia redirecionamento automático', async () => {
    render(
      <TooltipProvider>
        <AIProviderCard
          provider={provedor({ name: 'Provedor do Copiloto', use_for: ['copilot', 'summary'] })}
          testing={null}
          onTest={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          index={0}
          affectedPurposes={['copilot', 'summary']}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remover provedor' }));

    const dialogo = await screen.findByRole('alertdialog');
    const texto = within(dialogo).getByText(/único provedor ativo e padrão/i);
    expect(texto.textContent).toMatch(/Copiloto e Resumo/);
    expect(texto.textContent).toMatch(/ficam sem provedor/i);
    expect(texto.textContent).toMatch(/erro de roteamento/i);

    // A promessa falsa tem de sumir por completo.
    expect(within(dialogo).queryByText(/automaticamente redirecionadas/i)).toBeNull();
    expect(within(dialogo).queryByText(/Lovable AI/i)).toBeNull();
    expect(within(dialogo).queryByText(/redirecionad/i)).toBeNull();
  });

  it('sem finalidade órfã, diz que a remoção NÃO deixa buraco no roteamento', async () => {
    render(
      <TooltipProvider>
        <AIProviderCard
          provider={provedor({ use_for: ['copilot'] })}
          testing={null}
          onTest={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          index={0}
          affectedPurposes={[]}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remover provedor' }));

    const dialogo = await screen.findByRole('alertdialog');
    const texto = within(dialogo).getByText(/irreversível/i);
    expect(texto.textContent).toMatch(/Nenhuma finalidade ficará sem provedor ativo e padrão/i);
    expect(within(dialogo).queryByText(/automaticamente redirecionadas/i)).toBeNull();
  });

  it('o gerenciador liga a lista real de finalidades órfãs ao cartão (integração)', async () => {
    banco.provedores = [
      // Único ativo+padrão para copilot e summary: removê-lo abre buraco nessas duas.
      provedor({ id: 'a', name: 'Provedor A', use_for: ['copilot', 'summary'] }),
      // Padrão de outra finalidade (tagging): NÃO cobre copilot/summary.
      provedor({
        id: 'b',
        name: 'Provedor B',
        provider_type: 'google_gemini',
        use_for: ['tagging'],
      }),
      // Antigo padrão de copilot agora inativo: não conta como sucessor.
      provedor({
        id: 'c',
        name: 'Provedor C',
        provider_type: 'custom_agent',
        is_active: false,
        use_for: ['copilot'],
      }),
    ];

    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <TooltipProvider>
        <QueryClientProvider client={client}>
          <AIProvidersManager />
        </QueryClientProvider>
      </TooltipProvider>,
    );

    await screen.findByText('Provedor A');
    // O primeiro cartão é o do Provedor A (a consulta preserva a ordem da lista
    // mockada). B e C também exibem o botão de remover, mas só A recebe a lista
    // de finalidades órfãs calculada pelo gerenciador.
    const botoesRemover = screen.getAllByRole('button', { name: 'Remover provedor' });
    expect(botoesRemover.length).toBeGreaterThan(1);
    fireEvent.click(botoesRemover[0]);

    const dialogo = await screen.findByRole('alertdialog');
    const texto = within(dialogo).getByText(/único provedor ativo e padrão/i);
    expect(texto.textContent).toMatch(/Copiloto e Resumo/);
    expect(texto.textContent).not.toMatch(/Auto-tagging/);
    expect(within(dialogo).queryByText(/automaticamente redirecionadas/i)).toBeNull();
  });
});

describe('R2-API-046 — purposesLosingDefaultProvider espelha o predicado do roteador', () => {
  const alvo = provedor({ id: 'alvo', use_for: ['copilot', 'summary'] });

  it('sem sucessor algum: todas as finalidades do alvo ficam órfãs', () => {
    expect(purposesLosingDefaultProvider([alvo], alvo)).toEqual(['copilot', 'summary']);
  });

  it('sucessor ATIVO+PADRÃO que cobre só parte: a parte descoberta é declarada', () => {
    const sucessor = provedor({ id: 'outro', use_for: ['copilot'] });
    expect(purposesLosingDefaultProvider([alvo, sucessor], alvo)).toEqual(['summary']);
  });

  it('sucessor INATIVO não conta como sucessor', () => {
    const inativo = provedor({ id: 'outro', is_active: false, use_for: ['copilot', 'summary'] });
    expect(purposesLosingDefaultProvider([alvo, inativo], alvo)).toEqual(['copilot', 'summary']);
  });

  it('sucessor ativo mas NÃO padrão não conta como sucessor', () => {
    const naoPadrao = provedor({ id: 'outro', is_default: false, use_for: ['copilot', 'summary'] });
    expect(purposesLosingDefaultProvider([alvo, naoPadrao], alvo)).toEqual(['copilot', 'summary']);
  });

  it('sucessor ativo+padrão sem a finalidade em use_for não conta', () => {
    const outraFinalidade = provedor({ id: 'outro', use_for: ['tagging'] });
    expect(purposesLosingDefaultProvider([alvo, outraFinalidade], alvo)).toEqual(['copilot', 'summary']);
  });

  it('sucessor válido para tudo: nenhuma finalidade fica órfã', () => {
    const sucessor = provedor({ id: 'outro', use_for: ['copilot', 'summary'] });
    expect(purposesLosingDefaultProvider([alvo, sucessor], alvo)).toEqual([]);
  });

  it('alvo que não é padrão (ou está inativo) não tira cobertura de ninguém', () => {
    const naoPadrao = provedor({ id: 'alvo', is_default: false, use_for: ['copilot', 'summary'] });
    expect(purposesLosingDefaultProvider([naoPadrao], naoPadrao)).toEqual([]);
    const inativo = provedor({ id: 'alvo', is_active: false, use_for: ['copilot', 'summary'] });
    expect(purposesLosingDefaultProvider([inativo], inativo)).toEqual([]);
  });

  it('a ordem da lista não muda o resultado e a entrada não é mutada', () => {
    const sucessor = provedor({ id: 'outro', use_for: ['copilot'] });
    const entrada = [sucessor, alvo];
    const copia = JSON.parse(JSON.stringify(entrada)) as AIProvider[];
    expect(purposesLosingDefaultProvider(entrada, alvo)).toEqual(['summary']);
    expect(purposesLosingDefaultProvider([alvo, sucessor], alvo)).toEqual(['summary']);
    expect(entrada).toEqual(copia);
  });

  it('usa os rótulos pt-BR das finalidades na lista legível', () => {
    expect(formatPurposeList(['copilot'])).toBe('Copiloto');
    expect(formatPurposeList(['copilot', 'summary'])).toBe('Copiloto e Resumo');
    expect(formatPurposeList(['copilot', 'summary', 'tagging'])).toBe(
      'Copiloto, Resumo e Auto-tagging',
    );
    expect(formatPurposeList(['desconhecida'])).toBe('desconhecida');
    expect(formatPurposeList([])).toBe('');
  });
});

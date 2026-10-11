/**
 * X106 (cartão TL-131) — os campos de valor por tipo do construtor de segmentos.
 *
 * A prova monta o caminho real da tela: o `TalkXSegments` VERDADEIRO (o motor de
 * regras entra real, só o CRUD e o cliente Supabase são spies), adiciona a
 * condição pelo catálogo de Filtros — o mesmo clique do usuário — e confere o
 * que a tela MOSTRA e o que ela GRAVA (as regras que chegam ao `createSegment`).
 *
 * Antes do fix (vermelho):
 *  - a lista de opções de um campo enum mostrava o valor cru do banco
 *    (`cliente`, `granted`, `open`) e não tinha opção "Prestador de Serviço";
 *  - o campo de data era uma caixa de texto com a dica "30 (dias)": não havia
 *    atalho de período nenhum (7/30/60/90/180).
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// O jsdom não implementa captura de ponteiro; o gatilho do Select (Radix)
// chama `hasPointerCapture` no pointerdown que o abre.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

const f = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ profile: { id: 'user-1' } }) }));

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: () => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.order = () => chain;
    chain.single = () => Promise.resolve({ data: null, error: null });
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
    return chain;
  },
}));

vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.not = () => chain;
  chain.or = () => chain;
  chain.order = () => chain;
  chain.limit = () => chain;
  chain.eq = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
  return {
    supabase: {
      from: () => chain,
      rpc: (_name: string, args?: { p_mode?: string }) => Promise.resolve({
        data: args?.p_mode === 'page'
          ? { mode: 'page', rows: [], has_more: false, next_after: null }
          : { mode: 'count', matched: 42, eligible: 42, suppressed: 0, invalid_phone: 0, legacy_or_deleted: 0 },
        error: null,
      }),
    },
  };
});

// O motor de regras entra REAL; só a lista e o CRUD de segmentos viram spies.
vi.mock('@/hooks/integrations/useTalkXSegments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/integrations/useTalkXSegments')>();
  return {
    ...actual,
    useTalkXSegments: () => ({
      segments: [], isLoading: false, isError: false, error: null,
      refetch: vi.fn(),
      createSegment: { mutateAsync: f.create },
      updateSegment: { mutateAsync: f.update },
      deleteSegment: { mutate: vi.fn() },
      refreshEstimates: { mutate: vi.fn() },
    }),
  };
});

import { TalkXSegments } from '@/components/talkx/TalkXSegments';
import { CONTACT_TYPES } from '@/utils/whatsappFileTypes';

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TalkXSegments onUseCampaign={() => {}} />
    </QueryClientProvider>,
  );
}

/** Abre o construtor, nomeia o segmento e adiciona uma condição pelo catálogo. */
async function condicaoPeloCatalogo(filtro: string, nome = 'Segmento por tipo') {
  renderView();
  fireEvent.click(await screen.findByRole('button', { name: 'Novo segmento' }));
  fireEvent.change(await screen.findByPlaceholderText('Nome do segmento…'), { target: { value: nome } });
  fireEvent.click(screen.getByRole('button', { name: filtro }));
  return screen.findByRole('button', { name: /Publicar segmento/ });
}

/** Regras que o construtor mandou gravar. */
async function regraGravada() {
  await waitFor(() => expect(f.create).toHaveBeenCalled());
  const enviado = f.create.mock.calls[0][0] as { rules: { groups: { rules: Array<Record<string, unknown>> }[] } };
  return enviado.rules.groups[0].rules[0];
}

describe('TalkXSegments · campo de valor por tipo (X106)', () => {
  beforeEach(() => {
    f.create.mockReset();
    f.update.mockReset();
    f.create.mockResolvedValue(undefined);
  });

  it('lista: mostra o rótulo legível e grava o valor do banco', async () => {
    const publicar = await condicaoPeloCatalogo('Tipo do contato');
    // Os dois lados vêm da fonte canônica do tipo de contato: o rótulo que a
    // tela mostra e o valor cru que a regra precisa gravar.
    const cliente = CONTACT_TYPES[0];
    const prestador = CONTACT_TYPES.find((t) => t.value === 'prestador_servico')!;

    const valor = screen.getByRole('combobox', { name: 'Valor da condição' });
    expect(valor).toHaveTextContent(cliente.label);

    fireEvent.pointerDown(valor, { button: 0, ctrlKey: false, pointerType: 'mouse' });
    fireEvent.click(screen.getByRole('option', { name: prestador.label }));
    expect(valor).toHaveTextContent(prestador.label);

    fireEvent.click(publicar);

    expect(await regraGravada()).toMatchObject({
      field: 'contact_type',
      op: 'eq',
      value: prestador.value,
    });
  });

  it('período: atalhos 7/30/60/90/180 e digitação livre gravam só os dias', async () => {
    const publicar = await condicaoPeloCatalogo('Última interação', 'Sumidos');

    const dias = screen.getByLabelText('Período em dias') as HTMLInputElement;
    expect(dias.value).toBe('');

    fireEvent.click(screen.getByRole('button', { name: '30 dias' }));
    expect(dias.value).toBe('30');

    fireEvent.change(dias, { target: { value: '45' } });
    expect(dias.value).toBe('45');

    fireEvent.click(publicar);

    expect(await regraGravada()).toMatchObject({
      field: 'updated_at',
      op: 'in_last_days',
      value: '45',
    });
  });

  it('número "em breve" (lead_score): botão desabilitado e sem condição adicionada', async () => {
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: 'Novo segmento' }));
    // O botão continua visível com o MESMO nome acessível ("Lead score"), mas
    // desabilitado: a coluna nunca é calculada e o filtro seria morto.
    const leadScore = screen.getByRole('button', { name: 'Lead score' });
    expect(leadScore).toBeDisabled();
    fireEvent.click(leadScore);
    expect(screen.queryByLabelText('Valor da condição')).toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * R2-API-050 / item 224 (P2) — reabrir um WhatsApp Flow pode sobrescrever as
 * telas já salvas.
 *
 * Defeito: o editor guarda a lista (`flows`) vinda do banco e o objeto aberto
 * (`selectedFlow`). Toda edição salva no banco através de `updateFlowScreens`,
 * que atualizava SÓ o `selectedFlow` — nunca a entrada correspondente em
 * `flows`. Ao voltar para a lista e reabrir o mesmo flow, o objeto aberto era a
 * cópia VELHA da lista; a primeira edição depois disso gravava esse estado
 * desatualizado por cima do banco, apagando as telas salvas entre a primeira
 * edição e a reabertura.
 *
 * Este teste fixa o contrato: depois de editar e reabrir, a próxima gravação
 * carrega TODAS as telas (não a versão velha).
 */
const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: fromMock } }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));
// O PageHeader real lê Router + LayoutContext e estoura no jsdom; a convenção da
// suíte é trocar por um stub que preserva título/subtítulo/ações.
vi.mock('@/components/layout/PageHeader', () => ({
  PageHeader: ({ title, subtitle, actions }: { title?: string; subtitle?: string; actions?: import('react').ReactNode }) => (
    <div>
      <h1>{title}</h1>
      <p>{subtitle}</p>
      {actions}
    </div>
  ),
}));

import { WhatsAppFlowsBuilder } from '../WhatsAppFlowsBuilder';
import type { Json } from '@/integrations/supabase/types';

type ScreensPayload = Array<{ id: string; title: string; layout: unknown[] }>;

function flowRow() {
  return {
    id: 'flow-1',
    name: 'Meu Flow',
    description: 'desc',
    flow_json: {} as Json,
    status: 'draft',
    whatsapp_flow_id: null,
    created_at: '2026-10-01T00:00:00Z',
    screens: [
      { id: 's1', title: 'Tela 1', layout: [{ id: 'c1', type: 'TextHeading', text: 'Oi' }] },
      { id: 's2', title: 'Tela 2', layout: [{ id: 'c2', type: 'TextHeading', text: 'Tchau' }] },
    ],
  };
}

describe('WhatsAppFlowsBuilder — reabrir não sobrescreve telas salvas (R2-API-050)', () => {
  let updates: ScreensPayload[];

  beforeEach(() => {
    vi.clearAllMocks();
    updates = [];
    fromMock.mockImplementation(() => ({
      select: vi.fn(() => ({ order: vi.fn(async () => ({ data: [flowRow()], error: null })) })),
      insert: vi.fn(async () => ({ error: null })),
      update: vi.fn((payload: { screens: ScreensPayload }) => {
        updates.push(payload.screens);
        return { eq: vi.fn(async () => ({ error: null })) };
      }),
      delete: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
    }));
  });

  it('a edição após reabrir grava todas as telas, não a cópia velha da lista', async () => {
    render(<WhatsAppFlowsBuilder />);

    // 1) lista carregada
    await waitFor(() => expect(screen.getByText('Meu Flow')).toBeTruthy());

    // 2) abre o flow
    fireEvent.click(screen.getByText('Meu Flow'));
    await waitFor(() => expect(screen.getByText('Editor de WhatsApp Flow')).toBeTruthy());

    // 3) adiciona uma tela -> grava 3 telas
    fireEvent.click(screen.getByRole('button', { name: 'Tela' }));
    await waitFor(() => expect(updates.length).toBe(1));
    expect(updates[0]).toHaveLength(3);

    // 4) volta para a lista
    fireEvent.click(screen.getByRole('button', { name: /Voltar/ }));
    await waitFor(() => expect(screen.queryByText('Editor de WhatsApp Flow')).toBeNull());

    // 5) reabre o MESMO flow
    fireEvent.click(screen.getByText('Meu Flow'));
    await waitFor(() => expect(screen.getByText('Editor de WhatsApp Flow')).toBeTruthy());

    // 6) primeira edição depois de reabrir
    fireEvent.click(screen.getByRole('button', { name: 'Título' }));
    await waitFor(() => expect(updates.length).toBe(2));

    // O defeito gravava 2 telas aqui (a cópia velha), perdendo a Tela 3.
    expect(updates[1]).toHaveLength(3);
  });
});

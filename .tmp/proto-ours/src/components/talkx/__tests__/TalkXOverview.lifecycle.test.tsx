import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * TL-054/2 (X051) — a Visão geral resolve iniciar/pausar/retomar/cancelar pelo
 * controlador ÚNICO (`useTalkXLifecycle`): a tela não tem mais handler próprio
 * nem diálogo próprio dessas quatro ações. A EXCLUSÃO não é ciclo de vida e
 * continua no `TalkXConfirmDialog` local.
 *
 * O teste renderiza o componente REAL e abre o menu "Ações" da linha (Radix:
 * `ArrowDown` no gatilho, o mesmo gesto de teclado do usuário). Quem prova a
 * troca é o espião do hook: sem a troca, o clique chamaria as props
 * `onStart`/`onPause`/`onCancel` e o diálogo do hook não existiria (o rótulo
 * "Confirmar envio" não estaria na tela). As props seguem sendo passadas de
 * propósito, para provar que a tela deixou de lê-las.
 */

const mocks = vi.hoisted(() => ({
  startCampaign: vi.fn(),
  pauseCampaign: vi.fn(),
  cancelCampaign: vi.fn(),
  updateCampaign: { mutateAsync: vi.fn() },
}));

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: [],
    isLoading: false,
    isError: false,
    error: null,
    isLive: false,
    refetchCampaigns: vi.fn(),
    startCampaign: mocks.startCampaign,
    pauseCampaign: mocks.pauseCampaign,
    cancelCampaign: mocks.cancelCampaign,
    updateCampaign: mocks.updateCampaign,
    deleteCampaign: { mutate: vi.fn() },
    duplicateCampaign: { mutateAsync: vi.fn() },
  }),
}));

vi.mock('@/hooks/integrations/useTalkXInsights', () => ({
  useTalkXInsights: () => ({ data: undefined, isLoading: false, isError: false, error: null }),
}));

// X077 — os KPIs vêm da RPC; este teste não exercita essa consulta.
vi.mock('@/hooks/integrations/useTalkXOverviewStats', () => ({
  useTalkXOverviewStats: () => ({ data: undefined }),
}));

vi.mock('@/hooks/integrations/useTalkXSegments', () => ({
  useTalkXSegments: () => ({ segments: [] }),
}));

import { TalkXOverview } from '../TalkXOverview';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';

const campaign = (over: Record<string, unknown> = {}) =>
  ({
    id: 'c1',
    name: 'Campanha teste',
    status: 'draft',
    message_template: 'Oi {{nome}}',
    description: '',
    objective: 'engajamento',
    segment_id: null,
    audience_source: 'manual',
    created_by: 'u1',
    sent_count: 0,
    failed_count: 0,
    total_recipients: 20,
    created_at: '2026-10-01T10:00:00.000Z',
    updated_at: '2026-10-01T10:00:00.000Z',
    started_at: null,
    completed_at: null,
    scheduled_at: null,
    draft_step: null,
    ...over,
  }) as unknown as TalkXCampaign;

/** Props de ciclo de vida passadas de propósito: a tela NÃO deve chamá-las. */
const propsCicloDeVida = () => {
  const onStart = vi.fn();
  const onPause = vi.fn();
  const onCancel = vi.fn();
  return { onStart, onPause, onCancel };
};

const renderOverview = (
  c: TalkXCampaign,
  onDelete: () => void = vi.fn(),
  ciclo = propsCicloDeVida(),
) =>
  render(
    <TalkXOverview
      campaigns={[c]}
      segments={[]}
      creators={{}}
      isLoading={false}
      isError={false}
      error={null}
      onNew={vi.fn()}
      onEdit={vi.fn()}
      onView={vi.fn()}
      onDuplicate={vi.fn()}
      onDelete={onDelete}
      onGoTab={vi.fn()}
      {...ciclo}
    />,
  );

const abrirMenuAcoes = () =>
  fireEvent.keyDown(screen.getByRole('button', { name: 'Ações' }), { key: 'ArrowDown' });

const clicarItemDoMenu = (nome: string) =>
  fireEvent.click(screen.getByRole('menuitem', { name: nome }));

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe('Visão geral — ciclo de vida pelo controlador único (X051)', () => {
  it('iniciar: o diálogo do hook confirma e dispara startCampaign, não a prop onStart', async () => {
    mocks.startCampaign.mockResolvedValue(true);
    const ciclo = propsCicloDeVida();
    renderOverview(campaign({ status: 'draft' }), vi.fn(), ciclo);

    abrirMenuAcoes();
    clicarItemDoMenu('Iniciar agora');

    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo.textContent).toContain('Confirmar disparo?');

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar envio' }));

    await waitFor(() => expect(mocks.startCampaign).toHaveBeenCalledWith('c1'));
    expect(ciclo.onStart).not.toHaveBeenCalled();
    expect(ciclo.onPause).not.toHaveBeenCalled();
    expect(ciclo.onCancel).not.toHaveBeenCalled();
  });

  it('pausar: o motivo digitado no diálogo do hook chega em pauseCampaign', async () => {
    const ciclo = propsCicloDeVida();
    renderOverview(campaign({ status: 'sending' }), vi.fn(), ciclo);

    abrirMenuAcoes();
    clicarItemDoMenu('Pausar');

    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo.textContent).toContain('Pausar campanha?');

    fireEvent.change(screen.getByPlaceholderText('Motivo da pausa (opcional)'), {
      target: { value: 'pausa de ensaio' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pausar agora' }));

    await waitFor(() => expect(mocks.pauseCampaign).toHaveBeenCalledWith('c1', 'pausa de ensaio'));
    expect(ciclo.onPause).not.toHaveBeenCalled();
  });

  it('retomar: o diálogo do hook dispara startCampaign, não a prop onStart', async () => {
    mocks.startCampaign.mockResolvedValue(true);
    const ciclo = propsCicloDeVida();
    renderOverview(campaign({ status: 'paused' }), vi.fn(), ciclo);

    abrirMenuAcoes();
    clicarItemDoMenu('Retomar');

    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo.textContent).toContain('Retomar campanha?');

    fireEvent.click(screen.getByRole('button', { name: 'Retomar' }));

    await waitFor(() => expect(mocks.startCampaign).toHaveBeenCalledWith('c1'));
    expect(ciclo.onStart).not.toHaveBeenCalled();
  });

  it('cancelar: o diálogo do hook dispara cancelCampaign, não a prop onCancel', async () => {
    const ciclo = propsCicloDeVida();
    renderOverview(campaign({ status: 'sending' }), vi.fn(), ciclo);

    abrirMenuAcoes();
    clicarItemDoMenu('Cancelar campanha');

    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo.textContent).toContain('Cancelar campanha?');

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(mocks.cancelCampaign).toHaveBeenCalledWith('c1'));
    expect(ciclo.onCancel).not.toHaveBeenCalled();
    expect(mocks.startCampaign).not.toHaveBeenCalled();
  });

  it('excluir continua no diálogo local: chama onDelete e não passa pelo ciclo de vida', async () => {
    const onDelete = vi.fn();
    renderOverview(campaign({ status: 'draft' }), onDelete);

    abrirMenuAcoes();
    clicarItemDoMenu('Excluir');

    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo.textContent).toContain('Excluir campanha');

    fireEvent.click(screen.getByRole('button', { name: 'Excluir campanha' }));

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('c1'));
    expect(mocks.startCampaign).not.toHaveBeenCalled();
    expect(mocks.pauseCampaign).not.toHaveBeenCalled();
    expect(mocks.cancelCampaign).not.toHaveBeenCalled();
  });
});

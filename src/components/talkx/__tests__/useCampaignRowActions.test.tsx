import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * X080 — ações de linha persistidas: duplicar, excluir com regra, pausar,
 * retomar e cancelar.
 *
 * O teste roda o hook REAL (o mesmo que a Visão geral usa) e os modais reais do
 * kit; no fim, a mesma prova pela tabela renderizada, para garantir que o menu
 * da tela passou a sair do hook.
 *
 * Casos protegidos:
 * 1. matriz das ações pelos 6 status, sem perder nenhuma ação que a tela já
 *    oferecia e com "Excluir" só onde a regra do banco permite (rascunho e
 *    agendada);
 * 2. "Ver"/"Editar" navegam na hora e NÃO abrem confirmação;
 * 3. confirmar "Duplicar" chama o responsável UMA vez, com a campanha;
 * 4. recusa do servidor mantém o modal aberto com a mensagem (nada de sucesso
 *    antes da confirmação) — duplicar e excluir (`talkx_campaign_delete_denied`);
 * 5. pausa exige motivo e entrega o motivo junto com a ação;
 * 6. clique repetido no botão de espera não dispara a ação duas vezes;
 * 7. a tabela da Visão geral usa o hook: o menu sai por `actionsFor`/`run`.
 */

vi.mock('@/hooks/integrations/useTalkXInsights', () => ({
  useTalkXInsights: () => ({ data: undefined, isLoading: false, isError: false, error: null }),
}));

import { campaignRowActions, useCampaignRowActions } from '../useCampaignRowActions';
import type { CampaignRowActionHandlers, CampaignRowActions } from '../useCampaignRowActions';
import { TalkXOverview } from '../TalkXOverview';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';

function campanha(status: string, extra: Record<string, unknown> = {}): TalkXCampaign {
  return {
    id: `c-${status}`,
    name: `Campanha ${status}`,
    status,
    message_template: 'Oi {{nome}}',
    description: '',
    objective: 'engajamento',
    segment_id: null,
    audience_source: 'manual',
    created_by: 'u1',
    total_recipients: 10,
    sent_count: 0,
    failed_count: 0,
    delivered_count: 0,
    created_at: '2026-10-01T10:00:00.000Z',
    updated_at: '2026-10-01T10:00:00.000Z',
    started_at: null,
    completed_at: null,
    scheduled_at: null,
    paused_at: null,
    ...extra,
  } as unknown as TalkXCampaign;
}

const ids = (status: string, extra: Record<string, unknown> = {}) =>
  campaignRowActions(campanha(status, extra)).map((a) => a.id);

describe('campaignRowActions — matriz das ações por status (X080)', () => {
  it('rascunho: ver, editar, iniciar (com público), duplicar e excluir', () => {
    expect(ids('draft')).toEqual(['view', 'edit', 'start', 'duplicate', 'delete']);
  });

  it('rascunho sem público não oferece "Iniciar agora"', () => {
    expect(ids('draft', { total_recipients: 0 })).toEqual(['view', 'edit', 'duplicate', 'delete']);
  });

  it('agendada: ver agendamento, editar, iniciar, duplicar, cancelar e excluir', () => {
    expect(ids('scheduled')).toEqual(['view', 'edit', 'start', 'duplicate', 'cancel', 'delete']);
  });

  it('em envio: em andamento, pausar, duplicar e cancelar — excluir NÃO aparece', () => {
    // A regra de CAP-109 (`delete_talkx_campaign`) só aceita rascunho e agendada.
    expect(ids('sending')).toEqual(['view', 'pause', 'duplicate', 'cancel']);
  });

  it('pausada: em andamento, retomar, duplicar e cancelar — excluir NÃO aparece', () => {
    expect(ids('paused')).toEqual(['view', 'resume', 'duplicate', 'cancel']);
  });

  it('concluída e cancelada: ver o relatório/monitorar e duplicar', () => {
    expect(ids('completed')).toEqual(['view', 'duplicate']);
    expect(ids('cancelled')).toEqual(['view', 'duplicate']);
  });

  it('rótulos de "Ver" acompanham o status, como a tabela já mostrava', () => {
    const label = (status: string) => campaignRowActions(campanha(status)).find((a) => a.id === 'view')?.label;
    expect(label('draft')).toBe('Monitorar');
    expect(label('scheduled')).toBe('Ver agendamento');
    expect(label('sending')).toBe('Em andamento');
    expect(label('paused')).toBe('Em andamento');
    expect(label('completed')).toBe('Ver relatório');
  });

  it('ações destrutivas são só cancelar e excluir', () => {
    const destrutivas = campaignRowActions(campanha('scheduled')).filter((a) => a.destructive).map((a) => a.id);
    expect(destrutivas).toEqual(['cancel', 'delete']);
  });
});

/** Monta o hook real e deixa os modais reais no DOM. */
function montar(handlers: Partial<CampaignRowActionHandlers> = {}) {
  const api = { current: null as CampaignRowActions | null };
  const completo: CampaignRowActionHandlers = {
    onView: vi.fn(),
    onViewScheduled: vi.fn(),
    onViewRunning: vi.fn(),
    onEdit: vi.fn(),
    onStart: vi.fn(),
    onPause: vi.fn(),
    onCancel: vi.fn(),
    onDelete: vi.fn(),
    onDuplicate: vi.fn(),
    ...handlers,
  };
  function Harness() {
    api.current = useCampaignRowActions(completo);
    return <>{api.current.dialogs}</>;
  }
  render(<Harness />);
  return { api, handlers: completo };
}

const clicar = async (nome: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: nome }));
  });
};

describe('useCampaignRowActions — ações de linha (X080)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('"Ver" roteia pelo status sem abrir confirmação', () => {
    const { api, handlers } = montar();
    act(() => api.current!.run('view', campanha('scheduled')));
    expect(handlers.onViewScheduled).toHaveBeenCalledTimes(1);
    expect(handlers.onView).not.toHaveBeenCalled();

    act(() => api.current!.run('view', campanha('sending')));
    expect(handlers.onViewRunning).toHaveBeenCalledTimes(1);

    act(() => api.current!.run('view', campanha('completed')));
    expect(handlers.onView).toHaveBeenCalledTimes(1);

    expect(screen.queryByRole('button', { name: 'Confirmar' })).toBeNull();
  });

  it('"Editar" navega na hora', () => {
    const { api, handlers } = montar();
    const c = campanha('draft');
    act(() => api.current!.run('edit', c));
    expect(handlers.onEdit).toHaveBeenCalledWith(c);
  });

  it('confirmar "Duplicar" chama a duplicação UMA vez, com a campanha', async () => {
    const onDuplicate = vi.fn().mockResolvedValue(undefined);
    const { api, handlers } = montar({ onDuplicate });
    const c = campanha('completed');

    act(() => api.current!.run('duplicate', c));
    expect(onDuplicate).not.toHaveBeenCalled(); // só depois da confirmação
    expect(screen.getByText(/Campanha completed/)).toBeTruthy();

    await clicar('Duplicar');
    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(onDuplicate).toHaveBeenCalledWith(c);
    expect(handlers.onDuplicate).toBe(onDuplicate);
  });

  it('recusa ao duplicar mantém o modal aberto com a mensagem do servidor', async () => {
    const onDuplicate = vi.fn().mockRejectedValue(new Error('A campanha de origem não está disponível'));
    const { api } = montar({ onDuplicate });

    act(() => api.current!.run('duplicate', campanha('draft')));
    await clicar('Duplicar');

    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/A campanha de origem não está disponível/)).toBeTruthy();
    // A confirmação continua na tela: nada foi anunciado como concluído.
    expect(screen.getByRole('button', { name: 'Duplicar' })).toBeTruthy();
  });

  it('recusa `talkx_campaign_delete_denied` mostra a mensagem e não some com a linha', async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error('talkx_campaign_delete_denied'));
    const { api } = montar({ onDelete });

    act(() => api.current!.run('delete', campanha('draft')));
    await clicar('Excluir campanha');

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/talkx_campaign_delete_denied/)).toBeTruthy();
    expect(screen.getByText(/Campanha draft/)).toBeTruthy();
  });

  it('pausar exige o motivo e entrega o motivo junto com a ação', async () => {
    const onPause = vi.fn().mockResolvedValue(undefined);
    const { api } = montar({ onPause });
    const c = campanha('sending');

    act(() => api.current!.run('pause', c));
    const confirmar = screen.getByRole('button', { name: 'Pausar campanha' }) as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);

    await clicar('Pausar campanha');
    expect(onPause).not.toHaveBeenCalled(); // sem motivo não sai do navegador

    const motivo = screen.getByLabelText('Motivo da pausa');
    fireEvent.change(motivo, { target: { value: 'Conferir o texto antes de continuar' } });
    await clicar('Pausar campanha');

    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onPause).toHaveBeenCalledWith('c-sending', 'Conferir o texto antes de continuar');
  });

  it('clique repetido durante a espera não dispara a ação duas vezes', async () => {
    let liberar: () => void = () => undefined;
    const onCancel = vi.fn(() => new Promise<void>((resolve) => { liberar = resolve; }));
    const { api } = montar({ onCancel });

    act(() => api.current!.run('cancel', campanha('sending')));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar campanha' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar campanha' }));
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
    await act(async () => { liberar(); });
    expect(api.current!.pendingId).toBeNull();
  });
});

describe('TalkXOverview — o menu da linha sai do hook (X080)', () => {
  const props = {
    campaigns: [campanha('paused', { id: 'c-paused', name: 'Campanha pausada' })],
    segments: [],
    creators: {},
    isLoading: false,
    isError: false,
    error: null,
    onNew: vi.fn(),
    onEdit: vi.fn(),
    onView: vi.fn(),
    onViewScheduled: vi.fn(),
    onViewRunning: vi.fn(),
    onDuplicate: vi.fn(),
    onStart: vi.fn(),
    onPause: vi.fn(),
    onCancel: vi.fn(),
    onDelete: vi.fn(),
    onGoTab: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('mostra as ações do status e confirma "Retomar" pelo modal', async () => {
    render(<TalkXOverview {...props} />);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Ações' }));
    expect(await screen.findByRole('menuitem', { name: 'Retomar' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Duplicar' })).toBeTruthy();
    // "Excluir" não vale para campanha pausada (a regra do banco só aceita
    // rascunho e agendada).
    expect(screen.queryByRole('menuitem', { name: 'Excluir' })).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Retomar' }));
    });
    await clicar('Retomar');

    expect(props.onStart).toHaveBeenCalledTimes(1);
    expect(props.onStart).toHaveBeenCalledWith('c-paused');
  });
});

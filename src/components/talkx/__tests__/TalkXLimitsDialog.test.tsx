import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

/**
 * X154 (TL-161) — modal "Editar Limites de Envio" (tela 12), agora em
 * `tracking/TalkXLimitsDialog.tsx`.
 *
 * Mantém as funções de X006 — o modal exibe e recebe SEGUNDOS, o banco guarda
 * MILISSEGUNDOS — e prova que o payload continua dentro da lista branca da RPC
 * `update_talkx_campaign_limits` (chave fora dela = `invalid_talkx_limits_field`).
 *
 * Vermelho antes do fix: o modal vivia embutido em `TalkXCampaignRunning` e não havia
 * componente próprio para exercitar; o payload é o mesmo de X006 (não regride).
 */

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: toastError, info: vi.fn(), warning: vi.fn() },
}));

import { TalkXLimitsDialog } from '@/components/talkx/tracking/TalkXLimitsDialog';
import {
  limitsDraftFromCampaign, limitsPayload,
  type TalkXLimitsDraft, type TalkXLimitsPayload,
} from '@/components/talkx/tracking/talkxCampaignRules';

// Campanha de exemplo: intervalos em MILISSEGUNDOS, como vêm do banco.
const CAMPAIGN = {
  id: 'c1',
  name: 'Campanha Teste',
  message_template: 'Olá {{nome}}',
  variables_config: [],
  typing_delay_min: 1500,
  typing_delay_max: 4000,
  send_interval_min: 8000,
  send_interval_max: 20000,
  status: 'sending',
  total_recipients: 10,
  sent_count: 5,
  failed_count: 0,
  delivered_count: 5,
  whatsapp_connection_id: null,
  created_by: null,
  started_at: null,
  completed_at: null,
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-01T10:00:00.000Z',
  media_url: null,
  media_type: null,
  scheduled_at: null,
  speed_profile: 'moderate' as const,
  send_window_start: '08:00:00',
  send_window_end: '18:00:00',
  business_hours_only: false,
  revision: 1,
};

/** Envolve o modal controlado para o operador poder digitar. */
function Harness({ initial, onSave }: { initial: TalkXLimitsDraft; onSave: (limits: TalkXLimitsPayload) => void }) {
  const [draft, setDraft] = React.useState(initial);
  return (
    <TalkXLimitsDialog
      open
      onOpenChange={() => {}}
      draft={draft}
      onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
      onSave={onSave}
    />
  );
}

const renderDialog = (onSave = vi.fn()) => {
  const initial = limitsDraftFromCampaign(CAMPAIGN);
  render(<Harness initial={initial} onSave={onSave} />);
  return { onSave, initial };
};

describe('TalkXLimitsDialog · Editar limites (X006 mantido)', () => {
  beforeEach(() => {
    toastError.mockClear();
  });

  it('abre com os intervalos do banco em segundos (8000 ms → 8 s)', () => {
    const { initial } = renderDialog();

    expect(initial.intervalMin).toBe(8);
    expect(initial.intervalMax).toBe(20);
    const spinbuttons = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    expect(spinbuttons[0].value).toBe('8');
    expect(spinbuttons[1].value).toBe('20');
  });

  it('digitar 10 no intervalo mínimo entrega send_interval_min=10000 (ms), nunca 10', () => {
    const { onSave } = renderDialog();

    const spinbuttons = screen.getAllByRole('spinbutton');
    fireEvent.change(spinbuttons[0], { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar Limites/i }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const limits = onSave.mock.calls[0][0] as TalkXLimitsPayload;
    expect(limits.send_interval_min).toBe(10000);
    expect(limits.send_interval_max).toBe(20000);
  });

  it('trocar para "Lento (seguro)" preenche os intervalos do perfil e converte para ms', () => {
    const { onSave } = renderDialog();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'slow' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar Limites/i }));

    const limits = onSave.mock.calls[0][0] as TalkXLimitsPayload;
    expect(limits.speed_profile).toBe('slow');
    expect(limits.send_interval_min).toBe(15000);
    expect(limits.send_interval_max).toBe(30000);
    // A janela e o horário comercial continuam saindo no payload.
    expect(limits.send_window_start).toBe('08:00:00');
    expect(limits.send_window_end).toBe('18:00:00');
  });

  it('intervalo abaixo do piso (1 s) é recusado: avisa e não salva', () => {
    const { onSave } = renderDialog();

    const spinbuttons = screen.getAllByRole('spinbutton');
    fireEvent.change(spinbuttons[0], { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar Limites/i }));

    expect(toastError).toHaveBeenCalledWith('Intervalos devem ser inteiros entre 3s e 600s.');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('o payload leva só as chaves da lista branca da RPC (chave extra é recusada pelo servidor)', () => {
    const { onSave } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: /Salvar Limites/i }));

    const limits = onSave.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(limits).sort()).toEqual([
      'business_hours_only', 'send_interval_max', 'send_interval_min',
      'send_window_end', 'send_window_start', 'speed_profile',
    ]);
  });

  it('janela em branco vira null (o par precisa ser válido no servidor)', () => {
    const payload = limitsPayload({
      speedProfile: 'moderate', intervalMin: 8, intervalMax: 20,
      windowStart: '', windowEnd: '', businessHoursOnly: true,
    });
    expect(payload.send_window_start).toBeNull();
    expect(payload.send_window_end).toBeNull();
    expect(payload.business_hours_only).toBe(true);
  });
});

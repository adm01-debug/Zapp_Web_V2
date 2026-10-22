// A14/TZ: fixa o fuso do PROCESSO (o "navegador" do teste) em São Paulo ANTES
// de qualquer `Date` ser criado. Assim o piso do calendário tem de vir da
// campanha (Europa/Londres, no teste A14) e não do relógio local do processo —
// sem isso os dois fusos coincidiriam e o teste não provaria nada.
//
// `process.env.TZ` é global do WORKER do vitest: fica compartilhado entre os
// arquivos de teste que rodam no mesmo fork. Por isso guardamos o valor
// original e o devolvemos no fim (o mesmo padrão de `useAIStats.test.tsx`):
// sem o cleanup este arquivo roubaria o fuso dos demais na suíte empilhada.
const TZ_ORIGINAL = process.env.TZ;
process.env.TZ = 'America/Sao_Paulo';

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * X138 (TL-150) — coluna central da tela 10.
 *
 * Antes desta correção o calendário não recebia `locale` (o cabeçalho saía em
 * inglês), aceitava qualquer data passada (o único limite era o `min` do campo
 * de texto, calculado em UTC) e o "Resumo da Programação" eram cinco linhas
 * soltas. Aqui se prova:
 *   1. o mês e os dias da semana em português com inicial maiúscula — INCLUSIVE
 *      o sábado acentuado ("Sáb"), que o `date-fns` ('cccccc') devolvia "sab";
 *   2. o piso do calendário é "hoje" na parede local da CAMPANHA, não a do
 *      navegador (caso do processo de teste em outro fuso);
 *   3. o dia marcado sai do horário local da campanha;
 *   4. a linha do tempo acompanha a EDIÇÃO ao vivo (hora/piso e janela) e, sem
 *      `scheduled_at` gravado, ainda deduz um marco do estado em edição.
 */

const h = vi.hoisted(() => ({
  state: { campaigns: [] as Array<Record<string, unknown>> },
  onBack: vi.fn(),
  onEdit: vi.fn(),
  onStatusChange: vi.fn(),
}));

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: h.state.campaigns,
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetchCampaigns: vi.fn(),
    updateCampaign: { mutateAsync: vi.fn() },
    startCampaign: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { TalkXCampaignScheduled } from '../TalkXCampaignScheduled';

// O gatilho do Select (Radix) chama `hasPointerCapture` no pointerdown que o abre
// (o jsdom não implementa captura de ponteiro).
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

// Devolve o fuso do processo ao que era antes deste arquivo: o worker do vitest
// é reutilizado pelos outros arquivos de teste e o `process.env.TZ` vaza.
afterAll(() => {
  if (TZ_ORIGINAL === undefined) delete process.env.TZ;
  else process.env.TZ = TZ_ORIGINAL;
});

const BASE_CAMPAIGN = {
  id: 'camp-agendada-x138',
  name: 'Black Friday VIP',
  message_template: 'Olá {{nome}}, a Black Friday chegou!',
  variables_config: [],
  typing_delay_min: 1500,
  typing_delay_max: 4000,
  send_interval_min: 8000,
  send_interval_max: 20000,
  status: 'scheduled',
  total_recipients: 1180,
  sent_count: 0,
  failed_count: 0,
  delivered_count: 0,
  whatsapp_connection_id: 'conn-1',
  created_by: 'user-1',
  started_at: null,
  completed_at: null,
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-08T21:00:00.000Z',
  media_url: null,
  media_type: null,
  scheduled_at: '2026-10-20T12:00:00.000Z',
  schedule_timezone: 'America/Sao_Paulo',
  send_window_start: null,
  send_window_end: null,
  business_hours_only: false,
  speed_profile: 'moderate',
  revision: 2,
};

function view() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <TalkXCampaignScheduled
        campaignId="camp-agendada-x138"
        onBack={h.onBack}
        onEdit={h.onEdit}
        onStatusChange={h.onStatusChange}
      />
    </QueryClientProvider>
  );
}

/** Botão de um dia do calendário (`name="day"` no react-day-picker 8). */
function dayButton(label: string): HTMLButtonElement {
  const matches = Array.from(document.querySelectorAll<HTMLButtonElement>('button[name="day"]'))
    .filter((button) => button.textContent === label);
  if (matches.length !== 1) throw new Error(`esperava 1 botão para o dia ${label}, achei ${matches.length}`);
  return matches[0];
}

function milestone(key: string): HTMLElement {
  const el = document.querySelector(`[data-talkx-milestone="${key}"]`) as HTMLElement | null;
  if (!el) throw new Error(`marco ${key} ausente na linha do tempo`);
  return el;
}

/** Troca o fuso no Select do Radix pelo evento do usuário (sem salvar). */
function escolherFuso(opcao: string) {
  const trigger = screen
    .getAllByRole('combobox')
    .find((c) => /São Paulo|Sao Paulo/.test(c.textContent ?? ''));
  if (!trigger) throw new Error('select de fuso ausente');
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });
  fireEvent.click(screen.getByRole('option', { name: opcao }));
}

describe('X138 — calendário em português e resumo em linha do tempo (tela 10)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-09T15:00:00.000Z')); // 09/10/2026 12:00 em São Paulo
    h.state.campaigns = [BASE_CAMPAIGN];
    h.onBack.mockClear();
    h.onEdit.mockClear();
    h.onStatusChange.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mostra o mês por extenso e os dias da semana em português com inicial maiúscula', () => {
    render(view());

    expect(screen.getByText('Outubro de 2026')).toBeTruthy();
    // Os SETE cabeçalhos, incluindo o sábado acentuado — o defeito era justamente
    // o "Sáb" sair como "Sab" (date-fns 'cccccc' sem acento).
    for (const dia of ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']) {
      expect(screen.getByText(dia)).toBeTruthy();
    }
    expect(screen.queryByText('Sab')).toBeNull();
  });

  it('A14: o piso é hoje na parede da CAMPANHA, mesmo com o navegador em outro dia', () => {
    // O processo roda em São Paulo (UTC-3) — fixado no topo deste arquivo; a
    // campanha está em Londres. 09/10/2026 23:30 UTC é 10/10 00:30 em Londres
    // (BST, UTC+1) e 09/10 20:30 em São Paulo: o piso tem de ser o DIA DA
    // CAMPANHA (10), não o do processo (09).
    expect(new Date('2026-10-09T23:30:00.000Z').getHours()).toBe(20);
    vi.setSystemTime(new Date('2026-10-09T23:30:00.000Z'));
    h.state.campaigns = [{ ...BASE_CAMPAIGN, schedule_timezone: 'Europe/London' }];
    render(view());

    expect(dayButton('9').disabled).toBe(true);
    expect(dayButton('10').disabled).toBe(false);
  });

  it('marca o dia do horário local da campanha (23:30 em Manaus) mesmo com o navegador em outro fuso', () => {
    h.state.campaigns = [{
      ...BASE_CAMPAIGN,
      schedule_timezone: 'America/Manaus',
      // 21/10 03:30 UTC = 20/10 23:30 em Manaus (UTC-4).
      scheduled_at: '2026-10-21T03:30:00.000Z',
    }];
    render(view());

    expect(dayButton('20').getAttribute('aria-selected')).toBe('true');
    expect(dayButton('21').getAttribute('aria-selected')).not.toBe('true');
    // o mesmo dia e a mesma hora aparecem no marco da linha do tempo
    expect(milestone('start').textContent).toContain('20/10/2026 • 23:30');
  });

  it('A11: mudar a hora em edição move o marco "Início dos envios"', () => {
    render(view());

    // gravado: 20/10 09:00 em São Paulo (12:00 UTC)
    expect(milestone('start').textContent).toContain('20/10/2026 • 09:00');

    const timeInput = document.getElementById('talkx-schedule-time') as HTMLInputElement;
    fireEvent.change(timeInput, { target: { value: '14:45' } });

    expect(milestone('start').textContent).toContain('20/10/2026 • 14:45');
    expect(milestone('start').textContent).toContain('alteração não salva');
  });

  it('A11: trocar o fuso sem salvar não desloca o marco em relação ao editor', () => {
    render(view());

    const timeInput = () => (document.getElementById('talkx-schedule-time') as HTMLInputElement).value;
    // gravado: 20/10 09:00 em São Paulo
    expect(milestone('start').textContent).toContain(`• ${timeInput()}`);

    escolherFuso('America/Manaus');
    // o editor preserva o instante (09:00 SP = 08:00 Manaus) e o marco acompanha o editor
    expect(timeInput()).toBe('08:00');
    expect(milestone('start').textContent).toContain('• 08:00');
    expect(milestone('start').textContent).toContain('20/10/2026');

    // editando a hora, o marco segue o estado em edição — não o scheduled_at salvo
    fireEvent.change(document.getElementById('talkx-schedule-time') as HTMLInputElement, { target: { value: '09:15' } });
    expect(milestone('start').textContent).toContain('• 09:15');
    expect(milestone('start').textContent).toContain('alteração não salva');
  });

  it('A11: desligar a janela de envio remove o marco da janela', () => {
    h.state.campaigns = [{
      ...BASE_CAMPAIGN,
      send_window_start: '09:00:00',
      send_window_end: '18:00:00',
    }];
    render(view());

    expect(milestone('window').textContent).toContain('Janela de envio ativa');

    fireEvent.click(screen.getByLabelText('Janela de envio'));

    expect(document.querySelector('[data-talkx-milestone="window"]')).toBeNull();
  });

  it('A12: sem scheduled_at gravado, a linha do tempo ainda deduz um marco da edição', () => {
    h.state.campaigns = [{ ...BASE_CAMPAIGN, scheduled_at: null }];
    render(view());

    expect(document.querySelector('[data-talkx-milestone="start"]')).toBeNull();

    const dateInput = document.getElementById('talkx-schedule-date') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-11-05' } });

    expect(milestone('start').textContent).toContain('05/11/2026 • 09:00');
    expect(milestone('start').textContent).toContain('Início dos envios');
  });
});

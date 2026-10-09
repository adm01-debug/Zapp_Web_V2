import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

/**
 * X138 (TL-150) — "Resumo da Programação" da tela 10 como linha do tempo.
 *
 * O componente é puro: recebe a campanha e o fuso, e devolve os marcos do mock
 * 10 na parede local da campanha. O que se prova aqui:
 *   1. os quatro marcos saem com data e hora em português, no fuso informado;
 *   2. a "Previsão de conclusão" DESAPARECE quando não há previsão (A9) — sem
 *      público não se inventa duração;
 *   3. a "Janela de envio ativa" só aparece com as duas pontas gravadas;
 *   4. o fuso cai para o da campanha quando a tela não manda um em edição.
 */

import { TalkXScheduleTimeline } from '../TalkXScheduleTimeline';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';

const CAMPANHA = {
  id: 'camp-x138',
  name: 'Black Friday VIP',
  status: 'scheduled',
  total_recipients: 1180,
  typing_delay_min: 1500,
  typing_delay_max: 4000,
  send_interval_min: 8000,
  send_interval_max: 20000,
  // 26/11 21:00 UTC = 26/11 18:00 em São Paulo
  updated_at: '2026-11-26T21:00:00.000Z',
  // 27/11 12:00 UTC = 27/11 09:00 em São Paulo
  scheduled_at: '2026-11-27T12:00:00.000Z',
  schedule_timezone: 'America/Sao_Paulo',
  send_window_start: '09:00:00',
  send_window_end: '18:00:00',
} as unknown as TalkXCampaign;

function milestone(container: HTMLElement, key: string): HTMLElement | null {
  return container.querySelector(`[data-talkx-milestone="${key}"]`);
}

describe('X138 — linha do tempo do "Resumo da Programação"', () => {
  it('mostra os marcos do mock na parede local da campanha', () => {
    const { container } = render(<TalkXScheduleTimeline campaign={CAMPANHA} timezone="America/Sao_Paulo" />);

    expect(milestone(container, 'configured')?.textContent)
      .toContain('26/11/2026 • 18:00 — Campanha configurada e aguardando início');
    expect(milestone(container, 'start')?.textContent)
      .toContain('27/11/2026 • 09:00 — Início dos envios · Black Friday VIP');
    expect(milestone(container, 'window')?.textContent)
      .toContain('27/11/2026 • 09:00 - 18:00 — Janela de envio ativa');
    // 1.180 contatos × ((1500+4000)/2 + (8000+20000)/2)/1000 = 19.765 s ≈ 5h 30min
    expect(milestone(container, 'eta')?.textContent)
      .toContain('Previsão de conclusão em até 5h 30min');
    expect(container.textContent).toContain('Fuso');
    expect(container.textContent).toContain('America/Sao_Paulo');
    expect(container.textContent).toContain('1.180 contatos');
  });

  it('sem público não inventa previsão de conclusão (A9) e sem janela não mostra o marco', () => {
    const { container } = render(
      <TalkXScheduleTimeline
        campaign={{ ...CAMPANHA, total_recipients: 0, send_window_start: null, send_window_end: null }}
        timezone="America/Sao_Paulo"
      />,
    );

    expect(milestone(container, 'eta')).toBeNull();
    expect(milestone(container, 'window')).toBeNull();
    expect(milestone(container, 'start')).toBeTruthy();
  });

  it('usa o fuso salvo na campanha quando a tela não manda um fuso em edição', () => {
    const { container } = render(
      <TalkXScheduleTimeline
        campaign={{ ...CAMPANHA, schedule_timezone: 'America/Manaus' }}
        timezone={null}
      />,
    );

    // 27/11 12:00 UTC = 27/11 08:00 em Manaus (UTC-4)
    expect(milestone(container, 'start')?.textContent).toContain('27/11/2026 • 08:00');
    expect(container.textContent).toContain('America/Manaus');
  });
});

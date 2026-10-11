import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

/**
 * X138 (TL-150) — "Resumo da Programação" da tela 10 como linha do tempo.
 *
 * O componente é puro: recebe a campanha e o ESTADO EM EDIÇÃO da tela, e devolve
 * os marcos do mock 10 na parede local da campanha. O que se prova aqui:
 *   1. (A11) o início reflete a data/hora em edição e diz "alteração não salva"
 *      quando difere do gravado, distinguindo o início gravado do editado;
 *   2. (A11) a janela só aparece com `windowEnabled` ligado;
 *   3. (A12) sem `scheduled_at` gravado, o início ainda é deduzido da edição;
 *   4. (A9) a "Previsão de conclusão" DESAPARECE sem público — não se inventa
 *      duração;
 *   5. o fuso em edição manda no horário exibido.
 */

import { TalkXScheduleTimeline, type ScheduleEditingState } from '../TalkXScheduleTimeline';
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

const EDICAO: ScheduleEditingState = {
  date: '2026-11-27',
  time: '09:15',
  timezone: 'America/Sao_Paulo',
  windowEnabled: true,
  windowStart: '09:00',
  windowEnd: '18:00',
};

function milestone(container: HTMLElement, key: string): HTMLElement | null {
  return container.querySelector(`[data-talkx-milestone="${key}"]`);
}

describe('X138 — linha do tempo do "Resumo da Programação" lê o estado em edição', () => {
  it('A11: o início segue a hora editada e marca "alteração não salva" quando difere do gravado', () => {
    const { container } = render(<TalkXScheduleTimeline campaign={CAMPANHA} editing={EDICAO} />);

    const start = milestone(container, 'start');
    expect(start?.textContent).toContain('27/11/2026 • 09:15');
    expect(start?.textContent).toContain('Início dos envios');
    expect(start?.textContent).toContain('alteração não salva');
  });

  it('A11: sem edição (data/hora iguais ao gravado) o início não diz "alteração não salva"', () => {
    const { container } = render(
      <TalkXScheduleTimeline campaign={CAMPANHA} editing={{ ...EDICAO, time: '09:00' }} />,
    );

    const start = milestone(container, 'start');
    expect(start?.textContent).toContain('27/11/2026 • 09:00');
    expect(start?.textContent).not.toContain('alteração não salva');
  });

  it('A11: gravado no formato do PostgREST (+00:00) com edição no mesmo instante não diz "alteração não salva"', () => {
    const { container } = render(
      <TalkXScheduleTimeline
        campaign={{ ...CAMPANHA, scheduled_at: '2026-11-27T12:00:00+00:00' } as unknown as TalkXCampaign}
        editing={{ ...EDICAO, time: '09:00' }}
      />,
    );

    // 27/11 09:00 em São Paulo (UTC-3) = 27/11 12:00 UTC: o mesmo instante do
    // gravado, só o texto difere ('+00:00' do PostgREST vs '.000Z' do conversor).
    const start = milestone(container, 'start');
    expect(start?.textContent).toContain('27/11/2026 • 09:00');
    expect(start?.textContent).not.toContain('alteração não salva');
  });

  it('A11: a janela some quando o interruptor está desligado e volta quando ligado', () => {
    const { container, rerender } = render(
      <TalkXScheduleTimeline campaign={CAMPANHA} editing={{ ...EDICAO, windowEnabled: false }} />,
    );
    expect(milestone(container, 'window')).toBeNull();

    rerender(<TalkXScheduleTimeline campaign={CAMPANHA} editing={{ ...EDICAO, windowEnabled: true }} />);
    expect(milestone(container, 'window')?.textContent).toContain('27/11/2026 • 09:00 - 18:00');
    expect(milestone(container, 'window')?.textContent).toContain('Janela de envio ativa');
  });

  it('A12: sem scheduled_at gravado o início é deduzido do estado em edição', () => {
    const { container } = render(
      <TalkXScheduleTimeline
        campaign={{ ...CAMPANHA, scheduled_at: null } as unknown as TalkXCampaign}
        editing={EDICAO}
      />,
    );

    expect(milestone(container, 'start')?.textContent).toContain('27/11/2026 • 09:15');
    expect(milestone(container, 'start')?.textContent).toContain('Início dos envios');
  });

  it('A9: público zero não exibe "Previsão de conclusão"', () => {
    const { container } = render(
      <TalkXScheduleTimeline campaign={{ ...CAMPANHA, total_recipients: 0 } as unknown as TalkXCampaign} editing={EDICAO} />,
    );

    expect(milestone(container, 'eta')).toBeNull();
    expect(container.textContent).not.toContain('Previsão de conclusão');
  });

  it('mostra a previsão de conclusão quando há público e mantém fuso e destinatários', () => {
    const { container } = render(<TalkXScheduleTimeline campaign={CAMPANHA} editing={EDICAO} />);

    // 1.180 contatos × ((1500+4000)/2 + (8000+20000)/2)/1000 = 19.765 s ≈ 5h 30min
    expect(milestone(container, 'eta')?.textContent).toContain('Previsão de conclusão em até 5h 30min');
    expect(container.textContent).toContain('America/Sao_Paulo');
    expect(container.textContent).toContain('1.180 contatos');
  });

  it('o fuso em edição manda na parede exibida (sem data/hora editada, cai no gravado)', () => {
    const { container } = render(
      <TalkXScheduleTimeline
        campaign={CAMPANHA}
        editing={{ ...EDICAO, date: '', time: '', timezone: 'America/Manaus' }}
      />,
    );

    // Sem data/hora em edição o início é o gravado (27/11 12:00 UTC), exibido
    // na parede de Manaus (UTC-4): 27/11 08:00.
    expect(milestone(container, 'start')?.textContent).toContain('27/11/2026 • 08:00');
    expect(container.textContent).toContain('America/Manaus');
  });
});

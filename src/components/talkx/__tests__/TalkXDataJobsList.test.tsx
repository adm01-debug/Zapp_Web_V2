import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TalkXDataJobsList } from '../tracking/TalkXDataJobsCard';

/**
 * Lista do painel "Jobs de dados" (aba Configurações do Talk X).
 *
 * O que este arquivo prova: a linha mostra o nome do job, o estado em texto e o selo — e
 * que o job que nunca rodou é visível como tal (antes do painel, nada na tela dizia isso).
 */

const NOW = Date.parse('2026-11-26T12:00:00.000Z');

describe('TalkXDataJobsList', () => {
  it('mostra cada job com estado, intervalo e última execução', () => {
    render(
      <TalkXDataJobsList
        nowMs={NOW}
        jobs={[
          {
            job: 'recompute_purchase_metrics',
            interval_minutes: 1440,
            enabled: true,
            last_started_at: null,
            last_finished_at: null,
          },
          {
            job: 'talkx_enriquecimento',
            interval_minutes: 60,
            enabled: true,
            last_started_at: '2026-11-26T11:10:00.000Z',
            last_finished_at: '2026-11-26T11:20:00.000Z',
          },
        ]}
      />,
    );

    expect(screen.getByText('recompute_purchase_metrics')).toBeTruthy();
    expect(screen.getByText('talkx_enriquecimento')).toBeTruthy();
    expect(screen.getByText('Nunca rodou')).toBeTruthy();
    expect(screen.getByText('Em dia')).toBeTruthy();
    expect(screen.getByText(/Intervalo: 1x por dia/)).toBeTruthy();
    expect(screen.getByText(/Intervalo: a cada 1 h/)).toBeTruthy();
  });
});

import { describe, it, expect } from 'vitest';
import { deriveDataJobView, fmtDataJobInterval } from '../tracking/talkxDataJobs';

/**
 * Regra do painel "Jobs de dados" (`talkx_data_jobs`).
 *
 * O que este arquivo prova: cada combinação de `enabled`/`last_started_at`/
 * `last_finished_at` vira UM estado com o texto certo — inclusive o estado que motivou o
 * painel: job ativo que nunca rodou (o dado alimentado por ele fica vazio).
 */

const NOW = Date.parse('2026-11-26T12:00:00.000Z');

const jobBase = {
  job: 'recompute_purchase_metrics',
  interval_minutes: 1440,
  enabled: true,
  last_started_at: null as string | null,
  last_finished_at: null as string | null,
};

describe('deriveDataJobView', () => {
  it('job ativo que nunca executou aparece como "Nunca rodou"', () => {
    const view = deriveDataJobView(jobBase, NOW);
    expect(view.state).toBe('nunca_executou');
    expect(view.pillLabel).toBe('Nunca rodou');
    expect(view.tone).toBe('warning');
    expect(view.lastRunLabel).toBe('nunca executou');
    expect(view.label).toContain('Nunca executou');
  });

  it('job desligado não é atrasado, mesmo sem execução recente', () => {
    const view = deriveDataJobView(
      { ...jobBase, enabled: false, last_finished_at: '2026-10-01T12:00:00.000Z' },
      NOW,
    );
    expect(view.state).toBe('desativado');
    expect(view.pillLabel).toBe('Desativado');
    expect(view.tone).toBe('muted');
  });

  it('começou depois do último fim: está em execução', () => {
    const view = deriveDataJobView(
      {
        ...jobBase,
        last_started_at: '2026-11-26T11:55:00.000Z',
        last_finished_at: '2026-11-25T11:00:00.000Z',
      },
      NOW,
    );
    expect(view.state).toBe('em_execucao');
    expect(view.pillLabel).toBe('Rodando');
    expect(view.tone).toBe('info');
  });

  it('terminou dentro do ciclo esperado: em dia', () => {
    const view = deriveDataJobView({ ...jobBase, last_finished_at: '2026-11-26T11:00:00.000Z' }, NOW);
    expect(view.state).toBe('em_dia');
    expect(view.pillLabel).toBe('Em dia');
    expect(view.tone).toBe('success');
  });

  it('terminou há 3 dias num job diário: atrasado com o tempo além do previsto', () => {
    const view = deriveDataJobView({ ...jobBase, last_finished_at: '2026-11-23T12:00:00.000Z' }, NOW);
    expect(view.state).toBe('atrasado');
    expect(view.pillLabel).toBe('Atrasado');
    expect(view.tone).toBe('danger');
    // 72 h sem terminar − 2 ciclos de 24 h = 24 h de atraso.
    expect(view.label).toContain('Atrasado');
    expect(view.label).toContain('24h');
  });

  it('job de hora em hora tolera um ciclo perdido e reprova dois', () => {
    const hourly = { ...jobBase, interval_minutes: 60 };
    expect(deriveDataJobView({ ...hourly, last_finished_at: '2026-11-26T11:30:00.000Z' }, NOW).state).toBe('em_dia');
    expect(deriveDataJobView({ ...hourly, last_finished_at: '2026-11-26T09:00:00.000Z' }, NOW).state).toBe('atrasado');
  });
});

describe('fmtDataJobInterval', () => {
  it('traduz os minutos que o banco guarda', () => {
    expect(fmtDataJobInterval(1440)).toBe('1x por dia');
    expect(fmtDataJobInterval(2880)).toBe('2x por dia');
    expect(fmtDataJobInterval(60)).toBe('a cada 1 h');
    expect(fmtDataJobInterval(15)).toBe('a cada 15 min');
    expect(fmtDataJobInterval(0)).toBe('—');
  });
});

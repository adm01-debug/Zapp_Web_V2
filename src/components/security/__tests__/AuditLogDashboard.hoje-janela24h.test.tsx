/**
 * HZ1-08 — o card "Hoje" do painel de Auditoria conta a janela de 24 h **no servidor**.
 *
 * Substitui o teste `AuditLogDashboard.hoje-local.test.tsx` (R3-02, #1392). Aquele arquivo
 * provava o cálculo do dia **local** do navegador sobre as linhas que a tela carregava; com a
 * contagem no servidor não existe mais fronteira de dia: o card passou a ser "Hoje — últimas
 * 24 h" (rótulo e hint na tela), uma janela absoluta. O que a lição do R3-02 continua exigindo
 * está aqui: o limite enviado ao servidor é o instante `agora - 24 h`, **nunca** uma meia-noite
 * (local ou UTC) truncada — truncar era justamente o defeito que o R3-02 corrigiu.
 *
 * Âncora: 30/09/2026 22:30 em São Paulo (UTC-3) = 01/10/2026 01:30 UTC. A meia-noite UTC do
 * "agora" (01/10T00:00Z) estaria 1h30 *dentro* da janela e contaria linha a mais.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createAuditLogsRealtime, fakeAuditLog, type RecordedAuditQuery } from '@/test/mocks/auditLogsServer';

const estado = vi.hoisted(() => ({
  logs: [] as unknown[],
  queries: [] as RecordedAuditQuery[],
}));

vi.mock('@/integrations/supabase/client', async () => {
  const { createAuditLogsServer, createAuditLogsRealtime } = await import('@/test/mocks/auditLogsServer');
  const realtime = createAuditLogsRealtime();
  return {
    supabase: {
      // Um servidor por consulta: lê o estado vivo do teste.
      from: (tabela: string) => {
        const servidor = createAuditLogsServer(estado.logs as never, {
          registrar: (consulta) => estado.queries.push(consulta),
        });
        return servidor.from(tabela);
      },
      channel: (nome: string) => realtime.channel(nome),
      removeChannel: (canal: unknown) => realtime.removeChannel(canal),
    },
  };
});

import { AuditLogDashboard } from '../AuditLogDashboard';

const AGORA = new Date(2026, 8, 30, 22, 30, 0); // 30/09/2026 22:30 horário local
const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

// 1) 23 h atrás — dentro da janela; 2) 25 h atrás — fora; 3) 48 h atrás — fora.
const LOGS = [
  fakeAuditLog({ id: 'dentro', action: 'login', user_id: 'u1', created_at: new Date(AGORA.getTime() - 23 * HORA).toISOString() }),
  fakeAuditLog({ id: 'fora-recente', action: 'login', user_id: 'u2', created_at: new Date(AGORA.getTime() - 25 * HORA).toISOString() }),
  fakeAuditLog({ id: 'fora-antigo', action: 'delete', user_id: 'u3', created_at: new Date(AGORA.getTime() - 48 * HORA).toISOString() }),
];

const valorDoCard = (rotulo: string) => screen.getByText(rotulo).previousElementSibling?.textContent;

/** A contagem do card "Hoje": `count` com o corte de `created_at`, sem o filtro de sensíveis. */
const limiteDe24h = () =>
  estado.queries.find(
    (q) => q.contagem && q.or.length === 0 && q.gte.some(([coluna]) => coluna === 'created_at'),
  )?.gte.find(([coluna]) => coluna === 'created_at')?.[1];

describe('AuditLogDashboard — card "Hoje" na janela de 24 h do servidor (HZ1-08)', () => {
  beforeEach(() => {
    estado.logs = LOGS;
    estado.queries = [];
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(AGORA);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('conta só as linhas dentro das últimas 24 h, mesmo com a página da lista cortada', async () => {
    render(<AuditLogDashboard />);

    // Sanidade: a página da tela traz as 3 linhas (limite de 200 não corta aqui).
    await waitFor(() => expect(valorDoCard('Total de Logs')).toBe('3'));
    // Só a de 23 h atrás está na janela.
    expect(valorDoCard('Hoje')).toBe('1');
  });

  it('pede ao servidor o instante agora - 24 h, sem truncar em meia-noite', async () => {
    render(<AuditLogDashboard />);

    await waitFor(() => expect(limiteDe24h()).toBe(new Date(AGORA.getTime() - DIA).toISOString()));
    // Meia-noite UTC do "agora" (01/10T00:00Z): é o corte truncado que contaria a linha de 25 h.
    expect(limiteDe24h()).not.toBe('2026-10-01T00:00:00.000Z');
    // Meia-noite local (30/09T03:00Z) também não é aceita.
    expect(limiteDe24h()).not.toBe('2026-09-30T03:00:00.000Z');
  });

  it('o hint do card diz a janela que ele conta', async () => {
    render(<AuditLogDashboard />);

    await waitFor(() => expect(valorDoCard('Hoje')).toBe('1'));
    // "Hoje" e "Ações Sensíveis" usam a mesma janela de 24 h.
    expect(screen.getAllByText('últimas 24 h')).toHaveLength(2);
  });
});

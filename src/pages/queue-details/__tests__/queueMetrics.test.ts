import { describe, it, expect } from 'vitest';
import { computeQueueMetrics } from '@/pages/queue-details/queueMetrics';

// R2-QUE-001 (item 105): a tela de fila não pode exibir estimativa fixa como resultado medido.
// Resolvidos Hoje vem do status canônico (`conversation_status = 'resolved'`) e do timestamp de
// mudança de status; tempo médio vem de amostras de SLA com primeira resposta real ("Sem dados"
// quando não há amostra). Antes: `resolvedToday = floor(assigned * 0.7)` e `avgResponseTime = '~3 min'`.

const now = new Date('2024-01-10T15:00:00Z');

const contatos = [
  // atribuído aberto: não é resolvido
  { assigned_to: 'p1', conversation_status: 'open', conversation_status_changed_at: '2024-01-10T09:00:00Z' },
  // resolvido antigo: não conta como resolvido hoje
  { assigned_to: 'p1', conversation_status: 'resolved', conversation_status_changed_at: '2024-01-05T10:00:00Z' },
  // resolvido hoje: conta
  { assigned_to: 'p1', conversation_status: 'resolved', conversation_status_changed_at: '2024-01-10T08:00:00Z' },
];

const slaRows = [
  { first_message_at: '2024-01-10T08:00:00Z', first_response_at: '2024-01-10T08:02:00Z' }, // 120s
  { first_message_at: '2024-01-10T08:00:00Z', first_response_at: '2024-01-10T08:04:00Z' }, // 240s
  { first_message_at: '2024-01-10T08:00:00Z', first_response_at: null }, // sem amostra: fora da média
];

describe('computeQueueMetrics', () => {
  it('conta Resolvidos Hoje pelo status canônico e timestamp, não por 70% dos atribuídos', () => {
    const m = computeQueueMetrics(contatos, slaRows, now);
    // antes do conserto: floor(3 * 0.7) = 2
    expect(m.resolvedToday).toBe(1);
  });

  it('não transforma atribuição em resolução', () => {
    const somenteAtribuidosAbertos = [
      { assigned_to: 'p1', conversation_status: 'open', conversation_status_changed_at: null },
      { assigned_to: 'p2', conversation_status: 'open', conversation_status_changed_at: null },
    ];
    const m = computeQueueMetrics(somenteAtribuidosAbertos, [], now);
    expect(m.resolvedToday).toBe(0);
  });

  it('deriva o tempo médio de amostras de SLA reais', () => {
    const m = computeQueueMetrics(contatos, slaRows, now);
    // (120 + 240) / 2 = 180s = 3 min — antes era a string fixa '~3 min'
    expect(m.avgResponseTime).toBe('3 min');
  });

  it('representa ausência de amostra como Sem dados', () => {
    const semAmostra = computeQueueMetrics(contatos, [{ first_message_at: '2024-01-10T08:00:00Z', first_response_at: null }], now);
    expect(semAmostra.avgResponseTime).toBe('Sem dados');
  });

  it('mantém os totais agregados reais', () => {
    const m = computeQueueMetrics(contatos, slaRows, now);
    expect(m.totalContacts).toBe(3);
    expect(m.assignedContacts).toBe(3);
    expect(m.waitingContacts).toBe(0);
  });
});

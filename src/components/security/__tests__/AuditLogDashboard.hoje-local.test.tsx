/**
 * R3-02 — o card "Hoje" da Auditoria conta pelo dia **local do navegador**.
 *
 * `new Date().toISOString().split('T')[0]` é o dia **UTC**: às 22:30 em São Paulo (UTC-3) ele já
 * aponta para o dia seguinte e, como o `created_at` gravado está em UTC, o `startsWith` conta o
 * conjunto errado — entre 21h e meia-noite o card "Hoje" mostra quase nada e "perde" o dia.
 *
 * Âncora: 30/09/2026 22:30 em São Paulo (22:30 local = 01:30 UTC do dia 01/10).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// Massa montada para separar as tres leituras possiveis (dia local, dia UTC e a mistura das duas):
//   1) 30/09 20:00 SP (30/09 23:00Z) — dia local = hoje; dia UTC = hoje
//   2) 30/09 22:00 SP (01/10 01:00Z) — dia local = hoje; dia UTC = AMANHA      <- o sintoma (21h-meia-noite)
//   3) 29/09 23:00 SP (30/09 02:00Z) — ONTEM no calendario local; dia UTC = hoje
//   4) 30/09 03:00 SP (30/09 06:00Z) — dia local = hoje; dia UTC = hoje
//   5) 29/09 22:00 SP (30/09 01:00Z) — ONTEM no calendario local; dia UTC = hoje
// Hoje (local) = {1,2,4} = 3 | dia UTC do "agora" = {2} = 1 | mistura (UTC-do-log x local-do-agora) = {1,3,4,5} = 4
const LOGS = [
  { id: '1', action: 'login', entity_type: 'user', entity_id: 'u1', user_id: 'uid1', details: null, ip_address: null, user_agent: null, created_at: '2026-09-30T23:00:00Z' },
  { id: '2', action: 'update', entity_type: 'user', entity_id: 'u2', user_id: 'uid2', details: null, ip_address: null, user_agent: null, created_at: '2026-10-01T01:00:00Z' },
  { id: '3', action: 'delete', entity_type: 'user', entity_id: 'u3', user_id: 'uid3', details: null, ip_address: null, user_agent: null, created_at: '2026-09-30T02:00:00Z' },
  { id: '4', action: 'create', entity_type: 'document', entity_id: 'd1', user_id: 'uid4', details: null, ip_address: null, user_agent: null, created_at: '2026-09-30T06:00:00Z' },
  { id: '5', action: 'export', entity_type: 'report', entity_id: 'r1', user_id: 'uid5', details: null, ip_address: null, user_agent: null, created_at: '2026-09-30T01:00:00Z' },
];

type LogDeAuditoria = (typeof LOGS)[number];
type Cadeia = Promise<{ data: LogDeAuditoria[]; error: null }> & { eq: () => Cadeia };

// Cadeia de query "aguardável" (+ .eq, que o componente só usa com filtro ativo).
const cadeia = (data: LogDeAuditoria[]): Cadeia => {
  const p = Promise.resolve({ data, error: null }) as Cadeia;
  p.eq = () => p;
  return p;
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn(() => cadeia(LOGS)),
        })),
      })),
    })),
  },
}));

import { AuditLogDashboard } from '../AuditLogDashboard';

const AGORA = new Date(2026, 8, 30, 22, 30, 0); // 30/09/2026 22:30 horário local
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

// Régua independente do util: compara ano/mês/dia locais do instante gravado.
const ehDiaLocalDeHoje = (iso: string): boolean => {
  const d = new Date(iso);
  return (
    d.getFullYear() === AGORA.getFullYear() &&
    d.getMonth() === AGORA.getMonth() &&
    d.getDate() === AGORA.getDate()
  );
};
const ESPERADO_HOJE = LOGS.filter((l) => ehDiaLocalDeHoje(l.created_at)).length;

const valorDoCard = (rotulo: string) => screen.getByText(rotulo).previousElementSibling?.textContent;

describe('AuditLogDashboard — card "Hoje" no fuso do navegador', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(AGORA);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('conta os logs do dia local do usuário, não do dia UTC', async () => {
    render(<AuditLogDashboard />);
    // Sanidade: o teste só vale com os logs carregados.
    await waitFor(() => expect(valorDoCard('Total de Logs')).toBe(String(LOGS.length)));
    expect(valorDoCard('Hoje')).toBe(String(ESPERADO_HOJE));
  });

  it(`é o mesmo número de logs que a régua local calcula (TZ=${TZ})`, async () => {
    render(<AuditLogDashboard />);
    await waitFor(() => expect(valorDoCard('Total de Logs')).toBe(String(LOGS.length)));
    expect(Number(valorDoCard('Hoje'))).toBe(ESPERADO_HOJE);
  });
});

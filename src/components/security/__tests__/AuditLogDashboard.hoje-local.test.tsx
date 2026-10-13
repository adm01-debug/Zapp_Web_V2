/**
 * R3-02 (revisto na tela real da auditoria) — o card "Hoje" NÃO conta a página
 * carregada no cliente: o número vem do banco (`audit_log_summary`) recortado no
 * dia de calendário de hoje, no fuso do app (`appDayStart(0)` → agora).
 *
 * Antes o card somava `created_at.startsWith(diaLocal)` sobre a página de 200 logs
 * — o número era só da página e, no antigo recorte UTC, entre 21h e a meia-noite
 * apontava para o dia seguinte. Agora a janela é enviada à RPC, então "Hoje" bate
 * com o que o servidor conta — independente de quantas linhas a tela carregou.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { appDayStart } from '@/lib/localDay';

// Página carregada com 3 logs "de hoje" — se o card contasse a página, mostraria 3.
const LOGS_DE_HOJE = [
  { id: '1', action: 'login', entity_type: 'user', entity_id: 'u1', user_id: 'uid1', actor_name: 'Ana', details: null, ip_address: null, user_agent: null, created_at: new Date().toISOString() },
  { id: '2', action: 'update', entity_type: 'user', entity_id: 'u2', user_id: 'uid2', actor_name: 'Bruno', details: null, ip_address: null, user_agent: null, created_at: new Date().toISOString() },
  { id: '3', action: 'create', entity_type: 'user', entity_id: 'u3', user_id: 'uid3', actor_name: 'Carla', details: null, ip_address: null, user_agent: null, created_at: new Date().toISOString() },
];

const estado = vi.hoisted(() => ({
  dados: [] as unknown[],
  resumo: { total_logs: 0, sensitive_actions: 0, unique_users: 0, denied_24h: 0, permission_changes_24h: 0, admin_logins_7d: 0, rls_failures_24h: 0 },
  hojeTotal: 0,
  chamadas: [] as Array<{ nome: string; args: Record<string, unknown> }>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn((nome: string, args: Record<string, unknown> = {}) => {
      estado.chamadas.push({ nome, args });
      if (nome === 'audit_log_summary') {
        // A chamada do card "Hoje" é a única cujo p_from é a meia-noite de hoje no fuso do app.
        const ehHoje = args.p_from === appDayStart(0).toISOString();
        return Promise.resolve({
          data: [{ ...estado.resumo, total_logs: ehHoje ? estado.hojeTotal : estado.resumo.total_logs }],
          error: null,
        });
      }
      return Promise.resolve({ data: estado.dados, error: null });
    }),
  },
}));

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ hasRole: (r: string) => r === 'admin', loading: false }),
}));

import { AuditLogDashboard } from '../AuditLogDashboard';

const valorDoCard = (rotulo: string) => screen.getByText(rotulo).previousElementSibling?.textContent;
const resumosHoje = () => estado.chamadas.filter((c) => c.nome === 'audit_log_summary' && c.args.p_from === appDayStart(0).toISOString());

describe('AuditLogDashboard — card "Hoje" vem do banco (janela do dia, fuso do app)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estado.dados = LOGS_DE_HOJE;
    estado.resumo = { total_logs: 42, sensitive_actions: 3, unique_users: 5, denied_24h: 0, permission_changes_24h: 0, admin_logins_7d: 0, rls_failures_24h: 0 };
    estado.hojeTotal = 7;
    estado.chamadas.length = 0;
  });

  it('mostra o total do dia que o banco devolveu, não a contagem da página', async () => {
    render(<AuditLogDashboard />);
    await waitFor(() => expect(valorDoCard('Total de Logs')).toBe('42'));
    expect(valorDoCard('Hoje')).toBe('7');
    // A página tem 3 logs "de hoje"; se o card contasse o cliente mostraria 3.
    expect(valorDoCard('Hoje')).not.toBe(String(LOGS_DE_HOJE.length));
  });

  it('pede ao banco a janela [meia-noite do dia, agora]', async () => {
    render(<AuditLogDashboard />);
    await waitFor(() => expect(valorDoCard('Hoje')).toBe('7'));

    const chamadas = resumosHoje();
    expect(chamadas).toHaveLength(1);
    const args = chamadas[0].args;
    expect(args.p_from).toBe(appDayStart(0).toISOString());
    const fim = new Date(String(args.p_to)).getTime();
    expect(fim).toBeGreaterThanOrEqual(Date.now() - 10_000);
    expect(fim).toBeLessThanOrEqual(Date.now() + 10_000);
  });
});

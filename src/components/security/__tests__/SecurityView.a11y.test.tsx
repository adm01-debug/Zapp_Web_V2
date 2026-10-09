import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';

/**
 * Y18-1 / SHELL-01 — abas de Segurança sem nome acessível abaixo de 640 px.
 * Evidência da auditoria (docs/audits/AUDITORIA_A11Y_MOBILE_CONFIG_ADMIN_SHELL_2026-10-07.md:51):
 * axe `button-name` [critical], 11 nós em 390×844 (claro, escuro e alto contraste), porque o
 * rótulo de cada aba está em `<span className="hidden sm:inline">` e o `role="tab"` só ficava
 * com o ícone.
 *
 * O jsdom não carrega o CSS do Tailwind, então injetamos a regra `.hidden` do próprio Tailwind
 * (`display: none`) no <style> do teste: o jsdom aplica a cascata de <style> e o cálculo de nome
 * acessível (dom-accessibility-api) respeita o `display`, que é exatamente o estado que o
 * navegador real mede em < 640 px. Sem `aria-label`, o nome da aba não é encontrado.
 */
beforeAll(() => {
  const estilo = document.createElement('style');
  estilo.textContent = '.hidden { display: none; }';
  document.head.appendChild(estilo);
});

// As abas são o alvo deste teste: os painéis (que fazem leitura de dados) entram como dublês.
vi.mock('../SecuritySettingsPanel', () => ({ SecuritySettingsPanel: () => <div /> }));
vi.mock('../SecurityOverview', () => ({ SecurityOverview: () => <div /> }));
vi.mock('../DevicesPanel', () => ({ DevicesPanel: () => <div /> }));
vi.mock('../PasskeysPanel', () => ({ PasskeysPanel: () => <div /> }));
vi.mock('../SecurityNotificationsPanel', () => ({ SecurityNotificationsPanel: () => <div /> }));
vi.mock('../BlockedIPsPanel', () => ({ BlockedIPsPanel: () => <div /> }));
vi.mock('../IPWhitelistPanel', () => ({ IPWhitelistPanel: () => <div /> }));
vi.mock('../GeoBlockingPanel', () => ({ GeoBlockingPanel: () => <div /> }));
vi.mock('../PasswordResetRequestsPanel', () => ({ PasswordResetRequestsPanel: () => <div /> }));
vi.mock('../RateLimitRealtimeAlerts', () => ({ RateLimitRealtimeAlerts: () => <div /> }));
vi.mock('../RateLimitConfigPanel', () => ({ RateLimitConfigPanel: () => <div /> }));
vi.mock('../AuditLogDashboard', () => ({ AuditLogDashboard: () => <div /> }));
vi.mock('../QuarantinePanel', () => ({ QuarantinePanel: () => <div /> }));
vi.mock('@/hooks/system/useUserRole', () => ({ useUserRole: () => ({ hasRole: () => true }) }));
vi.mock('@/hooks/system/useSecurityPushNotifications', () => ({
  useSecurityPushNotifications: () => undefined,
}));

import { SecurityView } from '../SecurityView';

// Os 11 rótulos visíveis (um por aba, na ordem da barra) que o `aria-label` precisa repetir.
const ROTULOS = [
  'Visão Geral',
  'Conta',
  'Passkeys',
  'Dispositivos',
  'Alertas',
  'IPs',
  'Geo',
  'Rate Limit',
  'Auditoria',
  'Quarentena',
  'Admin',
];

describe('a11y: abas da Central de Segurança (SHELL-01)', () => {
  it('todas as 11 abas têm nome acessível mesmo com o rótulo escondido no celular', () => {
    render(<SecurityView />);

    expect(screen.getAllByRole('tab')).toHaveLength(ROTULOS.length);
    for (const rotulo of ROTULOS) {
      const aba = screen.getByRole('tab', { name: rotulo });
      // O nome tem de vir do próprio gatilho (aria-label), não do texto escondido pelo CSS.
      expect(aba).toHaveAttribute('aria-label', rotulo);
    }
  });

  it('axe não acusa aba sem nome (regra button-name)', async () => {
    render(<SecurityView />);

    // jsdom não tem layout: `color-contrast` fica fora (declarado); `button-name` é o alvo aqui.
    const results = await axe(document.body, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.filter((v) => v.id === 'button-name')).toEqual([]);
  });
});

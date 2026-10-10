/**
 * N-079 — E2E a11y: button-name e aria-progressbar-name em ?view=tasks e
 * ?view=dashboard em 390 e 1280.
 *
 * Spec mockada (sessão falsa, app shell mockado, rede real bloqueada).
 * O teste falha sem a correção (Y16: aria-label em botões e progressbar)
 * e passa com ela (zero violações).
 */
import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';

import { bloquearRedeReal, json, mockAppShell, type Registro } from './fixtures/mapa-mocks';
import { installFakeSession } from './fixtures/talkx-demo';

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

const VIEWPORTS = [
  { name: 'mobile-390x844', width: 390, height: 844 },
  { name: 'desktop-1280x720', width: 1280, height: 720 },
];

const REGRAS_AXE = ['button-name', 'aria-progressbar-name'] as const;

async function violacoesAxe(page: Page, seletor: string, regras: readonly string[]) {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(
    async ([sel, ids]) => {
      const axe = (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string; impact: string; nodes: { target: string[]; failureSummary?: string }[] }[] }> } }).axe;
      const r = await axe.run(
        sel === 'body' ? document.body : (document.querySelector(sel) ?? document.body),
        { runOnly: { type: 'rule', values: ids } },
      );
      return r.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nos: v.nodes.length,
        alvos: v.nodes.map((n) => ({ seletor: n.target.join(' '), motivo: n.failureSummary ?? '' })),
      }));
    },
    [seletor, regras] as const,
  );
}

async function mockTarefasVazios(page: Page): Promise<void> {
  await page.route(/\/rest\/v1\/conversation_tasks/, (route) => json(route, []));
}

async function mockDashboardVazio(page: Page): Promise<void> {
  // Dashboard lê métricas via RPC e REST; retorna dados vazios mas válidos
  // para que a shell monte e os elementos a11y sejam renderizados.
  await page.route(/\/rest\/v1\/rpc\/(get_dashboard_metrics|get_overview_stats)/, (route) =>
    json(route, { total: 0, active: 0, completed: 0, pending: 0 }),
  );
  await page.route(/\/rest\/v1\/rpc\/contacts_count/, (route) => json(route, 0));
  await page.route(/\/rest\/v1\/rpc\/dashboard_kpi/, (route) => json(route, []));
  await page.route(/\/rest\/v1\/rpc\/dashboard_hourly_volume/, (route) => json(route, []));
  await page.route(/\/rest\/v1\/rpc\/dashboard_contact_counts/, (route) =>
    json(route, { total: 0, open: 0, pending: 0, myActive: 0, queues: [] }),
  );
  await page.route(/\/rest\/v1\/rpc\/dashboard_agents/, (route) =>
    json(route, { agents: [], onlineAgents: 0, totalAgents: 0 }),
  );
  await page.route(/\/rest\/v1\/rpc\/dashboard_queues/, (route) =>
    json(route, []),
  );
  await page.route(/\/rest\/v1\/conversation_events/, (route) => json(route, []));
}

test.describe('N-079 — a11y button-name e aria-progressbar-name', () => {
  test.beforeEach(async ({ page }) => {
    await bloquearRedeReal(page, { redeBarrada: [] } as unknown as Registro);
    await mockAppShell(page, { redeBarrada: [] } as unknown as Registro);
    await installFakeSession(page);
  });

  // ---------------------------------------------------------------------------
  // ?view=tasks
  // ---------------------------------------------------------------------------
  test.describe('?view=tasks', () => {
    for (const vp of VIEWPORTS) {
      test(`button-name e aria-progressbar-name zeram em ${vp.name}`, async ({ page }) => {
        await mockTarefasVazios(page);
        await page.goto('/?view=tasks');
        await expect(page.getByTestId('tasks-module')).toBeVisible({ timeout: 60_000 });
        await expect(page.getByTestId('tasks-mode')).toBeVisible();

        const vios = await violacoesAxe(page, 'body', REGRAS_AXE);
        expect(vios).toEqual([]);
      });
    }
  });

  // ---------------------------------------------------------------------------
  // ?view=dashboard
  // ---------------------------------------------------------------------------
  test.describe('?view=dashboard', () => {
    test.setTimeout(90_000);
    for (const vp of VIEWPORTS) {
      test(`button-name e aria-progressbar-name zeram em ${vp.name}`, async ({ page }) => {
        await mockDashboardVazio(page);
        await page.goto('/?view=dashboard');
        await expect(page.getByTestId('dash-tabs')).toBeVisible({ timeout: 60_000 });

        const vios = await violacoesAxe(page, 'body', REGRAS_AXE);
        expect(vios).toEqual([]);
      });
    }
  });
});
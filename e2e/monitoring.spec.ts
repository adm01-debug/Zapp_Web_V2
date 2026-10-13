/** t_9de4f9f6 · E2E do painel de monitoramento por papel (view=evolution-monitor).
 *
 * A view `evolution-monitor` é `roles: ADMIN_ONLY` em `navigation.service.ts` e o
 * `ViewRouter` decide entre o painel e o "Acesso restrito" por
 * `NavigationService.canAccess(view, roles, permissions)`. Este spec prova as DUAS
 * pontas: com papel `admin` o painel Evolution monta (com dados reais de fixture,
 * não no estado vazio) e sem papel de admin o ViewRouter barra com "Acesso restrito".
 * Trocar só a resposta de `user_roles` é o que distingue os dois cenários — é a
 * regra de papel que está sob teste.
 *
 * Metodologia: sessão fake + backend mockado (mapa-mocks.ts, talkx-demo.ts), sem
 * secrets e sem banco — mesmo padrão de e2e/a11y-inbox-teams.spec.ts (N-078).
 * `messages` é uma tabela que o `mockAppShell` NÃO cobre de propósito; aqui ela é
 * respondida para o painel sair do `loading` e o `redeBarrada` (rede real) ficar vazio.
 */
import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import {
  bloquearRedeReal,
  json,
  mockAppShell,
  querObjetoUnico,
  type Registro,
} from './fixtures/mapa-mocks';
import { installFakeSession } from './fixtures/talkx-demo';

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

interface ViolacaoAxe {
  id: string;
  impact: string | null;
  nodes: { target: string[]; html: string }[];
}

async function violacoes(page: Page, regras: string[]): Promise<ViolacaoAxe[]> {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(
    async (ids) => {
      const win = window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: ViolacaoAxe[] }> } };
      const r = await win.axe.run(document.body, { runOnly: { type: 'rule', values: ids } });
      return r.violations;
    },
    regras as string[],
  );
}

const VIEW = 'evolution-monitor';
const NOME_PAINEL = 'Painel de monitoramento Evolution API';
const MIN = 60 * 1000;
const HORA = 60 * MIN;
const iso = (deltaMs: number) => new Date(Date.now() + deltaMs).toISOString();

// Duas instâncias: uma conectada/saudável (dados que o painel desenha) e uma caída.
const CONEXOES = [
  {
    id: 'c-inst-sint-1',
    instance_id: 'inst-sintetica-1',
    phone_number: '5511900000001',
    status: 'connected',
    health_status: 'healthy',
    health_response_ms: 120,
    last_health_check: iso(-3 * MIN),
    updated_at: iso(-1 * MIN),
  },
  {
    id: 'c-inst-sint-2',
    instance_id: 'inst-sintetica-2',
    phone_number: '5511900000002',
    status: 'disconnected',
    health_status: 'error',
    health_response_ms: null,
    last_health_check: iso(-2 * HORA),
    updated_at: iso(-2 * HORA),
  },
];

function healthLog(id: string, status: string, deltaMs: number, responseTime: number | null) {
  return {
    id,
    instance_id: 'inst-sintetica-1',
    status,
    checked_at: iso(deltaMs),
    response_time_ms: responseTime,
    error_message: status === 'error' ? 'timeout sintético' : null,
  };
}

// Tudo dentro da janela do SLA (24h) e do heatmap (7 dias) do hook.
const HEALTH_LOGS = [
  healthLog('h-1', 'healthy', -20 * MIN, 110),
  healthLog('h-2', 'healthy', -40 * MIN, 130),
  healthLog('h-3', 'error', -90 * MIN, null),
  healthLog('h-4', 'healthy', -3 * HORA, 125),
];

// `sender` é o que o painel conta como entrada ('contact') e saída ('agent').
const MENSAGENS = [
  { sender: 'contact', created_at: iso(-4 * HORA) },
  { sender: 'agent', created_at: iso(-3 * HORA) },
  { sender: 'contact', created_at: iso(-90 * MIN) },
  { sender: 'agent', created_at: iso(-30 * MIN) },
  { sender: 'agent', created_at: iso(-5 * MIN) },
];

async function montarMonitoramento(page: Page, registro: Registro, papel: 'admin' | 'agent') {
  // A REDE REAL é barrada PRIMEIRO (última rota registrada vence): assim as rotas
  // específicas abaixo é que respondem, e `bloquearRedeReal` fica só como rede de
  // segurança para o que escapar — mesmo ordem de `a11y-inbox-teams.spec.ts`.
  await bloquearRedeReal(page, registro);
  await installFakeSession(page);
  await mockAppShell(page, registro);
  // Registrado DEPOIS do mockAppShell: a última rota vence. É o papel do usuário
  // que o `ViewRouter` lê via `useUserRole` → `user_roles.select('role')`.
  await page.route(/\/rest\/v1\/user_roles/, (route) =>
    json(route, querObjetoUnico(route) ? { role: papel } : [{ role: papel }]),
  );
  await page.route(/\/rest\/v1\/whatsapp_connections/, (route) =>
    json(route, querObjetoUnico(route) ? CONEXOES[0] : CONEXOES),
  );
  await page.route(/\/rest\/v1\/connection_health_logs/, (route) => json(route, HEALTH_LOGS));
  await page.route(/\/rest\/v1\/messages/, (route) => json(route, MENSAGENS));
}

function novoRegistro(): Registro {
  return { writesApp: [], mapbox: [], redeBarrada: [] };
}

test.describe('Painel de monitoramento (evolution-monitor) por papel', () => {
  test('admin vê o painel Evolution com as conexões reais da fixture', async ({ page }) => {
    const registro = novoRegistro();
    await montarMonitoramento(page, registro, 'admin');

    await page.goto(`/?view=${VIEW}`);

    const painel = page.getByRole('main', { name: NOME_PAINEL });
    await expect(painel).toBeVisible({ timeout: 20_000 });
    // Dado de fixture renderizado: o painel não ficou no esqueleto/estado vazio.
    await expect(painel.getByText('inst-sintetica-1').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Acesso restrito' })).toHaveCount(0);
    expect(registro.redeBarrada).toEqual([]);
  });

  test('usuário sem papel admin recebe o acesso restrito e o painel não monta', async ({ page }) => {
    const registro = novoRegistro();
    await montarMonitoramento(page, registro, 'agent');

    await page.goto(`/?view=${VIEW}`);

    await expect(page.getByRole('heading', { name: 'Acesso restrito' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('main', { name: NOME_PAINEL })).toHaveCount(0);
    await expect(page.getByText('inst-sintetica-1')).toHaveCount(0);
    // A view barrada não chama o backend de monitoramento.
    expect(registro.redeBarrada).toEqual([]);
  });

  test('axe button-name/list no painel renderizado não aponta violação', async ({ page }) => {
    const registro = novoRegistro();
    await montarMonitoramento(page, registro, 'admin');

    await page.goto(`/?view=${VIEW}`);
    const painel = page.getByRole('main', { name: NOME_PAINEL });
    await expect(painel).toBeVisible({ timeout: 20_000 });
    // Mede o painel COM conexão renderizada (cards com botões QR/Webhook/Testar):
    // sem dado, o axe mediria o estado vazio e não os botões reais.
    await expect(painel.getByText('inst-sintetica-1').first()).toBeVisible();

    const v = await violacoes(page, ['button-name', 'list']);
    const resumo = v.map((viol) => `${viol.id} (${viol.impact}): ${viol.nodes.length} nó(s)`).join(' | ');
    expect(v, `painel de monitoramento: zero violações de button-name/list\n${resumo}`).toHaveLength(0);
    expect(registro.redeBarrada).toEqual([]);
  });
});

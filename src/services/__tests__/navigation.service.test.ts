import { describe, expect, it } from 'vitest';
import { NavigationService } from '@/services/navigation.service';

const DEVELOPMENT_IDS = ['payments', 'meta-capi', 'google-calendar'];

describe('NavigationService integration maturity', () => {
  it('keeps incomplete integrations out of production-ready groups', () => {
    const groups = NavigationService.getGroups();
    const development = groups.find(({ label }) => label === 'Em Desenvolvimento');
    const readyIds = groups
      .filter(({ label }) => label !== 'Em Desenvolvimento')
      .flatMap(({ items }) => items.map(({ id }) => id));

    expect(development?.items.map(({ id }) => id)).toEqual(DEVELOPMENT_IDS);
    expect(readyIds).not.toEqual(expect.arrayContaining(DEVELOPMENT_IDS));
  });

  it('exposes every navigation id exactly once across primary and grouped menus', () => {
    const ids = [
      ...NavigationService.getPrimaryNav().map(({ id }) => id),
      ...NavigationService.getGroups().flatMap(({ items }) => items.map(({ id }) => id)),
    ];

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('preserves the full-layout contract for workspace views', () => {
    const fullLayoutIds = NavigationService.getPrimaryNav()
      .concat(NavigationService.getGroups().flatMap(({ items }) => items))
      .filter(({ layout }) => layout === 'full')
      .map(({ id }) => id);

    expect(fullLayoutIds).toEqual(expect.arrayContaining(['inbox', 'team-chat', 'email-chat', 'tasks', 'omni-inbox']));
  });
});

describe('NavigationService role gating', () => {
  const PRIMARY_IDS = ['inbox', 'team-chat', 'email-chat', 'contacts', 'multiplix', 'catalog', 'voip', 'tasks', 'achievements', 'dashboard'];

  it('exposes exactly the 10 agreed items, in order, on the primary nav', () => {
    expect(NavigationService.getPrimaryNav().map(({ id }) => id)).toEqual(PRIMARY_IDS);
  });

  it('nao expoe mais a entrada "Quadro" (id pipeline) na nav primaria', () => {
    const itens = NavigationService.getPrimaryNav();
    expect(itens.map(({ id }) => id)).not.toContain('pipeline');
    expect(itens.map(({ label }) => label)).not.toContain('Quadro');
  });

  it('never authorizes an unknown view id (deny by default)', () => {
    expect(NavigationService.canAccess('nonexistent-view', ['admin'])).toBe(false);
    expect(NavigationService.canAccess('nonexistent-view', [])).toBe(false);
  });

  it('libera a nav primaria do agente comum; o Multiplix saiu do gate por papel (F25)', () => {
    for (const id of PRIMARY_IDS.filter((id) => id !== 'multiplix')) {
      expect(NavigationService.canAccess(id, ['agent'])).toBe(true);
    }
    // F25: o gate do Multiplix mudou de papel (STAFF_ROLES) para a permissao
    // nomeada `multiplix.dispatch.create`. Papel sozinho nao autoriza mais —
    // sem a permissao, nem supervisor/admin passam.
    expect(NavigationService.canAccess('multiplix', ['agent'])).toBe(false);
    expect(NavigationService.canAccess('multiplix', ['supervisor'])).toBe(false);
    expect(NavigationService.canAccess('multiplix', ['admin'])).toBe(false);
    // Com a permissao nomeada, qualquer um dos papeis autorizados passa.
    expect(NavigationService.canAccess('multiplix', ['agent'], ['multiplix.dispatch.create'])).toBe(true);
    expect(NavigationService.canAccess('multiplix', ['supervisor'], ['multiplix.dispatch.create'])).toBe(true);
    expect(NavigationService.canAccess('multiplix', ['admin'], ['multiplix.dispatch.create'])).toBe(true);
    expect(NavigationService.canAccess('security', ['agent'])).toBe(false);
    expect(NavigationService.canAccess('admin', ['agent'])).toBe(false);
    expect(NavigationService.canAccess('audit-logs', ['agent'])).toBe(false);
  });

  it('lets a supervisor into every group except Admin and the advanced set', () => {
    expect(NavigationService.canAccess('security', ['supervisor'])).toBe(true);
    expect(NavigationService.canAccess('reports', ['supervisor'])).toBe(true);
    expect(NavigationService.canAccess('admin', ['supervisor'])).toBe(false);
    expect(NavigationService.canAccess('audit-logs', ['supervisor'])).toBe(false);
  });

  it('only an admin reaches Admin and the advanced set', () => {
    expect(NavigationService.canAccess('admin', ['admin'])).toBe(true);
    expect(NavigationService.canAccess('audit-logs', ['admin'])).toBe(true);
  });

  it('filterNavItems drops every staff-only item for a plain agent, except the always-visible Configurações', () => {
    const groups = NavigationService.getGroups();
    for (const group of groups) {
      const visible = NavigationService.filterNavItems(group.items, ['agent']);
      const visibleIds = visible.map(({ id }) => id);
      expect(visibleIds).toEqual(group.label === 'Sistema' ? ['settings'] : []);
    }
    const advanced = NavigationService.filterNavItems(NavigationService.getAdvancedNav(), ['agent']);
    expect(advanced).toEqual([]);
  });
});

/**
 * F25 (Bloco B): o Multiplix deixou de ser gated por papel (STAFF_ROLES) e passou
 * a exigir a permissao nomeada `multiplix.dispatch.create`. A permissao chega ao
 * front pelo mesmo caminho que o ProtectedRoute ja usa (RoleService.checkPermission
 * -> RPC user_has_permission, SECURITY DEFINER) e e passada explicitamente para
 * filterNavItems/canAccess — o servico NAO le banco nem papeis por conta propria.
 */
describe('F25 — Multiplix por permissao nomeada (multiplix.dispatch.create)', () => {
  const MULTIPLIX_PERMISSION = 'multiplix.dispatch.create';

  it('expoe a permissao exigida pela nav a partir do proprio metadata (sem lista hardcoded)', () => {
    expect(NavigationService.getRequiredPermissions()).toEqual([MULTIPLIX_PERMISSION]);
  });

  it('mostra a entrada de nav para quem TEM a permissao, qualquer que seja o papel', () => {
    for (const role of ['agent', 'supervisor', 'admin'] as const) {
      const ids = NavigationService
        .filterNavItems(NavigationService.getPrimaryNav(), [role], [MULTIPLIX_PERMISSION])
        .map(({ id }) => id);
      expect(ids).toContain('multiplix');
    }
  });

  it('esconde a entrada de nav de quem NAO tem a permissao, mesmo sendo staff', () => {
    for (const role of ['agent', 'supervisor', 'admin'] as const) {
      const ids = NavigationService
        .filterNavItems(NavigationService.getPrimaryNav(), [role], [])
        .map(({ id }) => id);
      expect(ids).not.toContain('multiplix');
    }
  });

  it('canAccess (usado pelo ViewRouter) bloqueia e libera a rota pela permissao, nao pelo papel', () => {
    expect(NavigationService.canAccess('multiplix', ['supervisor'], [])).toBe(false);
    expect(NavigationService.canAccess('multiplix', ['agent'], [])).toBe(false);
    expect(NavigationService.canAccess('multiplix', ['agent'], [MULTIPLIX_PERMISSION])).toBe(true);
    expect(NavigationService.canAccess('multiplix', ['supervisor'], [MULTIPLIX_PERMISSION])).toBe(true);
  });

  it('nao afeta as demais rotas: permissao vazia nao muda o resultado delas', () => {
    expect(NavigationService.canAccess('catalog', ['agent'], [])).toBe(true);
    expect(NavigationService.canAccess('dashboard', ['agent'], [])).toBe(true);
    expect(NavigationService.canAccess('wallet', ['supervisor'], [])).toBe(true);
    expect(NavigationService.canAccess('security', ['agent'], [])).toBe(false);
    expect(NavigationService.canAccess('admin', ['supervisor'], [])).toBe(false);
  });
});

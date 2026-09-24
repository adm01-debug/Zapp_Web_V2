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

    expect(fullLayoutIds).toEqual(expect.arrayContaining(['inbox', 'team-chat', 'email-chat', 'pipeline', 'omni-inbox']));
  });
});

describe('NavigationService role gating', () => {
  const PRIMARY_IDS = ['inbox', 'team-chat', 'email-chat', 'contacts', 'catalog', 'voip', 'pipeline', 'tasks', 'achievements', 'dashboard'];

  it('exposes exactly the 10 agreed items, in order, on the primary nav', () => {
    expect(NavigationService.getPrimaryNav().map(({ id }) => id)).toEqual(PRIMARY_IDS);
  });

  it('never authorizes an unknown view id (deny by default)', () => {
    expect(NavigationService.canAccess('nonexistent-view', ['admin'])).toBe(false);
    expect(NavigationService.canAccess('nonexistent-view', [])).toBe(false);
  });

  it('lets a plain agent access every primary nav item and nothing staff-only', () => {
    for (const id of PRIMARY_IDS) {
      expect(NavigationService.canAccess(id, ['agent'])).toBe(true);
    }
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

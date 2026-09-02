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

/**
 * HZ1-06 — item de menu "Insights de Busca".
 *
 * A entrada vive no grupo Sistema com o filtro STAFF_ROLES (admin/supervisor),
 * o mesmo das telas de admin — a RPC que alimenta a tela nega os demais (42501).
 * O menu e a rota leem o MESMO metadata (NavigationService), então este teste
 * cobre as duas pontas: quem vê o item e quem passa pelo gate da rota.
 */
import { describe, expect, it } from 'vitest';
import { NavigationService } from '@/services/navigation.service';

const ID = 'search-insights';

describe('NavigationService — Insights de Busca (HZ1-06)', () => {
  it('existe no grupo Sistema com o rótulo oficial', () => {
    const sistema = NavigationService.getGroups().find((g) => g.label === 'Sistema');
    const item = sistema?.items.find((i) => i.id === ID);

    expect(item).toBeDefined();
    expect(item?.label).toBe('Insights de Busca');
    expect(NavigationService.getViewLabel(ID)).toBe('Insights de Busca');
  });

  it('libera a rota para admin e supervisor', () => {
    expect(NavigationService.canAccess(ID, ['admin'])).toBe(true);
    expect(NavigationService.canAccess(ID, ['supervisor'])).toBe(true);
  });

  it('nega a rota para agente comum e para quem não tem papel', () => {
    expect(NavigationService.canAccess(ID, ['agent'])).toBe(false);
    expect(NavigationService.canAccess(ID, [])).toBe(false);
  });

  it('esconde o item do menu do agente e do usuário sem papel, e o mostra para staff', () => {
    const sistema = NavigationService.getGroups().find((g) => g.label === 'Sistema');
    const items = sistema?.items ?? [];

    expect(NavigationService.filterNavItems(items, ['agent']).map((i) => i.id)).not.toContain(ID);
    expect(NavigationService.filterNavItems(items, []).map((i) => i.id)).not.toContain(ID);
    expect(NavigationService.filterNavItems(items, ['supervisor']).map((i) => i.id)).toContain(ID);
    expect(NavigationService.filterNavItems(items, ['admin']).map((i) => i.id)).toContain(ID);
  });
});

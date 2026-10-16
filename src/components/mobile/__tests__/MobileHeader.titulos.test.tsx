/**
 * Trava a fonte única do título do cabeçalho mobile.
 *
 * O `MobileHeader` montava o título de um dicionário local de 18 chaves com
 * fallback `charAt(0).toUpperCase()`, então views reais do catálogo caíam no
 * rótulo cru: 'team-chat' → 'Team-chat', 'sla' → 'Sla', 'warroom' → 'Warroom'.
 *
 * Este teste percorre TODOS os ids de navegação do `NavigationService` (a
 * mesma fonte que rotula menu e ViewRouter) e falha se algum id cair no
 * fallback cru em vez do rótulo oficial (o dicionário local só pode
 * sobrescrever, ex.: 'inbox' → 'Conversas'). Cada id é conferido três vezes:
 * texto exato do título, ausência de hífen e inicial maiúscula.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MobileHeader } from '@/components/mobile/MobileHeader';
import { NavigationService } from '@/services/navigation.service';

const baseProps = {
  onMenuOpen: vi.fn(),
  agentName: 'Ana Souza',
};

const navItems = [
  ...NavigationService.getPrimaryNav(),
  ...NavigationService.getGroups().flatMap((g) => g.items),
  ...NavigationService.getAdvancedNav(),
];

const navIds = [...new Set(navItems.map((item) => item.id))];
const labelById = new Map(navItems.map((item) => [item.id, item.label] as const));

// Sobrescritas do dicionário local do cabeçalho: os únicos ids cujo título no
// celular difere do rótulo do menu (curtos para caber no cabeçalho).
const OVERRIDES: Record<string, string> = {
  inbox: 'Conversas',
  campaigns: 'Campanhas',
};

/** Título que o cabeçalho DEVE mostrar: rótulo do menu, salvo as sobrescritas acima. */
function tituloEsperado(id: string): string {
  return OVERRIDES[id] ?? labelById.get(id)!;
}

function tituloRenderizado(id: string): string {
  render(<MobileHeader {...baseProps} currentView={id} />);
  return screen.getByRole('heading', { level: 1 }).textContent ?? '';
}

describe('MobileHeader — todo id de navegação tem o título oficial (nunca o fallback cru)', () => {
  it('o catálogo de navegação não está vazio (o teste percorre de verdade)', () => {
    expect(navIds.length).toBeGreaterThan(20);
  });

  it('todo id do catálogo tem rótulo próprio, sem hífen (o menu nunca mostra id cru)', () => {
    for (const id of navIds) {
      const label = NavigationService.getViewLabel(id);
      expect(label).not.toBe(id);
      expect(label).not.toMatch(/-/);
      expect(label.charAt(0)).toBe(label.charAt(0).toUpperCase());
    }
  });

  it.each(navIds)('view "%s" mostra o rótulo oficial', (id) => {
    const titulo = tituloRenderizado(id);
    const official = tituloEsperado(id);
    const cru = id.charAt(0).toUpperCase() + id.slice(1);

    expect(titulo).toBe(official);
    // Se o rótulo oficial difere do "cru", o fallback cru NÃO pode aparecer.
    if (official !== cru) {
      expect(titulo).not.toBe(cru);
    }
  });

  it.each(navIds)('view "%s": título sem hífen e com inicial maiúscula', (id) => {
    const titulo = tituloRenderizado(id);

    expect(titulo).not.toMatch(/-/);
    expect(titulo.charAt(0)).toBe(titulo.charAt(0).toUpperCase());
    expect(titulo).not.toMatch(/^[a-zà-ú]/);
  });
});

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
 * sobrescrever, ex.: 'inbox' → 'Conversas').
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

describe('MobileHeader — todo id de navegação tem o título oficial (nunca o fallback cru)', () => {
  it('o catálogo de navegação não está vazio (o teste percorre de verdade)', () => {
    expect(navIds.length).toBeGreaterThan(20);
  });

  it.each(navIds)('view "%s" mostra o rótulo oficial', (id) => {
    render(<MobileHeader {...baseProps} currentView={id} />);

    const heading = screen.getByRole('heading', { level: 1 });
    const official = OVERRIDES[id] ?? labelById.get(id)!;
    const cru = id.charAt(0).toUpperCase() + id.slice(1);

    expect(heading).toHaveTextContent(official);
    // Se o rótulo oficial difere do "cru", o fallback cru NÃO pode aparecer.
    if (official !== cru) {
      expect(heading.textContent).not.toBe(cru);
    }
  });
});

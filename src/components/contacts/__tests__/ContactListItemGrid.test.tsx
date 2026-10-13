import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ContactListItem } from '../ContactListItem';
import type { Contact } from '../types';
import { baseContact, noop } from './contactDeleteFixtures';

/**
 * O `ContactListItem` imita colunas de tabela. A técnica antiga (flexbox + `min-w-[130px]`
 * etc.) desalinhava entre linhas porque a largura de cada coluna vinha do conteúdo de
 * cada linha. O alinhamento agora vem de um `grid` com `grid-template-columns` definido:
 * todas as linhas usam o MESMO template, em trilhas `auto`/`fr` (que resolvem igual para
 * linhas de mesma largura). Este teste prova os 3 critérios do cartão.
 */

const RANK: Record<string, number> = { sm: 1, md: 2, lg: 3, xl: 4 };

function itemProps(contact: Contact, index = 0) {
  return {
    contact,
    isSelected: false,
    onToggleSelect: noop,
    onOpenDetails: noop,
    onOpenChat: noop,
    onEdit: noop,
    onDelete: noop,
    index,
  };
}

/** A célula é visível na largura `rank`? `hidden` esconde no mobile; `md:block`/`lg:flex` etc. reexibem. */
function visibleAt(el: Element, rank: number): boolean {
  const classes = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
  if (!classes.includes('hidden')) return true;
  for (const c of classes) {
    const m = c.match(/^(sm|md|lg|xl):(.+)$/);
    if (m && m[2] !== 'hidden' && RANK[m[1]] <= rank) return true;
  }
  return false;
}

/** O `grid-template-columns` ativo numa largura é o último breakpoint menor ou igual a ela. */
function activeTemplate(root: Element, rank: number): string | null {
  let best: string | null = null;
  let bestRank = -1;
  for (const c of (root.getAttribute('class') || '').split(/\s+/)) {
    const m = c.match(/^(?:(sm|md|lg|xl):)?grid-cols-\[(.+)\]$/);
    if (!m) continue;
    const r = m[1] ? RANK[m[1]] : 0;
    if (r <= rank && r > bestRank) {
      bestRank = r;
      best = m[2];
    }
  }
  return best;
}

function root(): Element {
  const el = document.querySelector('[data-testid="contact-list-item"]');
  if (!el) throw new Error('contact-list-item não renderizado');
  return el;
}

describe('ContactListItem · alinhamento por grid (não por min-w arbitrário)', () => {
  it('usa CSS grid e não usa nenhum min-w-[Npx] arbitrário', () => {
    const { container } = render(<ContactListItem {...itemProps(baseContact())} />);
    const classes = root().getAttribute('class') || '';

    expect(classes.split(/\s+/)).toContain('grid');
    expect(container.innerHTML).not.toMatch(/min-w-\[\d+px\]/);
  });

  it('as trilhas do template não usam pixels (só auto/fr) e o nº de colunas bate com as células visíveis', () => {
    render(<ContactListItem {...itemProps(baseContact())} />);
    const el = root();

    // 768px = md (rank 2); 1280px = xl (rank 4) — as duas larguras do critério de pronto.
    const cases: Array<{ rank: number; window: string }> = [
      { rank: 0, window: 'base (<640px)' },
      { rank: 2, window: '768px (md)' },
      { rank: 3, window: '1024px (lg)' },
      { rank: 4, window: '1280px (xl)' },
    ];

    for (const { rank, window } of cases) {
      const template = activeTemplate(el, rank);
      expect(template, `sem grid-cols para ${window}`).not.toBeNull();

      const tracks = template!.split('_');
      // trilha determinística (auto ou minmax fr) — nunca largura fixa em px
      for (const track of tracks) {
        expect(track, `trilha com px em ${window}`).not.toMatch(/px/);
        expect(track, `trilha inesperada em ${window}: ${track}`).toMatch(/^(auto|minmax\(0,[\d.]+fr\))$/);
      }

      const visible = Array.from(el.children).filter((c) => visibleAt(c, rank)).length;
      expect(tracks.length, `nº de trilhas x células visíveis em ${window}`).toBe(visible);
    }
  });

  it('duas linhas compartilham exatamente o mesmo template (é isso que alinha as colunas)', () => {
    render(
      <>
        <ContactListItem {...itemProps(baseContact({ id: 'c-1', name: 'Ana' }))} />
        <ContactListItem {...itemProps(baseContact({ id: 'c-2', name: 'Bruno' }))} index={1} />
      </>,
    );
    const rows = Array.from(document.querySelectorAll('[data-testid="contact-list-item"]'));
    expect(rows).toHaveLength(2);

    const templates = rows.map((r) =>
      (r.getAttribute('class') || '')
        .split(/\s+/)
        .filter((c) => /grid-cols-\[/.test(c))
        .sort(),
    );
    expect(templates[0]).toEqual(templates[1]);
    expect(templates[0].length).toBeGreaterThan(0);
  });
});

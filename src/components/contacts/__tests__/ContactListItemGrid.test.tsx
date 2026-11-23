import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ContactListItem } from '../ContactListItem';
import type { Contact } from '../types';
import { baseContact, noop } from './contactDeleteFixtures';

/**
 * O `ContactListItem` imita colunas de tabela. A técnica antiga (flexbox + `min-w-[130px]`
 * etc.) desalinhava entre linhas porque a largura de cada coluna vinha do conteúdo de
 * cada linha. O alinhamento agora vem de `grid` com `grid-template-columns` determinístico:
 * todas as linhas usam o MESMO template, em trilhas `auto`/`fr` (que resolvem igual para
 * linhas de mesma largura). Este teste prova os 3 critérios do cartão.
 *
 * O design da lista (`docs/design/contatos-redesign-2026-10-12`, `.zc-list .zc-contact`)
 * tem retrato fixo à esquerda e o corpo em colunas: o root é `auto + minmax(0,1fr)` e o
 * corpo é que carrega as trilhas de conteúdo.
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

function body(): Element {
  const el = document.querySelector('[data-testid="contact-list-item-body"]');
  if (!el) throw new Error('contact-list-item-body não renderizado');
  return el;
}

/** Filhos que ocupam trilha: os posicionados (`absolute`, seleção) não contam. */
function celulas(el: Element, rank: number): Element[] {
  return Array.from(el.children).filter(
    (c) => !(c.getAttribute('class') || '').split(/\s+/).includes('absolute') && visibleAt(c, rank),
  );
}

describe('ContactListItem · alinhamento por grid (não por min-w arbitrário)', () => {
  it('usa CSS grid e não usa nenhum min-w-[Npx] arbitrário nas trilhas', () => {
    const { container } = render(<ContactListItem {...itemProps(baseContact())} />);
    const classes = root().getAttribute('class') || '';

    expect(classes.split(/\s+/)).toContain('grid');
    // `min-w-[Npx]` de alvo de toque (`[@media(pointer:coarse)]:min-w-[44px]` nos
    // botões) não é largura de coluna: só conta quando a classe nasce sem
    // variante (espaço ou aspas antes do `min-w-`).
    expect(container.innerHTML).not.toMatch(/[\s"]min-w-\[\d+px\]/);
  });

  it('o root tem retrato + corpo em trilhas sem pixels', () => {
    render(<ContactListItem {...itemProps(baseContact())} />);
    const el = root();

    for (const rank of [0, 2, 3, 4]) {
      const template = activeTemplate(el, rank);
      expect(template, `sem grid-cols no root (rank ${rank})`).not.toBeNull();
      const tracks = template!.split('_');
      expect(tracks).toEqual(['auto', 'minmax(0,1fr)']);
      expect(celulas(el, rank)).toHaveLength(tracks.length);
    }
  });

  it('o corpo usa trilhas proporcionais e nenhuma largura vinda do conteúdo', () => {
    render(<ContactListItem {...itemProps(baseContact())} />);
    const el = body();

    // 768px = md (rank 2); 1280px = xl (rank 4) — as duas larguras do critério de pronto.
    const cases: Array<{ rank: number; window: string }> = [
      { rank: 0, window: 'base (<640px)' },
      { rank: 2, window: '768px (md)' },
      { rank: 3, window: '1024px (lg)' },
      { rank: 4, window: '1280px (xl)' },
    ];

    for (const { rank, window } of cases) {
      const template = activeTemplate(el, rank);
      expect(template, `sem grid-cols no corpo para ${window}`).not.toBeNull();

      const tracks = template!.split('_');
      for (const track of tracks) {
        // `fr` proporcional, `auto` derivado do conteúdo da COLUNA (igual em todas as
        // linhas) ou uma largura fixa da coluna (o design usa 120px na última). O que não
        // pode existir é `min-w-[Npx]` por célula, que é o que desalinhava antes.
        expect(track, `trilha inesperada em ${window}: ${track}`).toMatch(/^(\d+(\.\d+)?fr|auto|\d+px)$/);
      }

      const cells = celulas(el, rank).length;
      // A seleção é `absolute` (não ocupa trilha); o resto ocupa.
      expect(tracks.length, `nº de trilhas x células em ${window}`).toBe(cells);
    }
  });

  it('duas linhas compartilham exatamente o mesmo template (é isso que alinha as colunas)', () => {
    render(
      <>
        <ContactListItem {...itemProps(baseContact({ id: 'c-1', name: 'Ana' }))} />
        <ContactListItem {...itemProps(baseContact({ id: 'c-2', name: 'Bruno', tags: ['vip'] }))} index={1} />
      </>,
    );
    const rows = Array.from(document.querySelectorAll('[data-testid="contact-list-item"]'));
    const bodies = Array.from(document.querySelectorAll('[data-testid="contact-list-item-body"]'));
    expect(rows).toHaveLength(2);
    expect(bodies).toHaveLength(2);

    const templateOf = (el: Element) =>
      (el.getAttribute('class') || '')
        .split(/\s+/)
        .filter((c) => /grid-cols-\[/.test(c))
        .sort();

    for (const el of [rows, bodies]) {
      const templates = el.map(templateOf);
      expect(templates[0]).toEqual(templates[1]);
      expect(templates[0].length).toBeGreaterThan(0);
    }
  });
});
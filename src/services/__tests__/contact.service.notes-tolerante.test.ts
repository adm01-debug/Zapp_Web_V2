import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Compatibilidade de deploy (C098): o front é publicado pela Vercel no merge e a migration
 * `20261026200000_contact_notes_pinned.sql` só chega à produção depois (db-migrate com
 * aprovação humana). Até lá `contact_notes` NÃO tem a coluna `is_pinned`; o serviço não pode
 * depender dela nem na leitura (select) nem na criação (insert).
 */
const h = vi.hoisted(() => ({
  selectArgs: [] as unknown[][],
  insertPayloads: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = {
      select: (...args: unknown[]) => { if (table === 'contact_notes') h.selectArgs.push(args); return q; },
      insert: (payload: Record<string, unknown>) => { h.insertPayloads.push(payload); return q; },
      eq: () => q,
      in: () => q,
      order: () => q,
      range: () => q,
      single: () => q,
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve({
        // Linha SEM `is_pinned`, como a tabela de produção antes da migration.
        data: table === 'contact_notes'
          ? [{ id: 'n1', contact_id: 'c1', author_id: 'a1', content: 'x', category: 'note', is_done: false, due_date: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }]
          : [],
        error: null,
      })),
    };
    return q;
  };
  return { supabase: { from: (t: string) => builder(t) } };
});

import { ContactService } from '../contact.service';

beforeEach(() => {
  h.selectArgs = [];
  h.insertPayloads = [];
});

describe('ContactService — notas toleram a ausência de contact_notes.is_pinned', () => {
  it('fetchNotes usa select("*"): nenhuma lista explícita de colunas força is_pinned', async () => {
    const notas = await ContactService.fetchNotes('c1');

    expect(h.selectArgs.length).toBeGreaterThan(0);
    for (const args of h.selectArgs) {
      expect(args[0]).toBe('*');
      expect(String(args[0])).not.toContain('is_pinned');
    }
    // A linha sem a coluna passa intacta (sem is_pinned inventado) e ganha autor placeholder.
    expect(notas).toHaveLength(1);
    expect(notas[0]).not.toHaveProperty('is_pinned');
    expect(notas[0].author.name).toBe('Usuário removido');
  });

  it('addNote sem isPinned NÃO envia is_pinned no insert', async () => {
    await ContactService.addNote('c1', 'a1', 'texto');

    expect(h.insertPayloads).toHaveLength(1);
    expect(h.insertPayloads[0]).toEqual({
      contact_id: 'c1', author_id: 'a1', content: 'texto', category: 'note', due_date: null,
    });
    expect(h.insertPayloads[0]).not.toHaveProperty('is_pinned');
  });

  it('addNote com isPinned:false também NÃO envia is_pinned (só true entra no payload)', async () => {
    await ContactService.addNote('c1', 'a1', 'texto', { isPinned: false });
    expect(h.insertPayloads[0]).not.toHaveProperty('is_pinned');
  });

  it('addNote com isPinned:true envia is_pinned: true (depois da migration)', async () => {
    await ContactService.addNote('c1', 'a1', 'texto', { isPinned: true });
    expect(h.insertPayloads[0]).toMatchObject({ is_pinned: true });
  });
});

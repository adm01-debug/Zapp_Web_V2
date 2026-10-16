/**
 * t_57b49f87: a tabela `contact_custom_fields` tem índice ÚNICO em (contact_id, field_name).
 * Sem `onConflict` o PostgREST resolve o conflito pela chave primária e reescrever um campo
 * com o mesmo nome devolve 23505 (o Salvar falhava no campo que já existia). E o delete
 * precisa devolver as linhas afetadas — com RLS bloqueando, o PostgREST apaga zero linhas
 * SEM erro e a tela diria "removido" sem nada ter saído.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const estado = vi.hoisted(() => ({
  upsertChamadas: [] as Array<{ payload: unknown; options: unknown }>,
  deleteSelectColunas: [] as string[],
  resultadoDelete: { data: null as unknown, error: null as unknown },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      upsert: (payload: unknown, options?: unknown) => {
        estado.upsertChamadas.push({ payload, options });
        return { then: (fn: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(fn) };
      },
      delete: () => ({
        eq: () => ({
          select: async (colunas: string) => {
            estado.deleteSelectColunas.push(colunas);
            return estado.resultadoDelete;
          },
        }),
      }),
    }),
  },
}));

import { ContactService } from '../contact.service';

describe('ContactService.upsertCustomField — conflito (contact_id, field_name)', () => {
  beforeEach(() => {
    estado.upsertChamadas.length = 0;
    estado.deleteSelectColunas.length = 0;
    estado.resultadoDelete = { data: null, error: null };
  });

  it('manda onConflict por (contact_id, field_name)', async () => {
    await ContactService.upsertCustomField({
      contact_id: 'c1',
      field_name: 'CPF',
      field_value: '123',
      field_type: 'text',
    });

    expect(estado.upsertChamadas).toHaveLength(1);
    expect(estado.upsertChamadas[0].options).toEqual({ onConflict: 'contact_id,field_name' });
  });

  it('preserva o payload do campo', async () => {
    const payload = { contact_id: 'c1', field_name: 'CPF', field_value: '999', field_type: 'text' };
    await ContactService.upsertCustomField(payload);

    expect(estado.upsertChamadas[0].payload).toEqual(payload);
  });
});

describe('ContactService.deleteCustomField — linhas afetadas', () => {
  beforeEach(() => {
    estado.deleteSelectColunas.length = 0;
    estado.resultadoDelete = { data: null, error: null };
  });

  it('pede de volta as linhas removidas (select)', async () => {
    estado.resultadoDelete = { data: [{ id: 'cf1' }], error: null };
    const res = await ContactService.deleteCustomField('cf1');

    expect(estado.deleteSelectColunas).toEqual(['id']);
    expect(res.data).toEqual([{ id: 'cf1' }]);
  });

  it('devolve lista vazia quando nada foi removido (RLS)', async () => {
    estado.resultadoDelete = { data: [], error: null };
    const res = await ContactService.deleteCustomField('cf1');

    expect(res.data).toEqual([]);
  });
});

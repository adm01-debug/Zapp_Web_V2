import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * Contrato TELA -> RPC da mesclagem (o "envio" que faltava provar).
 *
 * O teste irmão ContactMergeDialog.test.tsx cobre padrões/escolhas com o SERVICE
 * (`@/services/contact-merge.service`) SUBSTITUÍDO por um duplo, e por isso nunca
 * provou o que de fato sai para o banco. Aqui o service NÃO é mockado: o duplo é o
 * cliente Supabase, e o alvo da asserção é a chamada real
 * `supabase.rpc('merge_contacts_atomic', { p_primary_id, p_secondary_ids, p_merged_fields })`
 * — a única ponte entre as escolhas da tela e a RPC da migration 20261013051239.
 */
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

import { ContactMergeDialog } from '../ContactMergeDialog';
import { mergeContactsAtomic } from '@/services/contact-merge.service';

interface Overrides {
  id: string;
  name: string;
  surname?: string | null;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  job_title?: string | null;
  contact_type?: string | null;
  tags?: string[] | null;
}

function contact(o: Overrides) {
  return {
    id: o.id,
    name: o.name,
    surname: o.surname ?? null,
    phone: o.phone ?? '',
    email: o.email ?? null,
    company: o.company ?? null,
    job_title: o.job_title ?? null,
    contact_type: o.contact_type ?? null,
    tags: o.tags ?? null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('ContactMergeDialog -> RPC (envio real)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({
      data: { primary_id: 'a', merged_contacts: 1, already_merged: 0, moved_relations: 4 },
      error: null,
    });
  });

  it('mescla envia o nome exato da RPC e o payload das escolhas (só campos com valor, tags unidas)', async () => {
    const contacts = [
      contact({ id: 'a', name: 'Ana', phone: '11999990000', company: 'Empresa A', tags: ['vip'] }),
      contact({ id: 'b', name: 'Bia', phone: '11888880000', email: 'bia@exemplo.com', tags: ['lead', 'vip'] }),
    ];
    render(
      <ContactMergeDialog open onOpenChange={vi.fn()} contacts={contacts} onMergeComplete={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Mesclar 2/ }));

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(rpc).toHaveBeenCalledWith('merge_contacts_atomic', {
      p_primary_id: 'a',
      p_secondary_ids: ['b'],
      // name/phone/company do principal (padrão), email do secundário (só ele tem),
      // tags = união sem repetição. Campo vazio (surname/job_title/contact_type) NÃO vai.
      p_merged_fields: {
        name: 'Ana',
        phone: '11999990000',
        email: 'bia@exemplo.com',
        company: 'Empresa A',
        tags: ['vip', 'lead'],
      },
    });
  });

  it('campos undefined não são enviados ao RPC (a RPC recusa chave/chave vazia fora do contrato)', async () => {
    rpc.mockResolvedValue({ data: { primary_id: 'p1', merged_contacts: 1 }, error: null });

    await mergeContactsAtomic('p1', ['s1'], {
      email: 'escolhido@exemplo.com',
      company: undefined as unknown as string,
    });

    expect(rpc).toHaveBeenCalledWith('merge_contacts_atomic', {
      p_primary_id: 'p1',
      p_secondary_ids: ['s1'],
      p_merged_fields: { email: 'escolhido@exemplo.com' },
    });
    // A chave `company` (undefined) não pode nem existir no payload: `toEqual` ignora
    // propriedades undefined, então a prova é sobre as chaves REAIS enviadas.
    const enviado = (rpc.mock.calls[0][1] as { p_merged_fields: Record<string, unknown> }).p_merged_fields;
    expect(Object.keys(enviado)).toEqual(['email']);
    expect(JSON.stringify(enviado)).toBe('{"email":"escolhido@exemplo.com"}');
  });

  it('erro do RPC vira aviso na tela e a mesclagem NÃO é dada como concluída', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('crm_contact_link_conflict: vinculo duplicado') });
    const onMergeComplete = vi.fn();
    const onOpenChange = vi.fn();
    const contacts = [
      contact({ id: 'a', name: 'Ana', phone: '111' }),
      contact({ id: 'b', name: 'Bia', phone: '222' }),
    ];
    render(
      <ContactMergeDialog open onOpenChange={onOpenChange} contacts={contacts} onMergeComplete={onMergeComplete} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Mesclar 2/ }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(toast.error).toHaveBeenCalledWith('Há vínculos CRM conflitantes. Resolva-os antes de mesclar.');
    expect(onMergeComplete).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});

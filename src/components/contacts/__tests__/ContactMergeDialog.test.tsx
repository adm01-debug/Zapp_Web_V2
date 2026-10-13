import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * CT-096 — o diálogo de mesclagem inicializava os padrões com a lista VAZIA do
 * primeiro render (nenhum contato selecionado) e nunca recalculava. Resultado:
 * o campo que só o secundário tinha não aparecia (escondido por `values.length
 * > 1`) e a escolha do contato principal era implícita (sempre o primeiro),
 * vazando a seleção da mesclagem anterior. Estes testes provam o comportamento
 * fiel à tela.
 */
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const mergeContactsAtomic = vi.hoisted(() => vi.fn());
vi.mock('@/services/contact-merge.service', () => ({ mergeContactsAtomic }));

import { ContactMergeDialog } from '../ContactMergeDialog';

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
    phone: o.phone ?? null,
    email: o.email ?? null,
    company: o.company ?? null,
    job_title: o.job_title ?? null,
    contact_type: o.contact_type ?? null,
    tags: o.tags ?? null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('ContactMergeDialog — escolhas e padrões (CT-096)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mergeContactsAtomic.mockResolvedValue({ success: true });
  });

  it('campo que só o secundário tem aparece, já marcado, e é enviado na mesclagem', async () => {
    const contacts = [
      contact({ id: 'a', name: 'Ana', phone: '11999990000', email: null }),
      contact({ id: 'b', name: 'Bia', phone: '11888880000', email: 'bia@exemplo.com' }),
    ];
    render(
      <ContactMergeDialog open onOpenChange={vi.fn()} contacts={contacts} onMergeComplete={vi.fn()} />,
    );

    // O campo Email existe (só o secundário 'b' tem valor) e já vem marcado nele.
    expect(screen.getByText('Email')).toBeInTheDocument();
    const emailRadio = screen.getByRole('radio', { name: /bia@exemplo\.com/ });
    expect(emailRadio).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: /Mesclar 2/ }));

    await waitFor(() => expect(mergeContactsAtomic).toHaveBeenCalledTimes(1));
    const [primaryId, secondaryIds, merged] = mergeContactsAtomic.mock.calls[0];
    expect(primaryId).toBe('a');
    expect(secondaryIds).toEqual(['b']);
    expect(merged.email).toBe('bia@exemplo.com');
  });

  it('trocar o contato principal refaz os padrões dos campos para o novo principal', async () => {
    const contacts = [
      contact({ id: 'a', name: 'Ana', phone: '111' }),
      contact({ id: 'b', name: 'Bia', phone: '222' }),
    ];
    render(
      <ContactMergeDialog open onOpenChange={vi.fn()} contacts={contacts} onMergeComplete={vi.fn()} />,
    );

    // Padrão inicial: telefone do principal ('Ana' → opção 0).
    expect(document.getElementById('phone-0')).toBeChecked();

    fireEvent.click(document.getElementById('primary-b')!);

    // Agora 'Bia' é o principal e o padrão do telefone passa a ser a opção 1.
    await waitFor(() => expect(document.getElementById('phone-1')).toBeChecked());
    expect(document.getElementById('phone-0')).not.toBeChecked();
  });

  it('duas mesclagens seguidas não herdam o estado da anterior', async () => {
    const first = [
      contact({ id: 'a', name: 'Ana', company: 'Empresa A' }),
      contact({ id: 'b', name: 'Bia', company: 'Empresa B' }),
    ];
    const { rerender } = render(
      <ContactMergeDialog open onOpenChange={vi.fn()} contacts={first} onMergeComplete={vi.fn()} />,
    );

    // O usuário troca a escolha do campo Empresa para o secundário.
    fireEvent.click(screen.getByRole('radio', { name: /Empresa B/ }));
    await waitFor(() => expect(screen.getByRole('radio', { name: /Empresa B/ })).toBeChecked());

    fireEvent.click(screen.getByRole('button', { name: /Mesclar 2/ }));
    await waitFor(() => expect(mergeContactsAtomic).toHaveBeenCalledTimes(1));
    expect(mergeContactsAtomic.mock.calls[0][2].company).toBe('Empresa B');

    // Fecha e reabre com OUTROS contatos: nada da mesclagem anterior pode sobrar.
    rerender(
      <ContactMergeDialog open={false} onOpenChange={vi.fn()} contacts={first} onMergeComplete={vi.fn()} />,
    );
    const second = [
      contact({ id: 'c', name: 'Caio', company: 'Empresa C' }),
      contact({ id: 'd', name: 'Dora', company: 'Empresa D' }),
    ];
    rerender(
      <ContactMergeDialog open onOpenChange={vi.fn()} contacts={second} onMergeComplete={vi.fn()} />,
    );

    expect(screen.getByRole('radio', { name: /Empresa C/ })).toBeChecked();
    expect(screen.queryByRole('radio', { name: /Empresa B/ })).not.toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import type { Contact } from '../useContactsCRUD';

/**
 * ZD-094..096 (Fase K) — os diálogos de cadastro, edição e exclusão passam a
 * usar a casca do design: 620px de largura, raio 17px, header com contexto
 * "Contatos / …" e título Outfit 26px. O `ContactForm` continua o mesmo
 * componente (validação, endereço, CEP) — aqui se prova só a casca e o gate
 * de exclusão, sem tocar nas regras de negócio.
 */

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('../ContactForm', () => ({
  ContactForm: ({ submitLabel }: { submitLabel: string }) => (
    <div data-form-stub="" role="form" aria-label="Formulário de contato">
      <button type="button">{submitLabel}</button>
    </div>
  ),
}));

import { ContactDialogs } from '../ContactDialogs';
import { TooltipProvider } from '@/components/ui/tooltip';

const alvo = { id: 'c1', name: 'Fulano de Tal' } as unknown as Contact;

function Harness({ modo }: { modo: 'add' | 'edit' | 'delete' }) {
  const [add, setAdd] = useState(modo === 'add');
  const [edit, setEdit] = useState(modo === 'edit');
  const [del, setDel] = useState<Contact | null>(modo === 'delete' ? alvo : null);
  const [sucesso, setSucesso] = useState<{ name: string; protocol: string } | null>(null);

  return (
    <TooltipProvider>
    <ContactDialogs
      isAddDialogOpen={add}
      setIsAddDialogOpen={setAdd}
      newContact={{ name: '', phone: '' }}
      handleNewContactChange={() => {}}
      handleAddContact={() => {}}
      handleCancelForm={() => { setAdd(false); setEdit(false); }}
      isSubmitting={false}
      isEditDialogOpen={edit}
      setIsEditDialogOpen={setEdit}
      editingContact={modo === 'edit' ? alvo : null}
      handleEditContactChange={() => {}}
      handleEditContact={() => {}}
      showSuccess={sucesso}
      setShowSuccess={setSucesso}
      deleteTarget={del}
      setDeleteTarget={setDel}
      handleDeleteContact={() => {}}
    />
    </TooltipProvider>
  );
}

describe('Fase K — diálogos do redesign', () => {
  it('cadastro abre com contexto, título do design e o formulário completo', () => {
    render(<Harness modo="add" />);

    const dialogo = screen.getByRole('dialog');
    expect(dialogo.className).toContain('max-w-[620px]');
    expect(dialogo.className).toContain('rounded-[17px]');
    expect(within(dialogo).getByText('Contatos / Cadastro')).toBeInTheDocument();
    expect(within(dialogo).getByRole('heading', { name: 'Adicionar Contato' })).toBeInTheDocument();
    expect(within(dialogo).getByRole('form', { name: 'Formulário de contato' })).toBeInTheDocument();
    expect(within(dialogo).getByRole('button', { name: 'Adicionar' })).toBeInTheDocument();
  });

  it('edição usa o mesmo molde e mantém o rótulo "Editar Contato"', () => {
    render(<Harness modo="edit" />);

    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByText('Contatos / Edição')).toBeInTheDocument();
    expect(within(dialogo).getByRole('heading', { name: 'Editar Contato' })).toBeInTheDocument();
    expect(within(dialogo).getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
  });

  it('exclusão nomeia o contato e exige confirmação explícita', () => {
    render(<Harness modo="delete" />);

    const dialogo = screen.getByRole('alertdialog');
    expect(within(dialogo).getByText('Excluir contato')).toBeInTheDocument();
    expect(dialogo).toHaveTextContent('Fulano de Tal');
    expect(dialogo).toHaveTextContent(/não pode ser desfeita/i);
    // Os dois caminhos continuam: cancelar não exclui, confirmar exclui.
    expect(within(dialogo).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(within(dialogo).getByRole('button', { name: /Excluir/ })).toBeInTheDocument();
  });
});
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/hooks/crm/useExternalCargos', () => ({ useExternalCargos: () => ({ data: [] }) }));
vi.mock('@/hooks/crm/useExternalEmpresas', () => ({ useExternalEmpresas: () => ({ data: [] }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) } }));

import { ContactForm } from '../ContactForm';

const base = { name: 'Fulano', phone: '5511999999999' };

function renderForm(values: Record<string, unknown> = {}, onChange = vi.fn()) {
  render(
    <ContactForm
      values={{ ...base, ...values }}
      onChange={onChange}
      onSubmit={vi.fn()}
      onCancel={vi.fn()}
      submitLabel="Salvar"
    />,
  );
  return onChange;
}

describe('ContactForm — endereço', () => {
  it('mostra os seis campos de endereço', () => {
    renderForm();
    for (const label of ['CEP', 'Logradouro', 'Número', 'Bairro', 'Cidade', 'UF']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it('CEP é guardado só com dígitos e exibido com máscara', () => {
    const onChange = renderForm({ postal_code: '01310100' });
    expect((screen.getByLabelText('CEP') as HTMLInputElement).value).toBe('01310-100');

    fireEvent.change(screen.getByLabelText('CEP'), { target: { value: '04567-890' } });
    expect(onChange).toHaveBeenCalledWith('postal_code', '04567890');
  });

  it('CEP ignora letras e para em 8 dígitos', () => {
    const onChange = renderForm();
    fireEvent.change(screen.getByLabelText('CEP'), { target: { value: 'ab012345678999' } });
    expect(onChange).toHaveBeenCalledWith('postal_code', '01234567');
  });

  it('UF vira maiúscula e aceita no máximo 2 letras', () => {
    const onChange = renderForm();
    fireEvent.change(screen.getByLabelText('UF'), { target: { value: 'spx' } });
    expect(onChange).toHaveBeenCalledWith('state', 'SP');
  });

  it('endereço já salvo aparece preenchido', () => {
    renderForm({ address: 'Av. Paulista', address_number: '1000', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP' });
    expect((screen.getByLabelText('Logradouro') as HTMLInputElement).value).toBe('Av. Paulista');
    expect((screen.getByLabelText('Número') as HTMLInputElement).value).toBe('1000');
    expect((screen.getByLabelText('Bairro') as HTMLInputElement).value).toBe('Bela Vista');
    expect((screen.getByLabelText('Cidade') as HTMLInputElement).value).toBe('São Paulo');
    expect((screen.getByLabelText('UF') as HTMLInputElement).value).toBe('SP');
  });
});

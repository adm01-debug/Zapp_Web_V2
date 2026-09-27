import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/hooks/crm/useExternalCargos', () => ({ useExternalCargos: () => ({ data: [] }) }));
vi.mock('@/hooks/crm/useExternalEmpresas', () => ({ useExternalEmpresas: () => ({ data: [] }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) } }));

const h = vi.hoisted(() => ({ select: vi.fn(), suggestions: [] as unknown[] }));
vi.mock('@/components/inbox/location-picker/useAddressAutocomplete', () => ({
  useAddressAutocomplete: () => ({
    query: '',
    setQuery: vi.fn(),
    suggestions: h.suggestions,
    isLoading: false,
    error: null,
    highlightedIndex: -1,
    retrievingId: null,
    select: h.select,
    onKeyDown: vi.fn(),
    clear: vi.fn(),
  }),
}));

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

describe('ContactForm — autocomplete de endereço (E41)', () => {
  beforeEach(() => {
    h.select.mockReset();
    h.suggestions = [
      { id: 's1', name: 'Avenida Paulista', address: 'Avenida Paulista, São Paulo - SP, Brasil', kind: 'street' },
    ];
  });

  it('escolher uma sugestão preenche logradouro, número, bairro, cidade, UF, CEP e coordenada — e o campo continua editável', async () => {
    h.select.mockResolvedValue({
      lat: -23.561300,
      lng: -46.656500,
      name: 'Avenida Paulista',
      address: 'Avenida Paulista, São Paulo - SP, 01310-100, Brasil',
      components: {
        postalCode: '01310100',
        street: 'Avenida Paulista',
        addressNumber: '1000',
        neighborhood: 'Bela Vista',
        city: 'São Paulo',
        stateCode: 'SP',
      },
    });
    const onChange = renderForm();

    fireEvent.focus(screen.getByLabelText('Logradouro'));
    fireEvent.click(screen.getByRole('option', { name: /Avenida Paulista/ }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('latitude', '-23.5613'));
    expect(onChange).toHaveBeenCalledWith('address', 'Avenida Paulista');
    expect(onChange).toHaveBeenCalledWith('address_number', '1000');
    expect(onChange).toHaveBeenCalledWith('neighborhood', 'Bela Vista');
    expect(onChange).toHaveBeenCalledWith('city', 'São Paulo');
    expect(onChange).toHaveBeenCalledWith('state', 'SP');
    expect(onChange).toHaveBeenCalledWith('postal_code', '01310100');
    expect(onChange).toHaveBeenCalledWith('longitude', '-46.6565');

    // Nada trava: o campo continua um input normal, editável depois do preenchimento.
    const addressInput = screen.getByLabelText('Logradouro') as HTMLInputElement;
    fireEvent.change(addressInput, { target: { value: 'Avenida Paulista, 1001' } });
    expect(onChange).toHaveBeenCalledWith('address', 'Avenida Paulista, 1001');
  });

  it('sugestão sem componentes estruturados não preenche os campos derivados, só endereço e coordenada', async () => {
    h.select.mockResolvedValue({ lat: -23.5, lng: -46.6, name: 'Avenida Paulista', address: 'Avenida Paulista' });
    const onChange = renderForm();

    fireEvent.focus(screen.getByLabelText('Logradouro'));
    fireEvent.click(screen.getByRole('option', { name: /Avenida Paulista/ }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('latitude', '-23.5'));
    expect(onChange).toHaveBeenCalledWith('address', 'Avenida Paulista');
    expect(onChange).not.toHaveBeenCalledWith('neighborhood', expect.anything());
    expect(onChange).not.toHaveBeenCalledWith('postal_code', expect.anything());
  });
});

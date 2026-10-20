import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('@/hooks/crm/useExternalCargos', () => ({ useExternalCargos: () => ({ data: [] }) }));
vi.mock('@/hooks/crm/useExternalEmpresas', () => ({ useExternalEmpresas: () => ({ data: [] }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) } }));

const h = vi.hoisted(() => ({
  // O teste controla QUANDO a resposta do `/forward` chega — é a corrida do #263.
  searchPlaces: vi.fn(),
  getMapboxToken: vi.fn().mockResolvedValue('tok'),
  // Autocomplete (mesma tela): outra fonte de coordenada que pode chegar durante a busca.
  select: vi.fn(),
  suggestions: [] as unknown[],
}));

vi.mock('@/lib/mapboxGeocode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/mapboxGeocode')>();
  return { ...actual, searchPlaces: (...args: unknown[]) => h.searchPlaces(...args) };
});
vi.mock('@/lib/mapboxToken', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/mapboxToken')>();
  return { ...actual, getMapboxToken: (...args: unknown[]) => h.getMapboxToken(...args) };
});
vi.mock('@/components/inbox/location-picker/useAddressAutocomplete', () => ({
  useAddressAutocomplete: () => ({
    query: '', setQuery: vi.fn(), suggestions: h.suggestions, isLoading: false, error: null,
    highlightedIndex: -1, retrievingId: null, select: h.select, onKeyDown: vi.fn(), clear: vi.fn(),
    retrySuggest: vi.fn(), blocked: null, status: h.suggestions.length > 0 ? 'ok' : 'idle',
    pausedUntil: null, retrieveError: null,
  }),
}));

import { ContactForm, type ContactFormValues } from '../ContactForm';

/**
 * #263 / R2-AUTH-039 — "Recálculo atrasado grava coordenadas do endereço anterior e apaga o aviso
 * de desatualização".
 *
 * Pré-condição do achado: o formulário tem coordenada anterior; o operador reescreve o endereço
 * para B e aciona "Recalcular"; antes da resposta ele muda o endereço para C. A resposta de B
 * chegava depois e era gravada como se fosse de C, apagando o aviso de desatualização.
 *
 * O `ContactForm` é controlado pelo pai, como no uso real (`handleEditContactChange` do
 * `useContactsCRUD`, consumido pelo `ContactDialogs`): por isso o teste NÃO usa um `onChange` que
 * só grava chamadas — usa um pai com estado que aplica cada mudança, que é o que faz o endereço
 * vigente divergir do endereço consultado durante a busca.
 */
function FormControlado({ inicial, onFieldChange }: {
  inicial: ContactFormValues;
  onFieldChange?: (field: string, value: string) => void;
}) {
  const [values, setValues] = useState<ContactFormValues>(inicial);
  return (
    <ContactForm
      values={values}
      onChange={(field, value) => {
        onFieldChange?.(field, value);
        setValues((prev) => ({ ...prev, [field]: value }));
      }}
      onSubmit={vi.fn()}
      onCancel={vi.fn()}
      submitLabel="Salvar"
    />
  );
}

/** Promise resolvida pelo teste, para segurar a resposta do geocoding até depois da edição. */
function promessaControlada<T>() {
  let resolver!: (valor: T) => void;
  const promise = new Promise<T>((res) => { resolver = res; });
  return { promise, resolver };
}

const AVISO = /localização \(coordenada\) continua a anterior/i;
const base: ContactFormValues = {
  name: 'Fulano',
  phone: '5511999999999',
  address: 'Rua B',
  address_number: '100',
  neighborhood: 'Centro',
  city: 'São Paulo',
  state: 'SP',
  latitude: '-23.5613',
  longitude: '-46.6565',
};

const acharRecalcular = () => screen.getByRole('button', { name: 'Recalcular' });

beforeEach(() => {
  h.searchPlaces.mockReset();
  h.getMapboxToken.mockReset().mockResolvedValue('tok');
  h.select.mockReset();
  h.suggestions = [];
});

describe('ContactForm — resposta atrasada do recálculo (#263)', () => {
  it('não grava a coordenada do endereço anterior nem apaga o aviso quando o endereço mudou durante a busca', async () => {
    const busca = promessaControlada<{ ok: true; places: unknown[] }>();
    h.searchPlaces.mockReturnValue(busca.promise);
    const onFieldChange = vi.fn();

    render(<FormControlado inicial={{ ...base }} onFieldChange={onFieldChange} />);

    // Endereço reescrito à mão → a coordenada pode estar velha → aviso + botão.
    fireEvent.change(screen.getByLabelText('Bairro'), { target: { value: 'Vila Nova' } });
    expect(screen.getByText(AVISO)).toBeInTheDocument();

    // B está no formulário quando a busca começa; ela fica pendente.
    fireEvent.click(acharRecalcular());
    await waitFor(() => expect(h.searchPlaces).toHaveBeenCalledTimes(1));
    expect(String(h.searchPlaces.mock.calls[0][0])).toContain('Rua B');

    // C: o operador continua editando antes de a resposta de B chegar.
    fireEvent.change(screen.getByLabelText('Logradouro'), { target: { value: 'Rua C' } });

    // ... e agora a resposta de B chega.
    await act(async () => {
      busca.resolver({ ok: true, places: [{ name: 'Rua B', address: 'Rua B, 100', lat: -23.6, lng: -46.7 }] });
    });

    // A coordenada de B não entra no formulário (não é apresentada nem vira o que o salvar grava)...
    expect(onFieldChange).not.toHaveBeenCalledWith('latitude', expect.anything());
    expect(onFieldChange).not.toHaveBeenCalledWith('longitude', expect.anything());
    // ...o que o operador digitou (C) continua na tela...
    expect((screen.getByLabelText('Logradouro') as HTMLInputElement).value).toBe('Rua C');
    // ...e o aviso de desatualização CONTINUA de pé.
    expect(screen.getByText(AVISO)).toBeInTheDocument();
    expect(acharRecalcular()).toBeInTheDocument();
  });

  it('endereço inalterado durante a busca: a coordenada é gravada e o aviso sai (sem regressão)', async () => {
    h.searchPlaces.mockResolvedValue({
      ok: true,
      places: [{ name: 'Rua C', address: 'Rua C, 200', lat: -22.9, lng: -43.2 }],
    });
    const onFieldChange = vi.fn();

    render(<FormControlado inicial={{ ...base }} onFieldChange={onFieldChange} />);

    fireEvent.change(screen.getByLabelText('Bairro'), { target: { value: 'Vila Nova' } });
    expect(screen.getByText(AVISO)).toBeInTheDocument();

    fireEvent.click(acharRecalcular());

    await waitFor(() => expect(onFieldChange).toHaveBeenCalledWith('latitude', '-22.9'));
    expect(onFieldChange).toHaveBeenCalledWith('longitude', '-43.2');
    await waitFor(() => expect(screen.queryByText(AVISO)).not.toBeInTheDocument());
  });

  it('sugestão do autocomplete escolhida durante a busca: a resposta atrasada não sobrescreve a coordenada nova', async () => {
    const busca = promessaControlada<{ ok: true; places: unknown[] }>();
    h.searchPlaces.mockReturnValue(busca.promise);
    h.suggestions = [{ id: 's1', name: 'Rua D', address: 'Rua D, 5, Rio de Janeiro', kind: 'address' }];
    h.select.mockResolvedValue({
      lat: -22.1, lng: -43.1, name: 'Rua D', address: 'Rua D, 5, Rio de Janeiro',
      components: { street: 'Rua D', addressNumber: '5', city: 'Rio de Janeiro', stateCode: 'RJ' },
    });
    const onFieldChange = vi.fn();

    render(<FormControlado inicial={{ ...base }} onFieldChange={onFieldChange} />);

    fireEvent.change(screen.getByLabelText('Bairro'), { target: { value: 'Vila Nova' } });
    fireEvent.click(acharRecalcular());
    await waitFor(() => expect(h.searchPlaces).toHaveBeenCalledTimes(1));

    // Com a busca de B ainda pendente, o operador escolhe outra sugestão (coordenada D na tela).
    fireEvent.focus(screen.getByLabelText('Logradouro'));
    fireEvent.click(screen.getByRole('option', { name: /Rua D/ }));
    await waitFor(() => expect(onFieldChange).toHaveBeenCalledWith('latitude', '-22.1'));

    await act(async () => {
      busca.resolver({ ok: true, places: [{ name: 'Rua B', address: 'Rua B, 100', lat: -23.6, lng: -46.7 }] });
    });

    expect(onFieldChange).not.toHaveBeenCalledWith('latitude', '-23.6');
    expect(onFieldChange).toHaveBeenLastCalledWith('longitude', '-43.1');
  });
});

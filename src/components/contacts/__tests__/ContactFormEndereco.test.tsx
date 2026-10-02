import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/hooks/crm/useExternalCargos', () => ({ useExternalCargos: () => ({ data: [] }) }));
vi.mock('@/hooks/crm/useExternalEmpresas', () => ({ useExternalEmpresas: () => ({ data: [] }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) } }));

const h = vi.hoisted(() => ({
  select: vi.fn(),
  suggestions: [] as unknown[],
  retrySuggest: vi.fn(),
  error: null as string | null,
  // Padrões que devolvem PROMISE: o form chama `getMapboxToken().then(...)` e `searchPlaces(...)`
  // em outros fluxos, então um mock que devolve `undefined` derruba o arquivo inteiro.
  searchPlaces: vi.fn().mockResolvedValue({ ok: true, places: [] }),
  getMapboxToken: vi.fn().mockResolvedValue('tok'),
}));
vi.mock('@/lib/mapboxGeocode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/mapboxGeocode')>();
  // E40: o botão "Recalcular" chama o `/forward` — o teste controla a resposta.
  return { ...actual, searchPlaces: (...args: unknown[]) => h.searchPlaces(...args) };
});
vi.mock('@/lib/mapboxToken', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/mapboxToken')>();
  return { ...actual, getMapboxToken: (...args: unknown[]) => h.getMapboxToken(...args) };
});
vi.mock('@/components/inbox/location-picker/useAddressAutocomplete', () => ({
  useAddressAutocomplete: () => ({
    query: '',
    setQuery: vi.fn(),
    suggestions: h.suggestions,
    isLoading: false,
    error: h.error,
    highlightedIndex: -1,
    retrievingId: null,
    select: h.select,
    onKeyDown: vi.fn(),
    clear: vi.fn(),
    // F2/E13/E14: o cadastro usa o mesmo retry real do picker.
    retrySuggest: h.retrySuggest,
    blocked: null,
    // F3/E23: a lista rende pelo `status` — aqui ele segue os dados do mock, como o hook real.
    status: (h.error ? 'error' : h.suggestions.length > 0 ? 'ok' : 'idle') as SearchStatus,
    pausedUntil: null,
    retrieveError: null,
  }),
}));

import { ContactForm } from '../ContactForm';
import type { SearchStatus } from '@/components/inbox/location-picker/useAddressAutocomplete';

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

  it('E58 (2º consumidor): o combobox de endereço do cadastro não tem violação de acessibilidade (axe)', async () => {
    h.suggestions = [
      { id: 's1', name: 'Rua A, 1', address: 'Rua A, 1, São Paulo', kind: 'street' },
      { id: 's2', name: 'Rua B, 2', address: 'Rua B, 2, São Paulo', kind: 'address' },
      { id: 's3', name: 'Rua C, 3', address: 'Rua C, 3, São Paulo', kind: 'poi' },
    ];
    renderForm();
    fireEvent.focus(screen.getByLabelText('Logradouro'));
    expect(screen.getAllByRole('option').length).toBe(3);
    // jsdom não calcula contraste (o axe não tem layout real) — fora da varredura, declarado.
    const axe = (await import('axe-core')).default;
    const r = await axe.run(document.body, {
      rules: { region: { enabled: false }, 'color-contrast': { enabled: false } },
    });
    expect(r.violations.map((v) => `${v.id} (${v.nodes.length} nó(s)): ${v.help}`)).toEqual([]);
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

  // F2/E14: o cadastro tinha o mesmo botão inerte do picker (setQuery com o mesmo valor).
  it('E14: "Tentar novamente" no cadastro chama retrySuggest (retry real)', () => {
    // `h.suggestions` é estado compartilhado entre os testes do arquivo: sem zerar, a condição
    // `suggestions.length === 0` do aviso de falha não vale e o botão nem aparece.
    const anteriores = h.suggestions;
    h.suggestions = [];
    h.error = 'network';
    try {
      h.retrySuggest.mockClear();
      renderForm();
      fireEvent.focus(screen.getByLabelText('Logradouro'));

      fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

      expect(h.retrySuggest).toHaveBeenCalledTimes(1);
    } finally {
      h.suggestions = anteriores;
      h.error = null;
    }
  });
});

/**
 * Item 5 (decisão 20260930-122408-sem-tarefa, opção a) — regra 3: o endereço foi reescrito à mão
 * e a coordenada continua a MESMA → o pino pode estar no lugar velho. Aviso discreto, e nada é
 * apagado nem reescrito sozinho.
 */
describe('ContactForm — coordenada possivelmente desatualizada (item 5, regra 3)', () => {
  const AVISO = /localização \(coordenada\) continua a anterior/i;
  const comCoordenada = { address: 'Av. Paulista', latitude: '-23.5613', longitude: '-46.6565' };

  beforeEach(() => {
    // E40: isolamento do botão "Recalcular" — limpa chamadas sem apagar os padrões que devolvem
    // Promise (um `mockReset` aqui deixaria `getMapboxToken()` devolvendo `undefined`).
    h.searchPlaces.mockClear();
    h.getMapboxToken.mockClear();
  });

  it('E40: "Recalcular" faz 1 /forward pelo endereço do formulário e atualiza a coordenada', async () => {
    h.getMapboxToken.mockResolvedValue('tok');
    h.searchPlaces.mockResolvedValue({
      ok: true,
      places: [{ name: 'Rua Nova', address: 'Rua Nova, 100 - São Paulo', lat: -23.6, lng: -46.7 }],
    });
    const onChange = renderForm({
      address: 'Rua Nova',
      address_number: '100',
      city: 'São Paulo',
      state: 'SP',
      latitude: '-23.5613',
      longitude: '-46.6565',
    });

    // O form é CONTROLADO pelo pai: `fireEvent.change` dispara o onChange mas não muda `values`,
    // então o aviso é provocado por um campo de endereço e o texto vem dos values do teste.
    fireEvent.change(screen.getByLabelText('Bairro'), { target: { value: 'Bela Vista' } });
    expect(screen.getByText(AVISO)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /recalcular/i }));

    await waitFor(() => expect(h.searchPlaces).toHaveBeenCalledTimes(1));
    // UMA busca, e com o endereço composto do formulário — não com o texto do autocomplete.
    const consulta = String(h.searchPlaces.mock.calls[0][0]);
    expect(consulta).toContain('Rua Nova');
    expect(consulta).toContain('São Paulo');

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('latitude', '-23.6');
      expect(onChange).toHaveBeenCalledWith('longitude', '-46.7');
    });
    // coordenada nova em mãos: o aviso sai de cena
    await waitFor(() => expect(screen.queryByText(AVISO)).not.toBeInTheDocument());
  });

  it('E40: quando o /forward não acha nada, o aviso CONTINUA (não apaga a coordenada antiga)', async () => {
    h.getMapboxToken.mockResolvedValue('tok');
    h.searchPlaces.mockResolvedValue({ ok: true, places: [] });
    const onChange = renderForm(comCoordenada);

    fireEvent.change(screen.getByLabelText('Logradouro'), { target: { value: 'Rua Nova' } });
    fireEvent.click(screen.getByRole('button', { name: /recalcular/i }));

    await waitFor(() => expect(h.searchPlaces).toHaveBeenCalledTimes(1));
    expect(screen.getByText(AVISO)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalledWith('latitude', expect.anything());
    expect(onChange).not.toHaveBeenCalledWith('longitude', expect.anything());
  });

  it('reescrever o endereço à mão com coordenada já gravada mostra o aviso', () => {
    renderForm(comCoordenada);
    expect(screen.queryByText(AVISO)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Logradouro'), { target: { value: 'Rua Nova' } });

    expect(screen.getByText(AVISO)).toBeInTheDocument();
  });

  it('sem coordenada nenhuma, mexer no endereço NÃO mostra o aviso', () => {
    renderForm({ address: 'Av. Paulista' });

    fireEvent.change(screen.getByLabelText('Logradouro'), { target: { value: 'Rua Nova' } });

    expect(screen.queryByText(AVISO)).not.toBeInTheDocument();
  });

  it('editar outro campo de endereço (cidade) também sinaliza', () => {
    renderForm({ city: 'São Paulo', latitude: '-23.5', longitude: '-46.6' });

    fireEvent.change(screen.getByLabelText('Cidade'), { target: { value: 'Campinas' } });

    expect(screen.getByText(AVISO)).toBeInTheDocument();
  });

  it('editar um campo que NÃO é de endereço (nome) não sinaliza', () => {
    renderForm({ latitude: '-23.5', longitude: '-46.6' });

    fireEvent.change(screen.getByLabelText(/Nome Principal/), { target: { value: 'Beltrano' } });

    expect(screen.queryByText(AVISO)).not.toBeInTheDocument();
  });

  it('escolher uma sugestão do autocomplete LIMPA o aviso (a coordenada nova acompanha — regra 2)', async () => {
    h.select.mockResolvedValue({ lat: -22.9, lng: -43.2, name: 'Rua X', address: 'Rua X' });
    const anteriores = h.suggestions;
    h.suggestions = [{ id: 's1', name: 'Rua X', address: 'Rua X', kind: 'street' }];
    try {
      renderForm(comCoordenada);
      fireEvent.change(screen.getByLabelText('Logradouro'), { target: { value: 'Rua X' } });
      expect(screen.getByText(AVISO)).toBeInTheDocument();

      fireEvent.focus(screen.getByLabelText('Logradouro'));
      fireEvent.click(screen.getByRole('option', { name: /Rua X/ }));

      await waitFor(() => expect(screen.queryByText(AVISO)).not.toBeInTheDocument());
    } finally {
      h.suggestions = anteriores;
    }
  });
});

/**
 * W1 — sondas independentes dos achados:
 *   A4-B  (§4)  ContactForm ignora a flag `mapa.searchbox-autocomplete`
 *   A4-D  (§7)  2o editor de contato abre com endereco VAZIO
 *
 * O hook `useAddressAutocomplete` aqui e o REAL (nao mockado): so o transporte
 * (mapboxGeocode), a sessao/telemetria e o token sao observados por baixo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { appendFileSync } from 'node:fs';
import type { ReactNode } from 'react';

const EVIDENCE = '/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/auditoria-onda2-2609291646adae/W1-probes/W1-achado4-7.evidence.jsonl';
function record(tag: string, data: unknown) {
  appendFileSync(EVIDENCE, JSON.stringify({ tag, data }) + '\n');
}

const h = vi.hoisted(() => ({
  suggest: vi.fn(),
  retrieve: vi.fn(),
  forward: vi.fn(),
  logAudit: vi.fn(),
  flag: vi.fn(),
  budgetOk: vi.fn(),
  update: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/hooks/system/useFeatureFlag', () => ({ useFeatureFlag: (...a: unknown[]) => h.flag(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => h.logAudit(...a) }));
vi.mock('@/lib/mapboxCostGuard', () => ({ isSearchBudgetOk: () => h.budgetOk(), MONTHLY_SESSION_LIMIT: 450 }));
vi.mock('@/lib/mapboxToken', () => ({
  getMapboxToken: vi.fn(async () => 'tok'),
  reportMapboxFailure: vi.fn(),
  MAPBOX_TOKEN_TIMEOUT_MS: 8000,
  MAPBOX_MAP_LOAD_TIMEOUT_MS: 20000,
}));
vi.mock('@/lib/mapboxGeocode', () => ({
  suggestPlaces: (...a: unknown[]) => h.suggest(...a),
  retrievePlaceResult: (...a: unknown[]) => h.retrieve(...a),
  searchPlaces: (...a: unknown[]) => h.forward(...a),
  clearSuggestCacheForSession: vi.fn(),
  SEARCH_RESULT_LIMIT: 5,
}));
vi.mock('@/hooks/crm/useExternalCargos', () => ({ useExternalCargos: () => ({ data: [] }) }));
vi.mock('@/hooks/crm/useExternalEmpresas', () => ({ useExternalEmpresas: () => ({ data: [] }) }));
vi.mock('sonner', () => ({
  toast: { error: (...a: unknown[]) => h.toastError(...a), success: (...a: unknown[]) => h.toastSuccess(...a) },
  Toaster: () => null,
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
      update: (payload: unknown) => ({ eq: async () => { h.update(payload); return { error: null }; } }),
    }),
  },
}));

import { ContactForm } from '@/components/contacts/ContactForm';
import { EditContactDialog } from '@/components/inbox/contact-details/EditContactDialog';

const SUGGESTION = [{ id: 'sg-1', name: 'Avenida Paulista', address: 'Avenida Paulista, SP', kind: 'street' as const }];

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  h.flag.mockReturnValue(false); // flag `mapa.searchbox-autocomplete` DESLIGADA
  h.budgetOk.mockReturnValue(true);
  h.suggest.mockResolvedValue({ ok: true, suggestions: SUGGESTION });
});

describe('W1 · A4-B ContactForm com a flag desligada', () => {
  it('flag=false: o /suggest continua disparando no cadastro?', async () => {
    const onChange = vi.fn();
    wrap(
      <ContactForm
        values={{ name: 'Fulano', phone: '5511999999999' }}
        onChange={onChange}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        submitLabel="Salvar"
      />,
    );

    // Deixa o getMapboxToken resolver e o hook ser habilitado.
    await act(async () => { await Promise.resolve(); });

    const input = screen.getByLabelText('Logradouro');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'avenida paulista' } });

    await waitFor(() => expect(h.suggest).toHaveBeenCalledTimes(1), { timeout: 4000 });

    const evidencia = {
      flagRetornoParaMapaSearchbox: h.flag.mock.calls.map((c) => c[0]),
      flagFoiConsultadaAlgumaVez: h.flag.mock.calls.length,
      suggestDisparadoComFlagDesligada: h.suggest.mock.calls.length,
      argumentoDaBusca: h.suggest.mock.calls[0]?.[0],
      listaDeSugestoesRenderizada: !!screen.queryByRole('option', { name: /Avenida Paulista/ }),
    };
    record('A4-B', evidencia);
    expect(evidencia.flagFoiConsultadaAlgumaVez).toBe(0);
    expect(evidencia.suggestDisparadoComFlagDesligada).toBe(1);
  });
});

describe('W1 · A4-D EditContactDialog pelo 2o caller', () => {
  const contactShapedComoContactDetails = {
    id: 'c-1',
    name: 'Fulano de Tal',
    phone: '5511999999999',
    nickname: 'Fula',
    surname: 'de Tal',
    job_title: 'Diretor',
    company: 'XBZ Brindes',
    contact_type: 'cliente',
  };
  const contactShapedComoCrm360 = {
    id: 'c-1', name: 'Fulano de Tal', phone: '5511999999999',
    nickname: 'Fula', job_title: 'Diretor', company: 'XBZ Brindes', contact_type: 'cliente',
  };

  it('as props exatas dos dois callers abrem o form com o endereco cheio?', async () => {
    for (const [nome, contact] of [
      ['ContactDetails', contactShapedComoContactDetails],
      ['Crm360Tab', contactShapedComoCrm360],
    ] as const) {
      cleanup();
      wrap(<EditContactDialog open onOpenChange={vi.fn()} contact={contact} />);
      const valores = {
        Logradouro: (screen.getByLabelText('Logradouro') as HTMLInputElement).value,
        Numero: (screen.getByLabelText('Número') as HTMLInputElement).value,
        Bairro: (screen.getByLabelText('Bairro') as HTMLInputElement).value,
        Cidade: (screen.getByLabelText('Cidade') as HTMLInputElement).value,
        UF: (screen.getByLabelText('UF') as HTMLInputElement).value,
        CEP: (screen.getByLabelText('CEP') as HTMLInputElement).value,
      };
      record('A4-D', { caller: nome, valores });
    }
    cleanup();
  });

  it('contraste: com as colunas de endereco (1o caller do ContactList) o form abre preenchido', async () => {
    wrap(
      <EditContactDialog
        open
        onOpenChange={vi.fn()}
        contact={{
          ...contactShapedComoContactDetails,
          address: 'Av. Paulista', address_number: '1000', neighborhood: 'Bela Vista',
          city: 'São Paulo', state: 'SP', postal_code: '01310100',
        }}
      />,
    );
    record('A4-D-contraste', {
      Logradouro: (screen.getByLabelText('Logradouro') as HTMLInputElement).value,
      Cidade: (screen.getByLabelText('Cidade') as HTMLInputElement).value,
    });
    cleanup();
  });

  it('o UPDATE do 2o editor apaga o endereco que o form nem mostrou?', async () => {
    wrap(<EditContactDialog open onOpenChange={vi.fn()} contact={contactShapedComoContactDetails} />);
    // Operador so mexe no nome (nao toca em nenhum campo de endereco).
    fireEvent.change(screen.getByPlaceholderText('Nome do contato'), { target: { value: 'Fulano de Tal Jr' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    });
    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1), { timeout: 4000 });
    const payload = h.update.mock.calls[0]?.[0] as Record<string, unknown>;
    record('A4-D-payload', {
      payload,
      tocaEmEndereco: Object.keys(payload).filter((k) =>
        ['address', 'address_number', 'neighborhood', 'city', 'state', 'postal_code', 'latitude', 'longitude'].includes(k),
      ),
    });
    cleanup();
  });
});

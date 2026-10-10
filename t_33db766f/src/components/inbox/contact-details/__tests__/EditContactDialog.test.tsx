import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import { EditContactDialog } from '../EditContactDialog';

// O jsdom não implementa isso; o Radix Select chama nos 3 ao abrir/fechar
// (usado só pelo teste que exercita o Select de job_title).
beforeAll(() => {
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => {});
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
});

// Mock supabase
const mockUpdate = vi.fn();
// mockEq controla o valor de retorno de .eq() no caminho de update;
// default: { error: null } — sobrescreva com mockResolvedValueOnce nos testes de erro.
const mockEq = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      update: (...args: unknown[]) => {
        mockUpdate(...args);
        return { eq: mockEq };
      },
      // checkDuplicate em useContactFormValidation dispara debounce 500ms ao mudar
      // o phone — chama .select().or().neq().limit() quando excludeContactId está
      // presente (EditContactDialog sempre passa contact.id). Sem neq no mock,
      // o timer lança TypeError: query.neq is not a function.
      // checkEmailDuplicate chama .select().ilike().neq().limit().
      select: () => ({
        or: () => ({
          neq: () => ({ limit: () => Promise.resolve({ data: [] }) }),
          limit: () => Promise.resolve({ data: [] }),
        }),
        ilike: () => ({
          neq: () => ({ limit: () => Promise.resolve({ data: [] }) }),
          limit: () => Promise.resolve({ data: [] }),
        }),
      }),
    }),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// job_title is a Select whose options come from useExternalCargos; mock it so 'Dev' is a valid option
vi.mock('@/hooks/crm/useExternalCargos', () => ({
  useExternalCargos: () => ({ data: ['Dev', 'CTO', 'Designer'] }),
}));

vi.mock('@/hooks/crm/useExternalEmpresas', () => ({
  useExternalEmpresas: () => ({ data: [] }),
}));

const baseContact = {
  id: 'c1',
  name: 'John Doe',
  phone: '+5511999999999',
  email: 'john@test.com',
  nickname: 'Johnny',
  surname: 'Doe',
  job_title: 'Dev',
  company: 'Acme',
  contact_type: 'cliente',
};

function renderDialog(props = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpenChange = vi.fn();
  return {
    onOpenChange,
    ...render(
      <QueryClientProvider client={qc}>
        <EditContactDialog
          open={true}
          onOpenChange={onOpenChange}
          contact={baseContact}
          {...props}
        />
      </QueryClientProvider>
    ),
  };
}

describe('EditContactDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEq.mockResolvedValue({ error: null });
  });

  // ========== RENDERING ==========
  it('renders dialog title', () => {
    renderDialog();
    expect(screen.getByText('Editar Contato')).toBeInTheDocument();
  });

  it('pre-fills contact name', () => {
    renderDialog();
    const nameInput = screen.getByDisplayValue('John Doe');
    expect(nameInput).toBeInTheDocument();
  });

  it('pre-fills contact phone', () => {
    renderDialog();
    expect(screen.getByDisplayValue('+5511999999999')).toBeInTheDocument();
  });

  it('pre-fills contact email', () => {
    renderDialog();
    expect(screen.getByDisplayValue('john@test.com')).toBeInTheDocument();
  });

  it('pre-fills nickname', () => {
    renderDialog();
    expect(screen.getByDisplayValue('Johnny')).toBeInTheDocument();
  });

  it('pre-fills surname', () => {
    renderDialog();
    expect(screen.getByDisplayValue('Doe')).toBeInTheDocument();
  });

  it('pre-fills job_title', () => {
    renderDialog();
    // job_title is rendered inside a Radix Select trigger as visible text
    expect(screen.getByText('Dev')).toBeInTheDocument();
  });

  it('pre-fills company', () => {
    renderDialog();
    expect(screen.getByDisplayValue('Acme')).toBeInTheDocument();
  });

  // ========== DEFAULTS / EDGE CASES ==========
  it('handles missing optional fields gracefully', () => {
    renderDialog({
      contact: {
        id: 'c2',
        name: 'Jane',
        phone: '+5511888888888',
      },
    });
    expect(screen.getByDisplayValue('Jane')).toBeInTheDocument();
  });

  it('handles null contact_type defaulting to cliente', () => {
    renderDialog({
      contact: { ...baseContact, contact_type: null },
    });
    // Should not crash
    expect(screen.getByText('Editar Contato')).toBeInTheDocument();
  });

  it('handles empty string fields', () => {
    renderDialog({
      contact: { ...baseContact, email: '', nickname: '', company: '' },
    });
    expect(screen.getByText('Editar Contato')).toBeInTheDocument();
  });

  // ========== DIALOG CLOSE ==========
  it('does not render when open is false', () => {
    const qc = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={qc}>
        <EditContactDialog
          open={false}
          onOpenChange={vi.fn()}
          contact={baseContact}
        />
      </QueryClientProvider>
    );
    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
  });

  // ========== FORM VALIDATION INTEGRATION ==========
  it('shows submit button with "Salvar" label', () => {
    renderDialog();
    expect(screen.getByText('Salvar')).toBeInTheDocument();
  });

  it('shows cancel button', () => {
    renderDialog();
    expect(screen.getByText('Cancelar')).toBeInTheDocument();
  });

  // ========== SUBMIT (só manda o que o usuário editou — ver bloco "SÓ CAMPOS
  // ALTERADOS" abaixo; por isso todo teste de submit precisa mudar algo antes) ==========
  it('calls supabase update on submit', async () => {
    renderDialog();
    fireEvent.change(screen.getByDisplayValue('John Doe'), { target: { value: 'John Doe Jr' } });
    fireEvent.click(screen.getByText('Salvar'));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({ name: 'John Doe Jr' });
    });
  });

  it('passes correct contact id to eq', async () => {
    renderDialog();
    fireEvent.change(screen.getByDisplayValue('John Doe'), { target: { value: 'John Doe Jr' } });
    fireEvent.click(screen.getByText('Salvar'));

    await waitFor(() => {
      expect(mockEq).toHaveBeenCalledWith('id', 'c1');
    });
  });

  // P0 — detecta remoção de 'phone' de FIELD_NORMALIZERS (mutation blind identificada
  // pela auditoria de mutation testing, Agent 2, 2026-09-27, 7a rodada): sem esta
  // entrada no normalizer, editar o telefone descarta a mudança silenciosamente.
  it('inclui phone no payload quando o campo telefone é alterado', async () => {
    renderDialog();
    const phoneInput = screen.getByDisplayValue('+5511999999999');
    fireEvent.change(phoneInput, { target: { value: '+5521888888888' } });
    fireEvent.click(screen.getByText('Salvar'));

    await waitFor(() => {
      const updatePayload = mockUpdate.mock.calls[0][0];
      expect(updatePayload).toHaveProperty('phone');
      expect(updatePayload.phone).toBeTruthy();
    });
  });

  it('sends nullable fields as null when the user clears them', async () => {
    renderDialog();
    fireEvent.change(screen.getByDisplayValue('Johnny'), { target: { value: '' } });
    fireEvent.change(screen.getByDisplayValue('Doe'), { target: { value: '' } });
    fireEvent.change(screen.getByDisplayValue('Acme'), { target: { value: '' } });
    fireEvent.change(screen.getByDisplayValue('john@test.com'), { target: { value: '' } });
    // job_title é um Select (sentinela '__none__' → string vazia), não um <input>
    // de texto — cobertura perdida na reescrita "só campos alterados" (auditoria
    // de 5 agentes, 2026-09-26, 5a rodada, achada por mutação: os 24 testes
    // continuavam verdes com o normalizador de job_title trocado por identidade).
    fireEvent.click(screen.getByRole('combobox', { name: /cargo/i }));
    fireEvent.click(await screen.findByRole('option', { name: 'Selecione o cargo' }));
    fireEvent.click(screen.getByText('Salvar'));

    await waitFor(() => {
      const updatePayload = mockUpdate.mock.calls[0][0];
      expect(updatePayload.nickname).toBeNull();
      expect(updatePayload.surname).toBeNull();
      expect(updatePayload.company).toBeNull();
      expect(updatePayload.email).toBeNull();
      expect(updatePayload.job_title).toBeNull();
    });
  });

  // NOTA (auditoria de 5 agentes, 2026-09-26, 5a rodada): o autocomplete de
  // endereço do ContactForm chama onChange várias vezes em sequência, dentro
  // do mesmo handler síncrono (sem re-render entre uma chamada e outra) — o
  // updater funcional de setFormValues (`prev => ({...prev, [field]: value})`)
  // é o que protege isso de virar closure velha perdendo campo. Uma 1a versão
  // deste teste tentava provar isso com 3 `fireEvent.change` dentro de um
  // `act()`, mas cada `fireEvent.change` do RTL já força seu próprio flush
  // síncrono (evento discreto) — não reproduz "mesmo tick, sem render no
  // meio", e continuava verde mesmo com o updater mutado pra versão com
  // closure velha (falso positivo, removido). Cobertura real disso exigiria
  // montar o fluxo completo do autocomplete de endereço (mock da busca de
  // lugar) — não existe hoje; ver "Próximos passos".

  // ========== SÓ CAMPOS ALTERADOS (achado da auditoria de 5 agentes,
  // 2026-09-26, 4a rodada: o painel nunca preenche/seleciona endereço e
  // lat/lon — o form abre sempre com esses campos vazios. Mandar o objeto
  // inteiro a cada Salvar sobrescrevia com null assim que o 1o endereço
  // fosse cadastrado por outra tela, e também perdia um UPDATE que chegasse
  // via Realtime num campo que o usuário não tocou enquanto o diálogo
  // estava aberto) ==========
  it('não sobrescreve com null um campo que o form nunca recebeu (ex: endereço)', async () => {
    // `contact` não traz nenhum campo de endereço — como em produção hoje
    // (ContactDetails/Crm360Tab não os repassam).
    renderDialog();
    fireEvent.change(screen.getByDisplayValue('Johnny'), { target: { value: 'Jonas' } });
    fireEvent.click(screen.getByText('Salvar'));

    await waitFor(() => {
      const updatePayload = mockUpdate.mock.calls[0][0];
      expect(updatePayload.nickname).toBe('Jonas');
      expect(updatePayload).not.toHaveProperty('address');
      expect(updatePayload).not.toHaveProperty('postal_code');
      expect(updatePayload).not.toHaveProperty('latitude');
      expect(updatePayload).not.toHaveProperty('longitude');
    });
  });

  it('manda só o campo que o usuário editou, não o objeto inteiro', async () => {
    renderDialog();
    fireEvent.change(screen.getByDisplayValue('Johnny'), { target: { value: 'Jonas' } });
    fireEvent.click(screen.getByText('Salvar'));

    await waitFor(() => {
      const updatePayload = mockUpdate.mock.calls[0][0];
      expect(updatePayload).toEqual({ nickname: 'Jonas' });
    });
  });

  // ========== ITEM 5 (decisão 20260930-122408-sem-tarefa, opção a) ==========
  it('com a coordenada carregada, salvar sem tocar no endereço NÃO envia latitude/longitude (regra 1)', async () => {
    renderDialog({
      contact: { ...baseContact, address: 'Av. Paulista', latitude: -23.5613, longitude: -46.6565 },
    });
    fireEvent.change(screen.getByDisplayValue('John Doe'), { target: { value: 'Jonas' } });
    fireEvent.click(screen.getByText('Salvar'));

    await waitFor(() => {
      const updatePayload = mockUpdate.mock.calls[0][0];
      expect(updatePayload).toEqual({ name: 'Jonas' });
    });
  });

  it('item 5: reescrever o endereço à mão com coordenada carregada sinaliza coordenada possivelmente velha (regra 3)', () => {
    renderDialog({
      contact: { ...baseContact, address: 'Av. Paulista', latitude: -23.5613, longitude: -46.6565 },
    });
    const aviso = /localização \(coordenada\) continua a anterior/i;
    expect(screen.queryByText(aviso)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Logradouro'), { target: { value: 'Rua Nova' } });

    expect(screen.getByText(aviso)).toBeInTheDocument();
  });

  it('não chama o supabase quando Salvar é clicado sem nenhuma edição', async () => {
    const { onOpenChange } = renderDialog();
    fireEvent.click(screen.getByText('Salvar'));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // ========== FORM STATE ISOLATION ==========
  it('does not crash with special characters in name', () => {
    renderDialog({
      contact: { ...baseContact, name: "O'Brien & Sönke <script>" },
    });
    expect(screen.getByDisplayValue("O'Brien & Sönke <script>")).toBeInTheDocument();
  });

  it('handles very long name (100 chars)', () => {
    const longName = 'A'.repeat(100);
    renderDialog({ contact: { ...baseContact, name: longName } });
    expect(screen.getByDisplayValue(longName)).toBeInTheDocument();
  });

  // ========== RESSINCRONIZAÇÃO AO ABRIR (ContactDetails mantém o diálogo sempre
  // montado pra não cortar a animação de fechamento do Radix; sem ressincronizar
  // ao abrir, o formulário ficava travado com os valores vazios capturados na
  // 1a montagem, de quando enrichedData ainda era undefined — Salvar sem tocar
  // em nada sobrescrevia apelido/cargo/empresa reais com null) ==========
  it('ressincroniza os campos quando o diálogo é aberto depois que os dados reais chegam', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onOpenChange = vi.fn();
    // Simula o estado do 1o render de ContactDetails, com enrichedData ainda
    // undefined (React Query não resolveu) — diálogo montado, mas fechado.
    const emptyContact = { id: 'c1', name: 'John Doe', phone: '+5511999999999' };
    const { rerender } = render(
      <QueryClientProvider client={qc}>
        <EditContactDialog open={false} onOpenChange={onOpenChange} contact={emptyContact} />
      </QueryClientProvider>
    );

    // enrichedData chega e o usuário clica em "Editar".
    rerender(
      <QueryClientProvider client={qc}>
        <EditContactDialog open={true} onOpenChange={onOpenChange} contact={baseContact} />
      </QueryClientProvider>
    );

    expect(screen.getByDisplayValue('Johnny')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Doe')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Acme')).toBeInTheDocument();
    expect(screen.getByText('Dev')).toBeInTheDocument();
  });

  // Mutation blind detectada pela auditoria (Agent 4, 2026-09-27): remover
  // setInitialValues(next) do bloco de resync faz setFormValues correto mas
  // deixa initialValues com os valores vazios da 1a montagem — qualquer Save
  // sem edição enviaria TODOS os campos ao banco (sobrescrevendo com null).
  it('não chama update quando o diálogo ressincroniza e o usuário salva sem editar', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onOpenChange = vi.fn();
    const emptyContact = { id: 'c1', name: 'John Doe', phone: '+5511999999999' };
    const { rerender } = render(
      <QueryClientProvider client={qc}>
        <EditContactDialog open={false} onOpenChange={onOpenChange} contact={emptyContact} />
      </QueryClientProvider>
    );

    rerender(
      <QueryClientProvider client={qc}>
        <EditContactDialog open={true} onOpenChange={onOpenChange} contact={baseContact} />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByText('Salvar'));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // ========== CANCEL ==========
  it('calls onOpenChange(false) on cancel click', () => {
    const { onOpenChange } = renderDialog();
    fireEvent.click(screen.getByText('Cancelar'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  // ========== ERRO DE REDE (caminho catch do handleSubmit) ==========
  // Estes 4 testes cobrem o bloco que ficava sem cobertura:
  // catch(err) { rollback cache otimista; toast.error; } finally { setIsSubmitting(false) }

  it('mostra toast de erro quando supabase retorna error', async () => {
    mockEq.mockResolvedValueOnce({ error: { message: 'Network error' } });
    renderDialog();
    fireEvent.change(screen.getByDisplayValue('John Doe'), { target: { value: 'John Doe Jr' } });
    fireEvent.click(screen.getByText('Salvar'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Erro ao atualizar contato');
    });
  });

  it('não fecha o diálogo quando update falha', async () => {
    mockEq.mockResolvedValueOnce({ error: { message: 'Network error' } });
    const { onOpenChange } = renderDialog();
    fireEvent.change(screen.getByDisplayValue('John Doe'), { target: { value: 'John Doe Jr' } });
    fireEvent.click(screen.getByText('Salvar'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('faz rollback do cache otimista quando supabase retorna error', async () => {
    mockEq.mockResolvedValueOnce({ error: { message: 'Network error' } });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(['contact-enriched', 'c1'], { ...baseContact });
    const onOpenChange = vi.fn();
    render(
      <QueryClientProvider client={qc}>
        <EditContactDialog open={true} onOpenChange={onOpenChange} contact={baseContact} />
      </QueryClientProvider>
    );

    fireEvent.change(screen.getByDisplayValue('John Doe'), { target: { value: 'John Doe Jr' } });
    fireEvent.click(screen.getByText('Salvar'));

    await waitFor(() => {
      const cached = qc.getQueryData<Record<string, unknown>>(['contact-enriched', 'c1']);
      expect(cached?.name).toBe('John Doe');
    });
  });

  it('reabilita o botão Salvar após falha no update', async () => {
    mockEq.mockResolvedValueOnce({ error: { message: 'Network error' } });
    renderDialog();
    fireEvent.change(screen.getByDisplayValue('John Doe'), { target: { value: 'John Doe Jr' } });
    fireEvent.click(screen.getByText('Salvar'));

    await waitFor(() => {
      expect(screen.getByText('Salvar').closest('button')).not.toBeDisabled();
    });
  });

  // ========== INVALIDAÇÃO PÓS-EDIÇÃO (auditoria: invalidava a chave morta
  // ['contacts'] — o prefixo de array não casa com 'contacts-search'; a lista e
  // os agregados ficavam velhos até remontar) ==========
  it('após salvar, invalida contacts-search e os agregados, não a chave morta contacts', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(['contacts-kpi', false], { total: 1 });
    qc.setQueryData(['contacts-type-counts', false], [{ contact_type: 'cliente', count: 1 }]);
    qc.setQueryData(['contacts-search'], [{ id: 'c1' }]);
    qc.setQueryData(['contacts'], [{ id: 'c1' }]);
    render(
      <QueryClientProvider client={qc}>
        <EditContactDialog open={true} onOpenChange={vi.fn()} contact={baseContact} />
      </QueryClientProvider>
    );
    fireEvent.change(screen.getByDisplayValue('John Doe'), { target: { value: 'John Doe Jr' } });
    fireEvent.click(screen.getByText('Salvar'));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect(qc.getQueryState(['contacts-kpi', false])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(['contacts-type-counts', false])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(['contacts-search'])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(['contacts'])?.isInvalidated).toBe(false);
  });
});

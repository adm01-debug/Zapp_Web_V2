import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
const mockEq = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      update: (...args: unknown[]) => {
        mockUpdate(...args);
        return {
          eq: (...eqArgs: unknown[]) => {
            mockEq(...eqArgs);
            return Promise.resolve({ error: null });
          },
        };
      },
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
      expect(mockUpdate).toHaveBeenCalled();
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

  // ========== CANCEL ==========
  it('calls onOpenChange(false) on cancel click', () => {
    const { onOpenChange } = renderDialog();
    fireEvent.click(screen.getByText('Cancelar'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

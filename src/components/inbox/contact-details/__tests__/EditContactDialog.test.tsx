import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EditContactDialog } from '../EditContactDialog';

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

  // ========== SUBMIT ==========
  it('calls supabase update on submit', async () => {
    renderDialog();
    const submitBtn = screen.getByText('Salvar');
    fireEvent.click(submitBtn);
    
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalled();
    });
  });

  it('passes correct contact id to eq', async () => {
    renderDialog();
    fireEvent.click(screen.getByText('Salvar'));
    
    await waitFor(() => {
      expect(mockEq).toHaveBeenCalledWith('id', 'c1');
    });
  });

  it('sends nullable fields as null when empty', async () => {
    renderDialog({
      contact: { ...baseContact, nickname: '', surname: '', job_title: '', company: '', email: '' },
    });
    fireEvent.click(screen.getByText('Salvar'));
    
    await waitFor(() => {
      const updatePayload = mockUpdate.mock.calls[0][0];
      expect(updatePayload.nickname).toBeNull();
      expect(updatePayload.surname).toBeNull();
      expect(updatePayload.job_title).toBeNull();
      expect(updatePayload.company).toBeNull();
      expect(updatePayload.email).toBeNull();
    });
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

  // ========== CANCEL ==========
  it('calls onOpenChange(false) on cancel click', () => {
    const { onOpenChange } = renderDialog();
    fireEvent.click(screen.getByText('Cancelar'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

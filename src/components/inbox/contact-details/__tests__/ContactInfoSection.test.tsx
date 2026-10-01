import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContactInfoSection } from '../ContactInfoSection';

/**
 * Auditoria: ContactInfoSection.updateContact (email/company/job_title) gravava
 * no banco sem invalidar nenhuma query — a lista de Contatos (contacts-search) e
 * o painel enriquecido (contact-enriched) ficavam com o valor antigo até remontar.
 */

const mockEq = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ update: () => ({ eq: mockEq }) }),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const contact = {
  id: 'c1',
  phone: '5511999999999',
  email: 'old@test.com',
  createdAt: new Date('2024-01-01'),
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const enriched: any = { company: 'Acme', job_title: 'Dev' };

function renderSection(qc: QueryClient) {
  return render(
    <QueryClientProvider client={qc}>
      <ContactInfoSection contact={contact} enrichedData={enriched} />
    </QueryClientProvider>
  );
}

describe('ContactInfoSection — invalidação após editar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEq.mockResolvedValue({ error: null });
  });

  it('ao salvar um campo, invalida contacts-search e contact-enriched', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(['contacts-search'], [{ id: 'c1' }]);
    qc.setQueryData(['contact-enriched', 'c1'], { ...enriched });

    const { container } = renderSection(qc);

    // Entra em modo edição do E-mail (lápis na linha do valor).
    const emailValue = screen.getByText('old@test.com');
    const row = emailValue.closest('div.group') as HTMLElement;
    fireEvent.click(within(row).getByRole('button'));

    // Edita e salva (botão de salvar é o único com a classe text-success).
    fireEvent.change(screen.getByDisplayValue('old@test.com'), { target: { value: 'new@test.com' } });
    fireEvent.click(container.querySelector('button.text-success') as HTMLButtonElement);

    await waitFor(() => expect(mockEq).toHaveBeenCalledWith('id', 'c1'));
    expect(qc.getQueryState(['contacts-search'])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(['contact-enriched', 'c1'])?.isInvalidated).toBe(true);
  });
});

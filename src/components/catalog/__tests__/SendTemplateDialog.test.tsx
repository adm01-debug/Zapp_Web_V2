/** Porta de entrada de `send-template` (wrapper sem tela; o #2054 apagou a rota por isso). */
import { fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ sendTemplateMessage: vi.fn() }));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/hooks/integrations/useEvolutionApi', () => ({ useEvolutionApi: () => api }));
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: [{ id: 'c1', name: 'Principal', instance_id: 'PRINCIPAL' }], error: null }),
      }),
    }),
  },
}));

import { SendTemplateDialog } from '../SendTemplateDialog';
import { montarTemplateEvolution } from '../sendTemplatePayload';
import type { WhatsAppTemplate } from '@/hooks/integrations/useWhatsAppTemplates';

const template = {
  id: 't1', name: 'boas_vindas', category: 'utility', language: 'pt_BR', content: 'Olá {{1}}',
  header_text: null, footer_text: null, buttons: null, variables: ['{{1}}'], status: 'approved',
  whatsapp_connection_id: 'c1', created_by: null, created_at: '', updated_at: '',
} as WhatsAppTemplate;

beforeEach(() => { vi.clearAllMocks(); });

function render(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('montarTemplateEvolution', () => {
  it('põe as variáveis no componente body, na ordem; sem variáveis, sem componentes', () => {
    expect(montarTemplateEvolution(template, ['Ana'])).toEqual({
      name: 'boas_vindas', language: 'pt_BR',
      components: [{ type: 'body', parameters: [{ type: 'text', text: 'Ana' }] }],
    });
    expect(montarTemplateEvolution(template, []).components).toEqual([]);
  });
});

describe('SendTemplateDialog', () => {
  it('envia pela conexão do template, com número só em dígitos e as variáveis', async () => {
    api.sendTemplateMessage.mockResolvedValue({ key: { id: 'x' } });
    const onOpenChange = vi.fn();
    render(<SendTemplateDialog template={template} onOpenChange={onOpenChange} />);

    fireEvent.change(screen.getByLabelText(/número do contato/i), { target: { value: '+55 (11) 99999-9999' } });
    fireEvent.change(screen.getByLabelText(/variável/i), { target: { value: 'Ana' } });
    await waitFor(() => expect(screen.getByRole('combobox', { name: /conexão/i })).toHaveTextContent('Principal'));
    fireEvent.click(screen.getByRole('button', { name: /^enviar$/i }));

    await waitFor(() => expect(api.sendTemplateMessage).toHaveBeenCalledWith('PRINCIPAL', '5511999999999', {
      name: 'boas_vindas', language: 'pt_BR',
      components: [{ type: 'body', parameters: [{ type: 'text', text: 'Ana' }] }],
    }));
    expect(toastMock.success).toHaveBeenCalledWith('Template enviado');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('variável vazia não envia', async () => {
    render(<SendTemplateDialog template={template} onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/número do contato/i), { target: { value: '5511999999999' } });
    await waitFor(() => expect(screen.getByRole('combobox', { name: /conexão/i })).toHaveTextContent('Principal'));
    fireEvent.click(screen.getByRole('button', { name: /^enviar$/i }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('Preencha todas as variáveis do template.'));
    expect(api.sendTemplateMessage).not.toHaveBeenCalled();
  });
});

/** Porta de entrada de `send-template` (wrapper sem tela; o #2054 apagou a rota por isso). */
import { fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ sendTemplateMessage: vi.fn() }));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
const db = vi.hoisted(() => ({
  result: { data: [{ id: 'c1', name: 'Principal', instance_id: 'PRINCIPAL' }], error: null } as { data: unknown; error: unknown },
  eq: vi.fn(),
}));
vi.mock('@/hooks/integrations/useEvolutionApi', () => ({ useEvolutionApi: () => api }));
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('@/integrations/supabase/client', () => {
  const query = {
    eq: (...args: unknown[]) => { db.eq(...args); return query; },
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(db.result).then(resolve, reject),
  };
  return { supabase: { from: () => ({ select: () => ({ order: () => query }) }) } };
});

import { SendTemplateDialog } from '../SendTemplateDialog';
import { montarTemplateEvolution } from '../sendTemplatePayload';
import { extractTemplateVariables, sortTemplateVariables, type WhatsAppTemplate } from '@/hooks/integrations/useWhatsAppTemplates';

const template = {
  id: 't1', name: 'boas_vindas', category: 'utility', language: 'pt_BR', content: 'Olá {{1}}',
  header_text: null, footer_text: null, buttons: null, variables: ['{{1}}'], status: 'approved',
  whatsapp_connection_id: 'c1', created_by: null, created_at: '', updated_at: '',
} as WhatsAppTemplate;

beforeEach(() => {
  vi.clearAllMocks();
  db.result = { data: [{ id: 'c1', name: 'Principal', instance_id: 'PRINCIPAL' }], error: null };
});

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

describe('variáveis do template em ordem numérica', () => {
  it('{{2}} vem antes de {{10}} (a ordem de texto invertia)', () => {
    expect(extractTemplateVariables('Oi {{10}}, pedido {{2}} e {{1}} {{2}}')).toEqual(['{{1}}', '{{2}}', '{{10}}']);
    expect(sortTemplateVariables(['{{10}}', '{{2}}'])).toEqual(['{{2}}', '{{10}}']);
  });
});

describe('SendTemplateDialog', () => {
  it('lista só conexões conectadas e envia com número só em dígitos e as variáveis', async () => {
    api.sendTemplateMessage.mockResolvedValue({ key: { id: 'x' } });
    const onOpenChange = vi.fn();
    render(<SendTemplateDialog template={template} onOpenChange={onOpenChange} />);

    fireEvent.change(screen.getByLabelText(/número do contato/i), { target: { value: '+55 (11) 99999-9999' } });
    fireEvent.change(screen.getByLabelText(/variável/i), { target: { value: 'Ana' } });
    await waitFor(() => expect(screen.getByRole('combobox', { name: /conexão/i })).toHaveTextContent('Principal'));
    expect(db.eq).toHaveBeenCalledWith('status', 'connected');
    fireEvent.click(screen.getByRole('button', { name: /^enviar$/i }));

    await waitFor(() => expect(api.sendTemplateMessage).toHaveBeenCalledWith('PRINCIPAL', '5511999999999', {
      name: 'boas_vindas', language: 'pt_BR',
      components: [{ type: 'body', parameters: [{ type: 'text', text: 'Ana' }] }],
    }));
    expect(toastMock.success).toHaveBeenCalledWith('Template enviado');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('variáveis aparecem e vão em ordem numérica ({{2}} antes de {{10}})', async () => {
    api.sendTemplateMessage.mockResolvedValue({});
    render(<SendTemplateDialog template={{ ...template, variables: ['{{10}}', '{{2}}'] }} onOpenChange={vi.fn()} />);

    const campos = screen.getAllByLabelText(/variável/i);
    expect(campos.map((c) => c.id)).toEqual(['template-var-0', 'template-var-1']);
    expect(screen.getByText('Variável {{2}}')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Variável {{2}}'), { target: { value: 'dois' } });
    fireEvent.change(screen.getByLabelText('Variável {{10}}'), { target: { value: 'dez' } });
    fireEvent.change(screen.getByLabelText(/número do contato/i), { target: { value: '5511999999999' } });
    await waitFor(() => expect(screen.getByRole('combobox', { name: /conexão/i })).toHaveTextContent('Principal'));
    fireEvent.click(screen.getByRole('button', { name: /^enviar$/i }));

    await waitFor(() => expect(api.sendTemplateMessage).toHaveBeenCalled());
    const enviado = api.sendTemplateMessage.mock.calls[0][2] as { components: { parameters: { text: string }[] }[] };
    expect(enviado.components[0].parameters.map((p) => p.text)).toEqual(['dois', 'dez']);
  });

  it('variável vazia não envia', async () => {
    render(<SendTemplateDialog template={template} onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/número do contato/i), { target: { value: '5511999999999' } });
    await waitFor(() => expect(screen.getByRole('combobox', { name: /conexão/i })).toHaveTextContent('Principal'));
    fireEvent.click(screen.getByRole('button', { name: /^enviar$/i }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('Preencha todas as variáveis do template.'));
    expect(api.sendTemplateMessage).not.toHaveBeenCalled();
  });

  it('falha ao carregar as conexões mostra mensagem', async () => {
    db.result = { data: null, error: { message: 'rls' } };
    render(<SendTemplateDialog template={template} onOpenChange={vi.fn()} />);
    expect(await screen.findByTestId('template-conexoes-erro')).toHaveTextContent('Não foi possível carregar as conexões');
  });

  it('sem conexão conectada avisa e não pré-seleciona a do template', async () => {
    db.result = { data: [], error: null };
    render(<SendTemplateDialog template={template} onOpenChange={vi.fn()} />);
    expect(await screen.findByTestId('template-conexoes-vazio')).toHaveTextContent('Nenhuma conexão do WhatsApp conectada');
    expect(screen.getByRole('combobox', { name: /conexão/i })).toHaveTextContent('Escolha a conexão');
  });

  it('notSupported (Evolution GO) vira aviso em português, sem nome de rota', async () => {
    api.sendTemplateMessage.mockRejectedValue(Object.assign(new Error('send-template não é suportado na Evolution GO.'), { notSupported: true }));
    render(<SendTemplateDialog template={template} onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/número do contato/i), { target: { value: '5511999999999' } });
    fireEvent.change(screen.getByLabelText(/variável/i), { target: { value: 'Ana' } });
    await waitFor(() => expect(screen.getByRole('combobox', { name: /conexão/i })).toHaveTextContent('Principal'));
    fireEvent.click(screen.getByRole('button', { name: /^enviar$/i }));

    await waitFor(() => expect(toastMock.warning).toHaveBeenCalledWith('O envio de template não está disponível nesta conexão do WhatsApp (Evolution GO).'));
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(toastMock.success).not.toHaveBeenCalled();
  });
});

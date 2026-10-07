import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const mockFrom = vi.fn();
const orderMock = vi.fn();
const selectMock = vi.fn();
const insertMock = vi.fn();
const updateMock = vi.fn();
const eqMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

import { toast } from 'sonner';
import {
  useWhatsAppTemplates,
  STATUS_BADGES,
  EMPTY_TEMPLATE,
  type WhatsAppTemplate,
} from '@/hooks/integrations/useWhatsAppTemplates';

const templateArmazenado: WhatsAppTemplate = {
  id: 'tpl-1',
  name: 'pedido_confirmado',
  category: 'utility',
  language: 'pt_BR',
  content: 'Olá {{1}}',
  header_text: null,
  footer_text: null,
  buttons: [],
  variables: ['{{1}}'],
  status: 'pending',
  whatsapp_connection_id: null,
  created_by: 'user-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function montarClienteSupabase(templates: WhatsAppTemplate[] = []) {
  orderMock.mockResolvedValue({ data: templates, error: null });
  selectMock.mockReturnValue({ order: orderMock });
  insertMock.mockResolvedValue({ error: null });
  eqMock.mockResolvedValue({ error: null });
  updateMock.mockReturnValue({ eq: eqMock });
  mockFrom.mockImplementation(() => ({
    select: selectMock,
    insert: insertMock,
    update: updateMock,
  }));
}

async function montarHook(templates: WhatsAppTemplate[] = []) {
  montarClienteSupabase(templates);
  const { result } = renderHook(() => useWhatsAppTemplates());
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result;
}

describe('useWhatsAppTemplates — aprovação oficial não é escolhida localmente (R2-MOD-067)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('grava como rascunho local mesmo quando o formulário manda status "approved" na criação', async () => {
    const result = await montarHook();

    act(() => {
      result.current.setEditingTemplate({
        ...EMPTY_TEMPLATE,
        name: 'promo_janeiro',
        content: 'Olá {{1}}, promoção!',
        status: 'approved',
      });
    });
    await act(async () => {
      await result.current.handleSave();
    });

    expect(insertMock).toHaveBeenCalledTimes(1);
    const payload = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.status).toBe('draft');
    expect(payload.content).toBe('Olá {{1}}, promoção!');
  });

  it('não sobrescreve o status de aprovação guardado ao editar um template existente', async () => {
    const result = await montarHook([templateArmazenado]);

    act(() => {
      result.current.setEditingTemplate({
        ...templateArmazenado,
        content: 'Olá {{1}}, texto novo',
        status: 'approved',
      });
    });
    await act(async () => {
      await result.current.handleSave();
    });

    expect(updateMock).toHaveBeenCalledTimes(1);
    const payload = updateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('status');
    // a edição de conteúdo continua acontecendo (o teste não é tautológico)
    expect(payload.content).toBe('Olá {{1}}, texto novo');
    expect(payload.name).toBe('pedido_confirmado');
    expect(eqMock).toHaveBeenCalledWith('id', 'tpl-1');
  });

  it('template aprovado vindo da tabela é exibido como estado local, não como selo oficial do provedor', async () => {
    const result = await montarHook([{ ...templateArmazenado, status: 'approved' }]);

    const exibido = result.current.templates[0];
    expect(exibido.status).toBe('approved');

    const badge = STATUS_BADGES[exibido.status];
    expect(badge.scope).toBe('local');
    expect(badge.label.toLowerCase()).toContain('local');
    for (const [valor, info] of Object.entries(STATUS_BADGES)) {
      expect(info.label.toLowerCase(), `rótulo de "${valor}"`).toContain('local');
      expect(info.scope).toBe('local');
    }
  });

  it('o feedback do salvamento descreve que gravou localmente, sem afirmar submissão à aprovação', async () => {
    const result = await montarHook([templateArmazenado]);

    act(() => {
      result.current.setEditingTemplate({
        ...EMPTY_TEMPLATE,
        name: 'aviso_entrega',
        content: 'Seu pedido saiu para entrega',
        status: 'approved',
      });
    });
    await act(async () => {
      await result.current.handleSave();
    });

    const mensagens = (): string[] =>
      vi.mocked(toast.success).mock.calls.map((chamada) => String(chamada[0] ?? ''));
    expect(mensagens().length).toBeGreaterThan(0);
    for (const mensagem of mensagens()) {
      expect(mensagem.toLowerCase()).toContain('local');
      expect(mensagem).not.toMatch(/submetid|enviado para aprova|em an[áa]lise/i);
      expect(mensagem).not.toMatch(/sincroniza/i);
    }

    // a edição de um template existente também precisa dizer que gravou localmente
    act(() => {
      result.current.setEditingTemplate({ ...templateArmazenado, content: 'Olá {{1}}, texto novo' });
    });
    await act(async () => {
      await result.current.handleSave();
    });

    const ultima = mensagens()[mensagens().length - 1];
    expect(ultima.toLowerCase()).toContain('local');
    expect(ultima).not.toMatch(/submetid|enviado para aprova|em an[áa]lise/i);
    expect(ultima).not.toMatch(/sincroniza/i);
  });
});

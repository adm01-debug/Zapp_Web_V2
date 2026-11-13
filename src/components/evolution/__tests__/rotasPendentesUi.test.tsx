/**
 * Telas das rotas pendentes do #2054 restauradas por decisão do dono (12/11):
 * find-chats (Monitoramento → Diagnóstico), offer-call (Telefonia → Nova ligação),
 * find/create/delete-template (Templates WhatsApp → Templates na Meta) e
 * get-catalog/get-collections (painel do contato).
 */
import { fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  findChats: vi.fn(), offerCall: vi.fn(), findTemplates: vi.fn(), createTemplate: vi.fn(),
  deleteTemplate: vi.fn(), getBusinessCatalog: vi.fn(), getBusinessCollections: vi.fn(),
}));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const papel = vi.hoisted(() => ({ isSupervisor: true }));

vi.mock('@/hooks/integrations/useEvolutionApi', () => ({ useEvolutionApi: () => api }));
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('@/hooks/system/useUserRole', () => ({ useUserRole: () => ({ isSupervisor: papel.isSupervisor }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: [{ id: 'c1', name: 'Principal', instance_id: 'PRINCIPAL' }], error: null }),
      }),
    }),
  },
}));

import { DeviceChatsPanel } from '@/components/monitoring/DeviceChatsPanel';
import { OfferCallButton } from '@/components/calls/OfferCallButton';
import { MetaTemplatesDialog } from '@/components/catalog/MetaTemplatesDialog';
import { montarTemplateMeta } from '@/components/catalog/metaTemplatePayload';
import { WhatsAppCatalogSection } from '@/components/inbox/contact-details/WhatsAppCatalogSection';
import type { WhatsAppTemplate } from '@/hooks/integrations/useWhatsAppTemplates';

function render(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const naoSuportado = (acao: string) => Object.assign(new Error(`${acao} não é suportado na Evolution GO.`), { notSupported: true });
const conexaoCarregada = () => waitFor(() => expect(screen.getAllByRole('combobox', { name: /conexão/i })[0]).toHaveTextContent('Principal'));

beforeEach(() => { vi.clearAllMocks(); papel.isSupervisor = true; });

describe('DeviceChatsPanel (find-chats)', () => {
  it('lista as conversas do aparelho da conexão', async () => {
    api.findChats.mockResolvedValue([{ remoteJid: '5511999999999@s.whatsapp.net', pushName: 'Ana', unreadCount: 2 }]);
    render(<DeviceChatsPanel />);
    await conexaoCarregada();
    fireEvent.click(screen.getByRole('button', { name: /listar conversas/i }));
    expect(await screen.findByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('2 não lida(s)')).toBeInTheDocument();
    expect(api.findChats).toHaveBeenCalledWith('PRINCIPAL');
  });

  it('notSupported (GO) vira aviso de erro', async () => {
    api.findChats.mockRejectedValue(naoSuportado('find-chats'));
    render(<DeviceChatsPanel />);
    await conexaoCarregada();
    fireEvent.click(screen.getByRole('button', { name: /listar conversas/i }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('find-chats não é suportado na Evolution GO.'));
  });
});

describe('OfferCallButton (offer-call)', () => {
  it('envia o toque pela instância da linha WhatsApp, número só em dígitos', async () => {
    api.offerCall.mockResolvedValue({});
    render(<OfferCallButton e164="+5511999999999" connectionId="c1" />);
    const botao = screen.getByRole('button', { name: /enviar toque/i });
    await waitFor(() => { fireEvent.click(botao); expect(api.offerCall).toHaveBeenCalled(); });
    expect(api.offerCall).toHaveBeenCalledWith('PRINCIPAL', '5511999999999', false, 5);
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Toque enviado'));
  });

  it('sem linha WhatsApp não renderiza', () => {
    render(<OfferCallButton e164="+5511999999999" connectionId={null} />);
    expect(screen.queryByRole('button', { name: /enviar toque/i })).not.toBeInTheDocument();
  });
});

const local = {
  id: 't1', name: 'boas_vindas', category: 'utility', language: 'pt_BR', content: 'Olá {{1}}',
  header_text: 'Bem-vindo', footer_text: '', buttons: null, variables: ['{{1}}'], status: 'draft',
  whatsapp_connection_id: null, created_by: null, created_at: '', updated_at: '',
} as WhatsAppTemplate;

describe('Templates na Meta (find/create/delete-template)', () => {
  it('montarTemplateMeta: cabeçalho e corpo; rodapé vazio fica fora; categoria em maiúsculas', () => {
    expect(montarTemplateMeta(local)).toEqual({
      name: 'boas_vindas', category: 'UTILITY', language: 'pt_BR',
      components: [{ type: 'HEADER', format: 'TEXT', text: 'Bem-vindo' }, { type: 'BODY', text: 'Olá {{1}}' }],
    });
  });

  it('lista os templates da Meta e exclui só depois de confirmar', async () => {
    api.findTemplates.mockResolvedValue({ data: [{ name: 'promo', language: 'pt_BR', category: 'MARKETING', status: 'APPROVED' }] });
    api.deleteTemplate.mockResolvedValue({});
    render(<MetaTemplatesDialog open onOpenChange={vi.fn()} localTemplates={[local]} />);
    await conexaoCarregada();
    fireEvent.click(screen.getByRole('button', { name: /listar na meta/i }));
    expect(await screen.findByText('promo')).toBeInTheDocument();
    expect(screen.getByText('APPROVED')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /excluir promo na meta/i }));
    expect(api.deleteTemplate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /confirmar exclusão/i }));
    await waitFor(() => expect(api.deleteTemplate).toHaveBeenCalledWith('PRINCIPAL', { name: 'promo' }));
    await waitFor(() => expect(screen.queryByText('promo')).not.toBeInTheDocument());
  });

  it('enviar para aprovação exige escolher o template local', async () => {
    render(<MetaTemplatesDialog open onOpenChange={vi.fn()} localTemplates={[local]} />);
    await conexaoCarregada();
    expect(screen.getByRole('button', { name: /enviar para aprovação/i })).toBeDisabled();
    expect(api.createTemplate).not.toHaveBeenCalled();
  });
});

describe('WhatsAppCatalogSection (get-catalog / get-collections)', () => {
  it('só aparece para supervisor/admin', () => {
    papel.isSupervisor = false;
    render(<WhatsAppCatalogSection phone="+55 11 99999-9999" />);
    expect(screen.queryByTestId('catalogo-whatsapp-abrir')).not.toBeInTheDocument();
  });

  it('carrega produtos e coleções do número do contato', async () => {
    api.getBusinessCatalog.mockResolvedValue({ products: [{ id: 'p1', name: 'Caneca', price: '29,90', currency: 'BRL' }] });
    api.getBusinessCollections.mockResolvedValue({ collections: [{ name: 'Brindes' }] });
    render(<WhatsAppCatalogSection phone="+55 11 99999-9999" />);
    fireEvent.click(screen.getByTestId('catalogo-whatsapp-abrir'));
    await conexaoCarregada();
    fireEvent.click(screen.getByRole('button', { name: /carregar catálogo/i }));
    expect(await screen.findByText('Caneca')).toBeInTheDocument();
    expect(screen.getByText('Coleções: Brindes')).toBeInTheDocument();
    expect(api.getBusinessCatalog).toHaveBeenCalledWith('PRINCIPAL', '5511999999999', 20);
    expect(api.getBusinessCollections).toHaveBeenCalledWith('PRINCIPAL', '5511999999999', 20);
  });
});

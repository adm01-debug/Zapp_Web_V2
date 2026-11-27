import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * N-127 — as três ações de template que viviam só no banco (`duplicate_talkx_template`,
 * `archive_talkx_template`, `delete_talkx_template`) e o teste de envio
 * (`talkx-send` `action=test`).
 *
 * A migration `20261126213000_talkx_template_duplicate_archive_delete.sql` criou as
 * RPCs e o `archived_at`, e deixou escrito o que faltava no front: a lista ativa
 * precisa filtrar `archived_at IS NULL`. É o que este arquivo mede — arquivar pela
 * tela, a lista ativa escondendo os arquivados, e a janela de teste mandando a
 * conexão que o edge exige (`connectionId`, senão "connectionId obrigatorio").
 */

/** O jsdom não implementa captura de ponteiro; o gatilho do Select (Radix) chama. */
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

const h = vi.hoisted(() => ({
  archive: vi.fn(),
  testTemplate: vi.fn(),
  fetchVariants: vi.fn(),
  connections: [] as Array<{ id: string; name: string; instance_id: string }>,
  templates: [] as Array<Record<string, unknown>>,
}));

// Sem AuthProvider no render o `useAuth` lança: os dois hooks de permissão são
// dublados. Aqui o papel é admin — o "Testar" só aparece para admin/supervisor,
// o mesmo predicado do `talkx-send`.
vi.mock('@/hooks/system/useDownloadPermission', () => ({
  useDownloadPermission: () => ({ canDownload: true, isLoading: false }),
}));
vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ isAdmin: true, isSupervisor: false }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ data: null, error: null }) },
}));
vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({ campaigns: [], isLoading: false, isError: false, error: null, refetchCampaigns: vi.fn() }),
}));
vi.mock('@/hooks/connections/useConnectionOptions', () => ({
  useConnectionOptions: () => ({ data: h.connections, isLoading: false }),
}));
vi.mock('@/hooks/integrations/useTalkXTemplates', () => ({
  useTalkXTemplates: () => ({
    templates: h.templates,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    createTemplate: { mutate: vi.fn() },
    updateTemplate: { mutate: vi.fn() },
    deleteTemplate: { mutate: vi.fn() },
    duplicateTemplate: { mutate: vi.fn() },
    archiveTemplate: { mutate: h.archive },
    testTemplate: h.testTemplate,
    fetchVersionHistory: vi.fn().mockResolvedValue([]),
    fetchVariants: h.fetchVariants,
    saveVariant: vi.fn(),
    deleteVariant: vi.fn(),
    countVariantRecipients: vi.fn(),
  }),
}));

import { TalkXTemplates } from '../TalkXTemplates';

function tpl(over: Record<string, unknown> = {}) {
  return {
    id: 'tpl-1',
    name: 'Boas-vindas',
    description: 'Descrição do template',
    category: 'geral',
    content: 'Olá {{nome}}',
    media_url: null,
    media_type: null,
    tags: [] as string[],
    status: 'approved',
    use_count: 0,
    created_by: null,
    custom_variables: ['nome'],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    archived_at: null,
    ...over,
  };
}

function renderTemplates() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TalkXTemplates onUseTemplate={vi.fn()} />
    </QueryClientProvider>,
  );
}

function abrirSelect(alvo: HTMLElement) {
  fireEvent.pointerDown(alvo, { button: 0, ctrlKey: false, pointerType: 'mouse' });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.templates = [];
  h.connections = [{ id: 'conn-1', name: 'WhatsApp 1', instance_id: 'i1' }];
  h.fetchVariants.mockResolvedValue([]);
  h.testTemplate.mockResolvedValue({ success: true, id: 'msg-1' });
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});

describe('N-127 — arquivar pela biblioteca', () => {
  it('o botão Arquivar chama a RPC com archived: true (não apaga nada)', () => {
    h.templates = [tpl()];
    renderTemplates();

    fireEvent.click(screen.getByRole('button', { name: 'Arquivar' }));

    expect(h.archive).toHaveBeenCalledWith({ id: 'tpl-1', archived: true });
  });

  it('template arquivado oferece Desarquivar, com archived: false', () => {
    h.templates = [tpl({ archived_at: '2026-02-01T00:00:00Z' })];
    renderTemplates();

    // "Ativos" é o padrão: o arquivado não aparece até o filtro mudar.
    expect(screen.queryByRole('button', { name: 'Desarquivar' })).toBeNull();

    abrirSelect(screen.getByRole('combobox', { name: 'Ativos' }));
    fireEvent.click(screen.getByRole('option', { name: 'Arquivados' }));

    fireEvent.click(screen.getByRole('button', { name: 'Desarquivar' }));
    expect(h.archive).toHaveBeenCalledWith({ id: 'tpl-1', archived: false });
  });

  it('a lista ativa esconde o arquivado e "Arquivados" mostra só ele', () => {
    h.templates = [tpl({ id: 'ativo', name: 'Ativo da vez' }), tpl({ id: 'velho', name: 'Guardado no tempo', archived_at: '2026-02-01T00:00:00Z' })];
    renderTemplates();

    expect(screen.getByText('Ativo da vez')).toBeTruthy();
    expect(screen.queryByText('Guardado no tempo')).toBeNull();

    abrirSelect(screen.getByRole('combobox', { name: 'Ativos' }));
    fireEvent.click(screen.getByRole('option', { name: 'Arquivados' }));

    expect(screen.getByText('Guardado no tempo')).toBeTruthy();
    expect(screen.queryByText('Ativo da vez')).toBeNull();
  });
});

describe('N-127 — janela de teste do template', () => {
  it('envia pelo connectionId da conexão conectada e mostra o resultado', async () => {
    h.templates = [tpl()];
    renderTemplates();

    fireEvent.click(screen.getByRole('button', { name: 'Testar' }));
    expect(screen.getByRole('dialog', { name: 'Testar template' })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Número de destino'), { target: { value: '(41) 99999-8888' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar/ }));

    await waitFor(() => expect(h.testTemplate).toHaveBeenCalledTimes(1));
    expect(h.testTemplate.mock.calls[0][0]).toMatchObject({
      connectionId: 'conn-1',
      phone: '41999998888',
      templateContent: 'Olá {{nome}}',
      customVariables: ['nome'],
    });
    await waitFor(() => expect(screen.getByText('Mensagem enviada para 41999998888')).toBeTruthy());
  });

  it('sem conexão conectada avisa e não deixa enviar', () => {
    h.templates = [tpl()];
    h.connections = [];
    renderTemplates();

    fireEvent.click(screen.getByRole('button', { name: 'Testar' }));

    expect(screen.getByText(/Nenhuma conexão conectada/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Número de destino'), { target: { value: '41999998888' } });
    expect(screen.getByRole('button', { name: /Enviar/ })).toBeDisabled();
  });

  it('o erro do edge chega na janela em vez de virar sucesso', async () => {
    h.templates = [tpl()];
    h.testTemplate.mockRejectedValue(new Error('Limite de 5 testes em 10 minutos'));
    renderTemplates();

    fireEvent.click(screen.getByRole('button', { name: 'Testar' }));
    fireEvent.change(screen.getByLabelText('Número de destino'), { target: { value: '41999998888' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar/ }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Limite de 5 testes em 10 minutos'));
  });
});
/**
 * Anexo que falha não pode sumir (auditoria de paridade V3 → V2, doc chat-2):
 * o diálogo fechava ANTES do envio (fluxo único) e com `setTimeout(handleClose, 1000)`
 * (lote), descartando arquivo e legenda e deixando o cache de uploads pendentes
 * (`pendingUploadsRef`, R2-INB-006) órfão. Agora:
 *  - falha única mantém o diálogo, o arquivo e a legenda, e "Enviar" de novo reusa o
 *    MESMO objeto e o MESMO client_message_id (sem novo upload, sem ação nova);
 *  - lote parcial mantém na fila só os que falharam, com "Tentar de novo" por item e
 *    um "Tentar de novo (N)" para todos os que falharam;
 *  - lote 100% entregue fecha o diálogo;
 *  - desmonte libera as URLs de prévia (revokeObjectURL) e cancela os temporizadores
 *    do lote (nada de setState depois de sair).
 * Prova por comportamento: renderiza o componente REAL e clica no que o usuário clica.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FileUploader } from '@/components/inbox/FileUploader';
import { TooltipProvider } from '@/components/ui/tooltip';

const mocks = vi.hoisted(() => ({
  storageFrom: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
  remove: vi.fn(),
  tableFrom: vi.fn(),
  sendOutboundMessage: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastWarning: vi.fn(),
  reduceMotion: false,
}));

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => mocks.reduceMotion };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: { from: mocks.storageFrom },
    from: mocks.tableFrom,
  },
}));

vi.mock('@/services/outbound-message.service', () => ({
  sendOutboundMessage: mocks.sendOutboundMessage,
}));

vi.mock('sonner', () => ({
  toast: {
    info: mocks.toastInfo,
    success: mocks.toastSuccess,
    error: mocks.toastError,
    warning: mocks.toastWarning,
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

const CONTACT_ID = 'contato-1';
const LOCATOR_URL = 'https://project.test/storage/v1/object/public/whatsapp-media/locator';
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

function pdf(name: string) {
  return new File(['x'], name, { type: 'application/pdf' });
}

function reconcileChain(result: { data: unknown; error: unknown }) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    limit: () => Promise.resolve(result),
  };
  return chain;
}

function renderUploader() {
  return render(
    <TooltipProvider>
      <FileUploader contactId={CONTACT_ID} />
    </TooltipProvider>,
  );
}

function chooseFiles(container: HTMLElement, files: File[]) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files } });
}

const sentOk = { id: 'msg-1', status: 'sent', externalId: 'ext-1', idempotent: false };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.reduceMotion = false;
  mocks.storageFrom.mockReturnValue({
    upload: mocks.upload,
    getPublicUrl: mocks.getPublicUrl,
    remove: mocks.remove,
  });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.getPublicUrl.mockReturnValue({ data: { publicUrl: LOCATOR_URL } });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.sendOutboundMessage.mockResolvedValue(sentOk);
  // Linha persistida: o cache de upload pendente é mantido para o retry (R2-INB-006).
  mocks.tableFrom.mockReturnValue(reconcileChain({ data: [{ id: 'msg-1' }], error: null }));
});

afterEach(() => {
  // resetAllMocks (não só clear): descarta implementações deixadas por um teste
  // e evita que uma chamada atrasada polua a contagem do teste seguinte.
  vi.resetAllMocks();
  vi.restoreAllMocks();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: originalCreateObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: originalRevokeObjectURL });
});

describe('FileUploader — envio que falha não descarta o anexo', () => {
  it('falha única mantém o diálogo e o retry reusa o mesmo objeto e id lógico', async () => {
    mocks.sendOutboundMessage
      .mockRejectedValueOnce(new Error('entrega indisponível'))
      .mockResolvedValueOnce({ ...sentOk, idempotent: true });

    const { container } = renderUploader();
    chooseFiles(container, [pdf('contrato.pdf')]);

    expect(screen.getByText('contrato.pdf')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^enviar$/i }));

    await waitFor(() => expect(mocks.sendOutboundMessage).toHaveBeenCalledTimes(1));

    // O diálogo continua aberto com o arquivo à vista — dá para tentar de novo.
    const heading = screen.getByRole('heading', { name: /enviar arquivo/i });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText('contrato.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^enviar$/i })).toBeEnabled();

    // Tentar de novo: mesmo objeto (nenhum upload novo) e mesmo client_message_id.
    fireEvent.click(screen.getByRole('button', { name: /^enviar$/i }));

    await waitFor(() => expect(screen.queryByRole('heading', { name: /enviar arquivo/i })).not.toBeInTheDocument());

    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.sendOutboundMessage).toHaveBeenCalledTimes(2);
    const [first] = mocks.sendOutboundMessage.mock.calls[0];
    const [second] = mocks.sendOutboundMessage.mock.calls[1];
    expect(second.clientMessageId).toBe(first.clientMessageId);
    expect(second.mediaUrl).toBe(first.mediaUrl);
  });

  it('lote parcial mantém na fila só os que falharam e o retry fecha ao concluir', async () => {
    mocks.sendOutboundMessage.mockImplementation((input: { content?: string }) =>
      input.content === 'falha.pdf'
        ? Promise.reject(new Error('fila cheia'))
        : Promise.resolve(sentOk),
    );

    const { container } = renderUploader();
    chooseFiles(container, [pdf('falha.pdf'), pdf('ok.pdf')]);

    fireEvent.click(screen.getByRole('button', { name: /enviar 2 arquivos/i }));

    const retryItem = await screen.findByRole('button', { name: 'Tentar de novo: falha.pdf' });
    // Espera o LOTE terminar (o item só fica habilitado com uploading=false) para não
    // disparar o retry enquanto a rodada ainda está em curso.
    await waitFor(() => expect(retryItem).toBeEnabled(), { timeout: 4000 });
    // O que foi enviado sai da fila; só o que falhou permanece, marcado em erro.
    expect(screen.getByText('falha.pdf')).toBeInTheDocument();
    expect(screen.getByText('Erro')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('ok.pdf')).not.toBeInTheDocument());
    expect(mocks.upload).toHaveBeenCalledTimes(2);
    expect(mocks.sendOutboundMessage).toHaveBeenCalledTimes(2);

    // Retry do item que falhou fecha o diálogo e não refaz o upload.
    mocks.sendOutboundMessage.mockResolvedValueOnce({ ...sentOk, idempotent: true });
    fireEvent.click(retryItem);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocks.upload).toHaveBeenCalledTimes(2);
    expect(mocks.sendOutboundMessage).toHaveBeenCalledTimes(3);
  });

  it('sucesso total fecha o diálogo sem deixar pendências', async () => {
    const { container } = renderUploader();
    chooseFiles(container, [pdf('um.pdf'), pdf('dois.pdf')]);

    fireEvent.click(screen.getByRole('button', { name: /enviar 2 arquivos/i }));

    await waitFor(() => expect(screen.queryByRole('heading', { name: /enviar 2 arquivos/i })).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /tentar de novo/i })).not.toBeInTheDocument();
    expect(mocks.sendOutboundMessage).toHaveBeenCalledTimes(2);
  });

  it('"Tentar de novo" para todos reenvia só os que falharam e fecha ao concluir', async () => {
    mocks.sendOutboundMessage.mockRejectedValue(new Error('fila cheia'));

    const { container } = renderUploader();
    chooseFiles(container, [pdf('a.pdf'), pdf('b.pdf')]);
    fireEvent.click(screen.getByRole('button', { name: /enviar 2 arquivos/i }));

    const retryAll = await screen.findByRole('button', { name: /tentar de novo \(2\)/i });
    await waitFor(() => expect(retryAll).toBeEnabled(), { timeout: 4000 });
    // Nada foi entregue: os dois ficam na fila em erro.
    expect(screen.getByText('a.pdf')).toBeInTheDocument();
    expect(screen.getByText('b.pdf')).toBeInTheDocument();
    expect(mocks.upload).toHaveBeenCalledTimes(2);
    expect(mocks.sendOutboundMessage).toHaveBeenCalledTimes(2);

    mocks.sendOutboundMessage.mockResolvedValue(sentOk);
    fireEvent.click(retryAll);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // Reenvio reusa os uploads pendentes: nenhum objeto novo subiu.
    expect(mocks.upload).toHaveBeenCalledTimes(2);
    expect(mocks.sendOutboundMessage).toHaveBeenCalledTimes(4);
  });

  it('desmonte libera as URLs de prévia ainda vivas', async () => {
    const createObjectURL = vi.fn(() => 'blob:preview-1');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: revokeObjectURL });

    const { container, unmount } = renderUploader();
    chooseFiles(container, [pdf('previa.pdf')]);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
  });

  it('com movimento reduzido o lote mostra erro e o retry funciona sem descartar o item', async () => {
    mocks.reduceMotion = true;
    mocks.sendOutboundMessage.mockImplementation((input: { content?: string }) =>
      input.content === 'reduzido.pdf'
        ? Promise.reject(new Error('fila cheia'))
        : Promise.resolve(sentOk),
    );

    const { container } = renderUploader();
    chooseFiles(container, [pdf('reduzido.pdf'), pdf('ok-reduzido.pdf')]);

    fireEvent.click(screen.getByRole('button', { name: /enviar 2 arquivos/i }));

    const retryItem = await screen.findByRole('button', { name: 'Tentar de novo: reduzido.pdf' });
    await waitFor(() => expect(retryItem).toBeEnabled(), { timeout: 4000 });
    expect(screen.getByText('reduzido.pdf')).toBeInTheDocument();
    expect(screen.getByText('Erro')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('ok-reduzido.pdf')).not.toBeInTheDocument());

    mocks.sendOutboundMessage.mockResolvedValueOnce({ ...sentOk, idempotent: true });
    fireEvent.click(retryItem);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocks.upload).toHaveBeenCalledTimes(2);
    expect(mocks.sendOutboundMessage).toHaveBeenCalledTimes(3);
  });
});

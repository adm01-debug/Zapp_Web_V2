/**
 * PK-27 (auditoria de paridade V3 → V2, doc chat-1, achados N7): a barra de progresso do
 * FileUploader era código morto — `uploadProgress`/`uploadStage` existiam e nunca eram
 * atualizados (o diálogo ficava sem nenhuma indicação durante o upload) e o toast de erro
 * sumia no prazo padrão, sem retentativa.
 *
 * O que este teste prova, pela TELA e pelo componente REAL:
 *  1. a barra segue o evento REAL de bytes do upload: a requisição consome o corpo do
 *     arquivo como stream (`duplex: 'half'`, suportado pelo Storage SDK) e cada pedaço
 *     consumido aparece em `role="progressbar"` / `aria-valuenow` e no texto do diálogo;
 *  2. o aviso de "Enviando arquivo..." não expira sozinho (`duration: Infinity`);
 *  3. na falha, o arquivo continua na tela, o toast de erro fica 8 s e a ação
 *     "Tentar de novo" reenvia de verdade — sem refazer o upload (R2-INB-006).
 *
 * Nota de ambiente: o `Blob` do jsdom não implementa `stream()` (todos os navegadores
 * usados no produto implementam). O arquivo de teste recebe a implementação real do
 * navegador por `Object.defineProperty`, e o upload mockado lê esse stream exatamente como
 * o `fetch` do Storage SDK lê — é o consumo real dos bytes que move a barra.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
}));

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => false };
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
}));

const CONTACT_ID = 'contato-1';
const LOCATOR_URL = 'https://project.test/storage/v1/object/public/whatsapp-media/locator';
const sentOk = { id: 'msg-1', status: 'sent', externalId: 'ext-1', idempotent: false };

function pdf(name: string) {
  return new File(['x'], name, { type: 'application/pdf' });
}

/**
 * Arquivo com o `stream()` de verdade (o que qualquer navegador do produto tem): dois
 * pedaços de 8 bytes, então o primeiro consumo já reporta 50% do total.
 */
function pdfEmStream(name: string) {
  const chunks = [new Uint8Array(8), new Uint8Array(8)];
  const file = new File(chunks, name, { type: 'application/pdf' });
  Object.defineProperty(file, 'stream', {
    configurable: true,
    value: () => new ReadableStream<Uint8Array>({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(chunk));
        controller.close();
      },
    }),
  });
  return file;
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

/** Última chamada do toast de erro, na forma (mensagem, opções). */
function ultimoToastDeErro(): [string, { duration?: number; action?: { label: string; onClick: () => void } }] {
  const calls = mocks.toastError.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1] as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.storageFrom.mockReturnValue({
    upload: mocks.upload,
    getPublicUrl: mocks.getPublicUrl,
    remove: mocks.remove,
  });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.getPublicUrl.mockReturnValue({ data: { publicUrl: LOCATOR_URL } });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.sendOutboundMessage.mockResolvedValue(sentOk);
  mocks.tableFrom.mockReturnValue(reconcileChain({ data: [{ id: 'msg-1' }], error: null }));
});

afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

describe('FileUploader — progresso real do upload e falha que fica na tela', () => {
  it('a barra acompanha os bytes que o upload consome (role=progressbar, valor atual)', async () => {
    let liberarUpload: () => void = () => {};
    const seguraUpload = new Promise<void>((resolve) => { liberarUpload = resolve; });

    mocks.upload.mockImplementation(async (_path: string, body: unknown) => {
      const reader = (body as ReadableStream<Uint8Array>).getReader();
      await reader.read(); // primeiro pedaço consumido: o progresso real já foi reportado
      await seguraUpload;  // upload no meio do caminho
      while (!(await reader.read()).done) { /* consome o resto */ }
      return { error: null };
    });

    const { container } = renderUploader();
    chooseFiles(container, [pdfEmStream('grande.pdf')]);
    fireEvent.click(screen.getByRole('button', { name: /^enviar$/i }));

    // A barra existe, é acessível e mostra o valor do pedaço já consumido (1 de 2 = 50%).
    const barra = await screen.findByRole('progressbar', { name: 'Progresso de grande.pdf' });
    await waitFor(() => expect(barra).toHaveAttribute('aria-valuenow', '50'));
    expect(screen.getByText('Fazendo upload... 50%')).toBeInTheDocument();
    // O aviso de envio não expira sozinho no meio de um arquivo grande.
    expect(mocks.toastInfo).toHaveBeenCalledWith(
      'Enviando arquivo...',
      expect.objectContaining({ id: 'file-upload', duration: Infinity }),
    );

    await act(async () => { liberarUpload(); });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('falha única mantém o arquivo na tela e o toast de erro oferece "Tentar de novo"', async () => {
    mocks.sendOutboundMessage
      .mockRejectedValueOnce(new Error('entrega indisponível'))
      .mockResolvedValueOnce(sentOk);

    const { container } = renderUploader();
    chooseFiles(container, [pdf('contrato.pdf')]);
    fireEvent.click(screen.getByRole('button', { name: /^enviar$/i }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    // O anexo não é descartado: continua à vista com o botão habilitado.
    expect(screen.getByText('contrato.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^enviar$/i })).toBeEnabled();

    const [mensagem, opcoes] = ultimoToastDeErro();
    expect(mensagem).toContain('entrega indisponível');
    expect(opcoes.duration).toBe(8000);
    expect(opcoes.action?.label).toBe('Tentar de novo');

    // A ação do toast reenvia de verdade, reusando o MESMO objeto (nenhum upload novo).
    await act(async () => { opcoes.action?.onClick(); });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocks.sendOutboundMessage).toHaveBeenCalledTimes(2);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
  });

  it('no lote, o que falhou fica na lista e o toast de erro retenta pelo mesmo caminho', async () => {
    mocks.sendOutboundMessage.mockImplementation((input: { content?: string }) =>
      input.content === 'falha.pdf'
        ? Promise.reject(new Error('fila cheia'))
        : Promise.resolve(sentOk),
    );

    const { container } = renderUploader();
    chooseFiles(container, [pdf('falha.pdf'), pdf('ok.pdf')]);
    fireEvent.click(screen.getByRole('button', { name: /enviar 2 arquivos/i }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled(), { timeout: 6000 });
    const [mensagem, opcoes] = ultimoToastDeErro();
    expect(mensagem).toContain('1 arquivo(s) falharam');
    expect(opcoes.duration).toBe(8000);
    expect(opcoes.action?.label).toBe('Tentar de novo');

    // Só o que falhou sobra na lista, marcado em erro — não some sozinho.
    expect(screen.getByText('falha.pdf')).toBeInTheDocument();
    expect(screen.getByText('Erro')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('ok.pdf')).not.toBeInTheDocument());

    // O "Tentar de novo" do toast reenvia o que ficou na fila e fecha ao concluir.
    mocks.sendOutboundMessage.mockResolvedValue(sentOk);
    await act(async () => { opcoes.action?.onClick(); });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(), { timeout: 6000 });
    expect(mocks.upload).toHaveBeenCalledTimes(2);
    expect(mocks.sendOutboundMessage).toHaveBeenCalledTimes(3);
  });
});

/**
 * N-039 — Acessibilidade: botões remover/fechar e barras de progresso
 * com aria-label que identifica o arquivo.
 *
 * Prova (vermelho antes / verde depois):
 * - axe(document.body) zerado no diálogo com upload em andamento
 * - botão remover tem aria-label "Remover <nome>"
 * - botão fechar tem aria-label "Fechar envio"
 * - progressbar da fila tem nome com o arquivo
 * - progressbar total tem nome "Progresso total"
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { FileUploader } from '@/components/inbox/FileUploader';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useFileUploadLogic } from '@/components/inbox/useFileUploadLogic';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: { from: vi.fn() },
    from: vi.fn(),
  },
}));

vi.mock('@/services/outbound-message.service', () => ({
  sendOutboundMessage: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() })},
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) }),
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) }),
}));

vi.mock('@/components/inbox/useFileUploadLogic', () => ({
  useFileUploadLogic: vi.fn(),
}));

function pdf(name: string) {
  return new File(['x'], name, { type: 'application/pdf' });
}

function mockHook(returnValue: Record<string, unknown>) {
  vi.mocked(useFileUploadLogic).mockReturnValue(returnValue as never);
}

function renderUploader() {
  return render(
    <TooltipProvider>
      <FileUploader contactId="contato-1" />
    </TooltipProvider>,
  );
}

const baseQueue = (files: File[]) =>
  files.map((f, i) => ({
    id: `q${i}`,
    file: f,
    status: 'pending' as const,
    progress: 0,
    validation: { valid: true, category: 'document' as const },
    preview: null,
  }));

function hookReturn(overrides?: Record<string, unknown>) {
  return {
    isDialogOpen: true,
    filePreview: null,
    fileQueue: baseQueue([pdf('documento.pdf')]),
    isMultiMode: true,
    caption: '',
    setCaption: vi.fn(),
    uploading: false,
    uploadProgress: 0,
    uploadStage: 'idle' as const,
    currentQueueIndex: 0,
    apiLoading: false,
    canSend: true,
    validFilesCount: 1,
    totalQueueProgress: 0,
    handleClose: vi.fn(),
    handleSendFile: vi.fn(),
    handleSendAllFiles: vi.fn(),
    handleFileChange: vi.fn(),
    handleExternalFile: vi.fn(),
    handleExternalFiles: vi.fn(),
    removeFromQueue: vi.fn(),
    ...overrides,
  };
}

// ── N-039: nomes acessíveis em botões e progressbar ──────────────────

describe('FileUploader — N-039: nomes acessíveis em botões e progressbar', () => {
  it('axe zerado no diálogo do FileUploader (upload em andamento)', async () => {
    mockHook(hookReturn({ uploading: true, uploadProgress: 55 }));

    renderUploader();
    const results = await axe(document.body);
    expect(results).toHaveNoViolations();
  });

  it('botão remover na fila tem aria-label "Remover <arquivo>"', () => {
    mockHook(hookReturn());

    renderUploader();

    expect(screen.getByRole('button', { name: /remover documento\.pdf/i })).toBeInTheDocument();
  });

  it('botão fechar no preview simples tem aria-label "Fechar envio"', () => {
    mockHook(
      hookReturn({
        filePreview: {
          file: pdf('contrato.pdf'),
          validation: { valid: true, category: 'document' },
          preview: null,
        },
        fileQueue: [],
        isMultiMode: false,
      }),
    );

    renderUploader();

    expect(screen.getByRole('button', { name: /fechar envio/i })).toBeInTheDocument();
  });

  it('cada progressbar da fila tem nome com o arquivo', () => {
    mockHook(
      hookReturn({
        fileQueue: [
          {
            id: 'q1',
            file: pdf('prova.pdf'),
            status: 'uploading',
            progress: 42,
            validation: { valid: true, category: 'document' },
            preview: null,
          },
        ],
        uploading: true,
        uploadProgress: 42,
        uploadStage: 'uploading',
      }),
    );

    renderUploader();

    expect(screen.getByRole('progressbar', { name: /progresso de prova\.pdf/i })).toBeInTheDocument();
  });

  it('progressbar do envio total tem nome "Progresso total"', () => {
    mockHook(
      hookReturn({
        fileQueue: [
          {
            id: 'q1',
            file: pdf('a.pdf'),
            status: 'uploading',
            progress: 30,
            validation: { valid: true, category: 'document' },
            preview: null,
          },
          {
            id: 'q2',
            file: pdf('b.pdf'),
            status: 'uploading',
            progress: 60,
            validation: { valid: true, category: 'image' },
            preview: null,
          },
        ],
        uploading: true,
        uploadProgress: 45,
        uploadStage: 'uploading',
      }),
    );

    renderUploader();

    expect(screen.getByRole('progressbar', { name: /progresso total/i })).toBeInTheDocument();
  });
});
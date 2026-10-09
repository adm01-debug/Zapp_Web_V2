/**
 * R2-INB-011 / item 308 — "Seletor de anexos permite seleção múltipla mas
 * aproveita somente o primeiro".
 *
 * O input nativo do FileUploader tem `multiple`, mas `handleFileChange`
 * aproveitava só `e.target.files?.[0]`: o segundo arquivo em diante sumia
 * sem aviso. O caminho alternativo (drag/paste/chip) já usava a fila de
 * múltiplos (`handleExternalFiles`).
 *
 * Prova (vermelho antes / verde depois): selecionar DOIS arquivos no diálogo
 * nativo precisa colocar os DOIS na fila de envio — a tela mostra os dois
 * nomes e o título "Enviar 2 Arquivos" (não um preview único do primeiro).
 *
 * Acessibilidade (N-039): botões de remover e fechar com aria-label; barras
 * de progresso com nome acessível que identifica o arquivo.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
  log: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
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

describe('FileUploader — R2-INB-011: input multiple aproveita todos os arquivos', () => {
  it('coloca todos os arquivos escolhidos na fila de múltiplos, não só o primeiro', () => {
    mockHook({
      isDialogOpen: true,
      filePreview: null,
      fileQueue: baseQueue([pdf('primeiro.pdf'), pdf('segundo.pdf')]),
      isMultiMode: true,
      caption: '',
      setCaption: vi.fn(),
      uploading: false,
      uploadProgress: 0,
      uploadStage: 'idle',
      currentQueueIndex: 0,
      apiLoading: false,
      canSend: true,
      validFilesCount: 2,
      totalQueueProgress: 0,
      handleClose: vi.fn(),
      handleSendFile: vi.fn(),
      handleSendAllFiles: vi.fn(),
      handleFileChange: vi.fn(),
      handleExternalFile: vi.fn(),
      handleExternalFiles: vi.fn(),
      removeFromQueue: vi.fn(),
    });

    const { container } = renderUploader();

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toHaveAttribute('multiple');

    expect(screen.getByText('primeiro.pdf')).toBeInTheDocument();
    expect(screen.getByText('segundo.pdf')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /enviar 2 arquivos/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enviar 2 arquivos/i })).toBeEnabled();
  });

  it('um único arquivo selecionado segue no preview simples', () => {
    mockHook({
      isDialogOpen: true,
      filePreview: {
        file: pdf('so-um.pdf'),
        validation: { valid: true, category: 'document' },
        preview: null,
      },
      fileQueue: [],
      isMultiMode: false,
      caption: '',
      setCaption: vi.fn(),
      uploading: false,
      uploadProgress: 0,
      uploadStage: 'idle',
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
    });

    const { container } = renderUploader();

    expect(screen.getByText('so-um.pdf')).toBeInTheDocument();
    expect(screen.getByText(/^enviar arquivo$/i)).toBeInTheDocument();
  });
});

// ── N-039: acessibilidade dos botões e barras de progresso ──────────────────────

describe('FileUploader — N-039: nomes acessíveis em botões e progressbar', () => {
  it('botão remover na fila tem aria-label "Remover <arquivo>"', () => {
    mockHook({
      isDialogOpen: true,
      filePreview: null,
      fileQueue: baseQueue([pdf('relatorio.pdf')]),
      isMultiMode: true,
      caption: '',
      setCaption: vi.fn(),
      uploading: false,
      uploadProgress: 0,
      uploadStage: 'idle',
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
    });

    const { container } = renderUploader();

    expect(screen.getByRole('button', { name: /remover relatorio\.pdf/i })).toBeInTheDocument();
  });

  it('botão fechar no preview simples tem aria-label "Fechar envio"', () => {
    mockHook({
      isDialogOpen: true,
      filePreview: {
        file: pdf('contrato.pdf'),
        validation: { valid: true, category: 'document' },
        preview: null,
      },
      fileQueue: [],
      isMultiMode: false,
      caption: '',
      setCaption: vi.fn(),
      uploading: false,
      uploadProgress: 0,
      uploadStage: 'idle',
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
    });

    const { container } = renderUploader();

    expect(screen.getByRole('button', { name: /fechar envio/i })).toBeInTheDocument();
  });

  it('cada progressbar da fila tem nome com o arquivo', () => {
    mockHook({
      isDialogOpen: true,
      filePreview: null,
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
      isMultiMode: true,
      caption: '',
      setCaption: vi.fn(),
      uploading: true,
      uploadProgress: 42,
      uploadStage: 'uploading',
      currentQueueIndex: 0,
      apiLoading: false,
      canSend: true,
      validFilesCount: 1,
      totalQueueProgress: 42,
      handleClose: vi.fn(),
      handleSendFile: vi.fn(),
      handleSendAllFiles: vi.fn(),
      handleFileChange: vi.fn(),
      handleExternalFile: vi.fn(),
      handleExternalFiles: vi.fn(),
      removeFromQueue: vi.fn(),
    });

    const { container } = renderUploader();

    expect(screen.getByRole('progressbar', { name: /progresso de prova\.pdf/i })).toBeInTheDocument();
  });

  it('progressbar do envio total tem nome "Progresso total"', () => {
    mockHook({
      isDialogOpen: true,
      filePreview: null,
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
      isMultiMode: true,
      caption: '',
      setCaption: vi.fn(),
      uploading: true,
      uploadProgress: 45,
      uploadStage: 'uploading',
      currentQueueIndex: 0,
      apiLoading: false,
      canSend: true,
      validFilesCount: 2,
      totalQueueProgress: 45,
      handleClose: vi.fn(),
      handleSendFile: vi.fn(),
      handleSendAllFiles: vi.fn(),
      handleFileChange: vi.fn(),
      handleExternalFile: vi.fn(),
      handleExternalFiles: vi.fn(),
      removeFromQueue: vi.fn(),
    });

    const { container } = renderUploader();

    expect(screen.getByRole('progressbar', { name: /progresso total/i })).toBeInTheDocument();
  });
});

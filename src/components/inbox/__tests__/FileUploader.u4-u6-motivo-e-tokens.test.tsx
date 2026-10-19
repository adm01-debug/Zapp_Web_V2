/**
 * U4/U5/U6 da auditoria de anexos (doc 4) — três defeitos de tela:
 *
 *  U4  motivo da falha/arquivo inválido em TEXTO (não só o selo), Esc/clique-fora
 *      bloqueados durante o upload, alvo do botão remover com 40px, e um resumo
 *      em região viva ("2 de 3 enviados, 1 falhou").
 *  U5  nomes acessíveis em português (sem alt="Preview" / title="PDF Preview" /
 *      alt="Sticker").
 *  U6  zero cor literal (hex/rgb()/hsl() cru) nos 5 pontos; tokens do sistema.
 *
 * A prova de comportamento renderiza o componente REAL do FileUploader (o hook de
 * upload é trocado pelo dublê). A varredura de literais lê o arquivo de produção —
 * é o que o cartão pede como critério ("grep sem ocorrência").
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { FileUploader } from '@/components/inbox/FileUploader';
import { ReplyPreview } from '@/components/inbox/ReplyQuote';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useFileUploadLogic } from '@/components/inbox/useFileUploadLogic';
import type { Message } from '@/types/chat';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { storage: { from: vi.fn() }, from: vi.fn() },
}));
vi.mock('@/services/outbound-message.service', () => ({ sendOutboundMessage: vi.fn() }));
vi.mock('@/lib/logger', () => ({ log: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() } ,
  getLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })) })),
  createLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })) })),
}));
vi.mock('@/components/inbox/useFileUploadLogic', () => ({ useFileUploadLogic: vi.fn() }));
vi.mock('@/hooks/storage/useResolvedStorageUrl', () => ({
  useResolvedStorageUrl: (url: string) => ({ url }),
}));

const raiz = path.resolve(__dirname, '../../..'); // => src
const fonte = (rel: string) => readFileSync(path.join(raiz, rel), 'utf8');

function arquivo(name: string, type = 'application/pdf') {
  return new File(['x'], name, { type });
}

function mockHook(returnValue: Record<string, unknown>) {
  vi.mocked(useFileUploadLogic).mockReturnValue(returnValue as never);
}

function hookReturn(overrides?: Record<string, unknown>) {
  return {
    isDialogOpen: true,
    filePreview: null,
    fileQueue: [],
    isMultiMode: true,
    caption: '',
    setCaption: vi.fn(),
    uploading: false,
    uploadProgress: 0,
    uploadStage: 'idle' as const,
    currentQueueIndex: 0,
    apiLoading: false,
    canSend: true,
    validFilesCount: 0,
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

function renderUploader() {
  return render(
    <TooltipProvider>
      <FileUploader contactId="contato-1" />
    </TooltipProvider>,
  );
}

// ── U4: motivo em texto ────────────────────────────────────────────────

describe('U4 — o motivo da falha aparece em texto na fila', () => {
  it('mostra o motivo do upload que falhou, não só o selo "Erro"', () => {
    mockHook(hookReturn({
      fileQueue: [{
        id: 'q1',
        file: arquivo('foto.png', 'image/png'),
        status: 'error',
        progress: 0,
        error: 'Conexão caiu no meio do envio',
        validation: { valid: true, category: 'image' },
        preview: null,
      }],
      validFilesCount: 1,
    }));

    renderUploader();

    expect(screen.getByText('Conexão caiu no meio do envio')).toBeInTheDocument();
  });

  it('mostra o motivo do arquivo inválido (limite/tipo) também na fila', () => {
    mockHook(hookReturn({
      fileQueue: [{
        id: 'q1',
        file: arquivo('filme.mp4', 'video/mp4'),
        status: 'pending',
        progress: 0,
        validation: { valid: false, error: 'Vídeo acima de 16 MB' },
        preview: null,
      }],
    }));

    renderUploader();

    expect(screen.getByText('Vídeo acima de 16 MB')).toBeInTheDocument();
  });
});

// ── U4: Esc/clique fora bloqueados durante o upload ────────────────────

describe('U4 — Esc e clique fora não descartam o envio em andamento', () => {
  it('com uploading=true, Esc NÃO fecha o diálogo', () => {
    const handleClose = vi.fn();
    mockHook(hookReturn({ uploading: true, uploadStage: 'uploading', handleClose }));

    renderUploader();
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

    expect(handleClose).not.toHaveBeenCalled();
  });

  it('sem upload em andamento, Esc fecha o diálogo', () => {
    const handleClose = vi.fn();
    mockHook(hookReturn({ uploading: false, handleClose }));

    renderUploader();
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});

// ── U4: alvo do botão remover e resumo em região viva ──────────────────

describe('U4 — alvo de toque e resumo acessível', () => {
  it('o botão remover da fila tem 40px (h-10 w-10)', () => {
    mockHook(hookReturn({
      fileQueue: [{
        id: 'q1',
        file: arquivo('contrato.pdf'),
        status: 'pending',
        progress: 0,
        validation: { valid: true, category: 'document' },
        preview: null,
      }],
      validFilesCount: 1,
    }));

    renderUploader();

    const botao = screen.getByRole('button', { name: /remover contrato\.pdf/i });
    expect(botao.className).toContain('h-10');
    expect(botao.className).toContain('w-10');
  });

  it('a região viva resume a fila ("2 de 3 enviados, 1 falhou")', () => {
    mockHook(hookReturn({
      fileQueue: [
        { id: 'q1', file: arquivo('a.pdf'), status: 'done', progress: 100, validation: { valid: true, category: 'document' }, preview: null },
        { id: 'q2', file: arquivo('b.pdf'), status: 'done', progress: 100, validation: { valid: true, category: 'document' }, preview: null },
        { id: 'q3', file: arquivo('c.pdf'), status: 'error', progress: 0, error: 'Falha no envio', validation: { valid: true, category: 'document' }, preview: null },
      ],
      validFilesCount: 3,
    }));

    renderUploader();

    const regiao = screen.getByRole('status');
    expect(regiao.textContent).toBe('2 de 3 enviados, 1 falhou');
  });
});

// ── U5: nomes acessíveis em português (prova por render) ───────────────

describe('U5 — nome acessível em português', () => {
  it('o FileUploader nomeia a pré-visualização com o nome do arquivo', () => {
    mockHook(hookReturn({
      isMultiMode: false,
      fileQueue: [],
      filePreview: {
        file: arquivo('foto.png', 'image/png'),
        validation: { valid: true, category: 'image' },
        preview: 'blob:foto',
      },
    }));

    renderUploader();

    expect(screen.getByAltText('Pré-visualização de foto.png')).toBeInTheDocument();
  });

  it('o FileUploader nomeia o PDF com o nome do arquivo', () => {
    mockHook(hookReturn({
      isMultiMode: false,
      fileQueue: [],
      filePreview: {
        file: arquivo('contrato.pdf'),
        validation: { valid: true, category: 'document' },
        preview: 'blob:contrato',
      },
    }));

    renderUploader();

    expect(screen.getByTitle('Pré-visualização do PDF contrato.pdf')).toBeInTheDocument();
  });

  it('a citação da resposta descreve a imagem em português', () => {
    const mensagem = {
      id: 'm1',
      sender: 'contact',
      type: 'image',
      content: 'Legenda',
      mediaUrl: 'https://exemplo/imagem.jpg',
    } as unknown as Message;

    render(<ReplyPreview message={mensagem} onCancel={vi.fn()} />);

    expect(screen.getByAltText('Pré-visualização da imagem respondida')).toBeInTheDocument();
  });
});

// ── U5/U6: varredura de literais (o critério do cartão é "grep sem ocorrência")

describe('U5/U6 — nenhum literal cru nos arquivos da trilha', () => {
  it('U5: sem alt="Preview" / title="PDF Preview" / alt="Sticker"', () => {
    for (const rel of [
      'components/inbox/FileUploader.tsx',
      'components/inbox/ReplyQuote.tsx',
      'components/inbox/CustomEmojiPicker.tsx',
      'components/inbox/MediaPreview.tsx',
    ]) {
      const src = fonte(rel);
      expect(src, rel).not.toMatch(/alt="Preview"/);
      expect(src, rel).not.toMatch(/title="PDF Preview"/);
      expect(src, rel).not.toMatch(/alt="Sticker"/);
    }
    expect(fonte('components/inbox/MediaPreview.tsx')).toMatch(/alt="Figurinha"/);
    expect(fonte('components/inbox/CustomEmojiPicker.tsx')).toMatch(/Pré-visualização de/);
  });

  it('U6: messageUtils usa text-info, sem #53bdeb', () => {
    const src = fonte('components/inbox/chat/messageUtils.tsx');
    expect(src).not.toMatch(/#53bdeb/);
    expect(src).toMatch(/text-info/);
  });

  it('U6: favoritos usam fill-warning, sem yellow-400', () => {
    for (const rel of [
      'components/inbox/quick-replies/QuickReplyCardList.tsx',
      'components/inbox/QuickRepliesManager.tsx',
    ]) {
      const src = fonte(rel);
      expect(src, rel).not.toMatch(/yellow-400/);
    }
    expect(fonte('components/inbox/quick-replies/QuickReplyCardList.tsx')).toMatch(/fill-warning/);
    expect(fonte('components/inbox/QuickRepliesManager.tsx')).toMatch(/fill-warning/);
  });

  it('U6: o gráfico de sentimento usa tokens, sem rgb()', () => {
    const src = fonte('components/inbox/ai-tools/SentimentTab.tsx');
    expect(src).not.toMatch(/rgb\(/);
    expect(src).toMatch(/hsl\(var\(--success\)/);
    expect(src).toMatch(/hsl\(var\(--destructive\)/);
  });

  it('U6: os selos de canal usam tokens, sem hsl() cru', () => {
    const src = fonte('components/inbox/VirtualizedRealtimeList.tsx');
    expect(src).not.toMatch(/hsl\(\s*\d/);
    expect(src).toMatch(/bg-violeta/);
    expect(src).toMatch(/bg-info/);
  });

});

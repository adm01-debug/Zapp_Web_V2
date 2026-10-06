/**
 * R2-INB-011 / item 308 — "Seletor de anexos permite seleção múltipla mas aproveita
 * somente o primeiro".
 *
 * O input nativo do FileUploader tem `multiple`, mas `handleFileChange` aproveitava
 * só `e.target.files?.[0]`: o segundo arquivo em diante sumia sem aviso. O caminho
 * alternativo (drag/paste/chip) já usava a fila de múltiplos (`handleExternalFiles`).
 *
 * Prova (vermelho antes / verde depois): selecionar DOIS arquivos no diálogo nativo
 * precisa colocar os DOIS na fila de envio — a tela mostra os dois nomes e o título
 * "Enviar 2 Arquivos" (não um preview único do primeiro).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileUploader } from '@/components/inbox/FileUploader';
import { TooltipProvider } from '@/components/ui/tooltip';

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

function pdf(name: string) {
  return new File(['x'], name, { type: 'application/pdf' });
}

function renderUploader() {
  return render(
    <TooltipProvider>
      <FileUploader contactId="contato-1" />
    </TooltipProvider>,
  );
}

describe('FileUploader — R2-INB-011: input multiple aproveita todos os arquivos', () => {
  it('coloca todos os arquivos escolhidos na fila de múltiplos, não só o primeiro', () => {
    const { container } = renderUploader();

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toHaveAttribute('multiple');

    fireEvent.change(input, {
      target: { files: [pdf('primeiro.pdf'), pdf('segundo.pdf')] },
    });

    // Os dois arquivos entram na fila (a tela usa o modo multi).
    expect(screen.getByText('primeiro.pdf')).toBeInTheDocument();
    expect(screen.getByText('segundo.pdf')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /enviar 2 arquivos/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enviar 2 arquivos/i })).toBeEnabled();
  });

  it('um único arquivo selecionado segue no preview simples', () => {
    const { container } = renderUploader();

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pdf('so-um.pdf')] } });

    expect(screen.getByText('so-um.pdf')).toBeInTheDocument();
    // Não virou fila: o título permanece o do modo simples.
    expect(screen.getByText(/^enviar arquivo$/i)).toBeInTheDocument();
  });
});

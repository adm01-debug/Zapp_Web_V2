/**
 * SL-202 — divida ESLint concentrada em src/components/inbox.
 *
 * Os 75 `react-hooks/refs` do modulo vinham de um unico ponto: o objeto devolvido por
 * `useFileUploadLogic` carregava a ref do `<input type="file">` escondido, e o compilador
 * do React trata esse resultado como ref-like — qualquer leitura de propriedade durante o
 * render virava "Cannot access refs during render" (linha 104 a 224 do FileUploader).
 *
 * Correcao: a ref e DO COMPONENTE e entra no hook por parametro (`fileInputRef`); o hook a
 * usa nos handlers mas nao a devolve.
 *
 * Prova de comportamento (o que o usuario faz): o botao "Anexar arquivo" continua acionando
 * o input de arquivo real (a ref esta ligada no DOM) e o arquivo escolhido continua entrando
 * no dialogo de envio. Isto renderiza o componente REAL, sem mock de ref.
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

describe('FileUploader — SL-202: ref do input pertence ao componente', () => {
  it('o botao "Anexar arquivo" aciona o input de arquivo real pela ref', () => {
    const { container } = renderUploader();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    const clicks = vi.fn();
    input.addEventListener('click', clicks);

    fireEvent.click(screen.getByRole('button', { name: /anexar arquivo/i }));

    expect(clicks).toHaveBeenCalledTimes(1);
  });

  it('o arquivo escolhido no input continua entrando no dialogo de envio', () => {
    const { container } = renderUploader();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [pdf('contrato.pdf')] } });

    expect(screen.getByRole('heading', { name: /enviar arquivo/i })).toBeInTheDocument();
    expect(screen.getByText('contrato.pdf')).toBeInTheDocument();
  });
});

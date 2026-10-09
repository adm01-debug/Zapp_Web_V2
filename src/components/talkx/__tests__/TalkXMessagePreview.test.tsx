import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * X088 — prévia de mensagem fiel ao WhatsApp (bolha do cartão e moldura do editor).
 *
 * Aceite da etapa (F08): `*a*` vira `<strong>`; `{{nome}}` cru no modo `raw` e o
 * valor em negrito no `resolved`; documento mostra o nome do arquivo; botões e
 * enquete aparecem; tela cheia abre e fecha por teclado.
 */

const { createSignedUrl } = vi.hoisted(() => ({ createSignedUrl: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { storage: { from: () => ({ createSignedUrl }) } },
}));

import { PhoneFrame, TalkXMessagePreview, WhatsAppBubble } from '../TalkXMessagePreview';
import { PhoneFrame as BarrelFrame, WhatsAppBubble as BarrelBubble } from '../kit/preview';

beforeEach(() => {
  createSignedUrl.mockReset();
  // Padrão: sem URL assinada (o teste do bucket troca por uma assinatura real).
  createSignedUrl.mockResolvedValue({ data: null, error: null });
});

describe('TalkXMessagePreview (X088)', () => {
  it('renderiza negrito, itálico, tachado, lista e link como no WhatsApp', () => {
    render(
      <TalkXMessagePreview
        text={'*Ana*\n_itálico_\n~riscado~\n- primeiro\n- segundo\nhttps://promobrindes.com.br'}
      />,
    );

    const preview = screen.getByTestId('talkx-preview');
    expect(preview.querySelector('strong')?.textContent).toBe('Ana');
    expect(preview.querySelector('em')?.textContent).toBe('itálico');
    expect(preview.querySelector('s')?.textContent).toBe('riscado');
    expect(preview.querySelectorAll('ul li')).toHaveLength(2);
    expect(preview.querySelectorAll('ul li')[0]).toHaveTextContent('primeiro');
    expect(preview.querySelector('a')?.getAttribute('href')).toBe('https://promobrindes.com.br');
    // nem os delimitadores nem o `- ` do marcador sobram no texto exibido
    expect(preview.textContent).not.toContain('*Ana*');
    expect(preview.textContent).not.toContain('- primeiro');
  });

  it('modo raw mostra a variável crua e o resolved mostra o valor em negrito', () => {
    const { rerender } = render(<TalkXMessagePreview text="Oi {{nome}}, falo com {{nome_completo}}" mode="raw" />);

    expect(screen.getAllByTestId('talkx-preview-variable').map((node) => node.textContent)).toEqual([
      '{{nome}}',
      '{{nome_completo}}',
    ]);
    expect(screen.queryByTestId('talkx-preview-variable-value')).toBeNull();

    rerender(<TalkXMessagePreview text="Oi {{nome}}, falo com {{nome_completo}}" mode="resolved" />);

    const values = screen.getAllByTestId('talkx-preview-variable-value');
    expect(values.map((node) => node.textContent)).toEqual(['João', 'João Silva']);
    expect(values.every((node) => node.tagName === 'STRONG')).toBe(true);
    // o token cru não pode sobrar no modo resolved
    expect(screen.queryByTestId('talkx-preview-variable')).toBeNull();
    expect(screen.queryByText('{{nome}}')).toBeNull();
  });

  it('imagem vira uma mensagem separada, com hora e confirmação de entrega', () => {
    render(
      <TalkXMessagePreview
        text="Segue a foto"
        mediaUrl="https://cdn.test/foto.png"
        mediaType="image"
        mediaFileName="foto.png"
        time="16:12"
      />,
    );

    const mediaBubble = screen.getByTestId('talkx-preview-media-bubble');
    expect(mediaBubble.querySelector('img')?.getAttribute('src')).toBe('https://cdn.test/foto.png');
    expect(mediaBubble.textContent).toContain('16:12');
    expect(mediaBubble.textContent).toContain('✓✓');
    // o texto sai na bolha dele, não junto da imagem
    expect(mediaBubble.textContent).not.toContain('Segue a foto');
    expect(screen.getByText('Segue a foto')).toBeInTheDocument();
  });

  it('documento mostra o nome e o tamanho do arquivo', () => {
    render(
      <TalkXMessagePreview
        text=""
        mediaUrl="2026/10/relatorio.pdf"
        mediaType="document"
        mediaFileName="relatorio.pdf"
        mediaSizeBytes={2048}
      />,
    );

    const document_ = screen.getByTestId('talkx-preview-document');
    expect(document_).toHaveTextContent('relatorio.pdf');
    expect(document_).toHaveTextContent('2 KB');
  });

  it('áudio mostra a barra e avisa que o texto não acompanha o arquivo', () => {
    render(<TalkXMessagePreview text="ouça isso" mediaUrl="2026/10/voz.ogg" mediaType="audio" />);

    expect(screen.getByTestId('talkx-preview-audio')).toHaveTextContent('O texto não acompanha o áudio');
  });

  it('assina o caminho do bucket e passa a URL https adiante sem assinar', async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.test/foto.png' }, error: null });

    const { unmount } = render(<TalkXMessagePreview text="" mediaUrl="2026/10/foto.png" mediaType="image" />);
    expect(createSignedUrl).toHaveBeenCalledWith('2026/10/foto.png', 3600);
    expect((await screen.findByTestId('talkx-preview-image')).getAttribute('src')).toBe('https://signed.test/foto.png');
    unmount();

    // O valor gravado pela CAP-059 vem como `talkx-media/<caminho>`: a chave do
    // objeto é o que vem depois do nome do bucket.
    createSignedUrl.mockClear();
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.test/b.png' }, error: null });
    const segunda = render(<TalkXMessagePreview text="" mediaUrl="talkx-media/2026/10/b.png" mediaType="image" />);
    expect(createSignedUrl).toHaveBeenCalledWith('2026/10/b.png', 3600);
    segunda.unmount();

    createSignedUrl.mockClear();
    render(<TalkXMessagePreview text="" mediaUrl="https://cdn.test/direta.png" mediaType="image" />);
    expect(screen.getByTestId('talkx-preview-image').getAttribute('src')).toBe('https://cdn.test/direta.png');
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('não mostra a mídia de um caminho antigo quando a resposta chega fora de ordem', async () => {
    const pending: Array<(result: unknown) => void> = [];
    createSignedUrl.mockImplementation(() => new Promise((resolve) => pending.push(resolve)));

    const { rerender } = render(<TalkXMessagePreview text="" mediaUrl="2026/10/a.png" mediaType="image" />);
    rerender(<TalkXMessagePreview text="" mediaUrl="2026/10/b.png" mediaType="image" />);

    // B responde antes de A; depois A chega atrasada e não pode virar a imagem.
    pending[1]({ data: { signedUrl: 'https://signed.test/b.png' }, error: null });
    expect((await screen.findByTestId('talkx-preview-image')).getAttribute('src')).toBe('https://signed.test/b.png');

    pending[0]({ data: { signedUrl: 'https://signed.test/a.png' }, error: null });
    await waitFor(() =>
      expect(screen.getByTestId('talkx-preview-image').getAttribute('src')).toBe('https://signed.test/b.png'),
    );
  });

  it('mostra os botões e a enquete do interativo', () => {
    render(
      <TalkXMessagePreview
        text="Escolha uma opção"
        interactive={{
          buttons: ['Quero receber', 'Agora não'],
          poll: { question: 'Qual o melhor horário?', options: ['Manhã', 'Tarde', 'Noite', 'Tanto faz'] },
        }}
      />,
    );

    expect(screen.getAllByTestId('talkx-preview-button').map((node) => node.textContent)).toEqual([
      'Quero receber',
      'Agora não',
    ]);
    expect(screen.getAllByTestId('talkx-preview-poll-option')).toHaveLength(4);
    expect(screen.getByTestId('talkx-preview-poll')).toHaveTextContent('Qual o melhor horário?');
  });

  it('a moldura abre a tela cheia e fecha por teclado', () => {
    render(<PhoneFrame text="*Oi*" senderName="ZAPP Comercial" />);

    expect(screen.getByText('ZAPP Comercial')).toBeInTheDocument();
    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(screen.queryByTestId('talkx-preview-fullscreen-content')).toBeNull();

    fireEvent.click(screen.getByTestId('talkx-preview-fullscreen'));
    expect(screen.getByTestId('talkx-preview-fullscreen-content')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('talkx-preview-fullscreen-content')).toBeNull();
  });

  it('mantém WhatsAppBubble e PhoneFrame como reexport dos dois usos', () => {
    expect(BarrelBubble).toBe(WhatsAppBubble);
    expect(BarrelFrame).toBe(PhoneFrame);

    const { unmount } = render(<BarrelBubble text="*Oi*" />);
    expect(screen.getByTestId('talkx-preview').dataset.variant).toBe('bubble');
    expect(screen.getByTestId('talkx-preview').querySelector('strong')?.textContent).toBe('Oi');
    unmount();

    render(<BarrelFrame text="*Oi*" />);
    expect(screen.getByTestId('talkx-preview').dataset.variant).toBe('frame');
    expect(screen.getByTestId('talkx-preview').querySelector('strong')?.textContent).toBe('Oi');
  });

  it('variant="frame" usa a moldura e variant="bubble" a bolha', () => {
    const { unmount } = render(<TalkXMessagePreview variant="frame" text="Oi" />);
    expect(screen.getByTestId('talkx-preview').dataset.variant).toBe('frame');
    unmount();

    render(<TalkXMessagePreview variant="bubble" text="Oi" />);
    expect(screen.getByTestId('talkx-preview').dataset.variant).toBe('bubble');
  });
});

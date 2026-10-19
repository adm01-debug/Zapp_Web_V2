import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';
import type { SenderProfileMap } from '@/lib/fileSenderIdentity';

/**
 * SL-083 (G4 e G5) — painel de detalhes do arquivo.
 *
 * A evidência do defeito antigo é `FileDetailPanel.tsx:27`, que escrevia
 * `resolvedUrl || item.url` (a URL ASSINADA, temporária) na área de transferência e
 * assinava um objeto por painel. O que este teste trava:
 * - G4: o painel não tem "Copiar link" e nada vai para a área de transferência;
 * - G5: o painel lê a assinatura EM LOTE (`item.signedUrl`) e NÃO pede assinatura
 *   individual enquanto a semente vale; quando a URL em lote falha, renova UMA vez
 *   pelo locator durável (`item.url`) — o mesmo contrato da miniatura (R2-INB-059).
 *
 * O resolver é o REAL (sem mock de `useResolvedStorageUrl`); só o cliente do Storage e o
 * logger são mockados, igual a `FileThumb.assinatura-em-lote.test.tsx`.
 */
const storageMocks = vi.hoisted(() => ({ from: vi.fn(), createSignedUrl: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { storage: { from: storageMocks.from } },
}));

vi.mock('@/lib/logger', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },

  getLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })) })),
  createLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })) })),
}));

import { FileDetailContent, FileDetailPanel } from '../FileDetailPanel';
import { PRODUCTION_SUPABASE_URL } from '@/config/supabase';

const ORIGIN = new URL(PRODUCTION_SUPABASE_URL).origin;
const LOCATOR = `${ORIGIN}/storage/v1/object/public/whatsapp-media/c/planilha.png`;
const BATCH = `${ORIGIN}/storage/v1/object/sign/whatsapp-media/c/planilha.png?token=batch`;
const FRESH = `${ORIGIN}/storage/v1/object/sign/whatsapp-media/c/planilha.png?token=fresh`;

function mediaItem(overrides: Partial<ContactMediaItem> = {}): ContactMediaItem {
  return {
    id: 'a1', url: LOCATOR, type: 'image', filename: 'planilha.png', displayName: 'planilha.png',
    extension: 'png', senderLabel: 'Atendente', created_at: '2026-01-10T10:00:00.000Z', caption: null,
    mimetype: 'image/png', size: 1200, meta: null, sender: 'agent',
    signedUrl: BATCH, expiresAt: Date.now() + 3_600_000, ...overrides,
  };
}

/**
 * R07 (S49–S53): as props que o `FilesTab` passa ao painel. Sem elas o painel não teria
 * como mostrar quem enviou (D01/D04) nem encaminhar pelo mesmo caminho do cartão (S52).
 */
interface PanelProps {
  senderProfiles?: SenderProfileMap;
  currentUserId?: string | null;
  downloadAllowed?: boolean;
  onForward: (item: ContactMediaItem) => void;
}

function renderContent(overrides: Partial<ContactMediaItem> = {}, extra: Partial<PanelProps> = {}) {
  const props = {
    item: mediaItem(overrides),
    contactName: 'Ana Cliente',
    onClose: vi.fn(),
    onRequestDelete: vi.fn(),
    onForward: vi.fn(),
    ...extra,
  };
  return { ...render(<FileDetailContent {...props} />), props };
}

function renderPanel(item: ContactMediaItem, extra: Partial<PanelProps> = {}) {
  const props = { item, contactName: 'Ana Cliente', onClose: vi.fn(), onRequestDelete: vi.fn(), onForward: vi.fn(), ...extra };
  return { ...render(<FileDetailPanel {...props} />), props };
}

beforeEach(() => {
  vi.clearAllMocks();
  storageMocks.from.mockReturnValue({ createSignedUrl: storageMocks.createSignedUrl });
  storageMocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: FRESH }, error: null });
});

describe('FileDetailContent — SL-083 (G4/G5)', () => {
  it('G5: mostra a URL assinada em lote sem pedir assinatura individual', () => {
    const { container } = renderContent();

    expect(container.querySelector('img')).toHaveAttribute('src', BATCH);
    expect(storageMocks.createSignedUrl).not.toHaveBeenCalled();
  });

  it('G5: quando a URL em lote falha, renova UMA vez pelo locator durável', async () => {
    const { container } = renderContent();

    fireEvent.error(container.querySelector('img') as HTMLImageElement);

    await waitFor(() => expect(storageMocks.createSignedUrl).toHaveBeenCalledTimes(1));
    expect(storageMocks.createSignedUrl).toHaveBeenCalledWith('c/planilha.png', 3600);
  });

  it('G4: não oferece "Copiar link" e nada escreve na área de transferência', () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    const { props } = renderContent();
    // Percorre TODAS as ações do painel (as desabilitadas não disparam handler).
    for (const button of screen.getAllByRole('button')) fireEvent.click(button);

    expect(screen.queryByText(/Copiar link/i)).not.toBeInTheDocument();
    expect(writeText).not.toHaveBeenCalled();
    // "Excluir" continua PEDINDO a exclusão ao dono do estado (nunca apaga sozinho).
    expect(props.onRequestDelete).toHaveBeenCalledTimes(1);
  });
});

describe('FileDetailContent — R2-INB-060', () => {
  it('mostra a imagem de B depois de a imagem de A falhar no mesmo painel, sem desmontar', () => {
    const imagemA = mediaItem({ id: 'a1', signedUrl: `${BATCH}-a`, displayName: 'foto-a.png', filename: 'IMG-1.jpg' });
    const imagemB = mediaItem({ id: 'b2', signedUrl: `${BATCH}-b`, displayName: 'foto-b.png', filename: 'IMG-2.jpg' });
    const { container, rerender, props } = renderPanel(imagemA);
    const imgA = container.querySelector('img');
    expect(imgA).not.toBeNull();
    expect(imgA).toHaveAttribute('src', `${BATCH}-a`);

    // A falha (URL expirada/objeto ausente) e o placeholder de erro entra no lugar.
    fireEvent.error(imgA as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();
    expect(props.onClose).not.toHaveBeenCalled();

    // O usuário seleciona o arquivo B na lista: mesma instância, nova prop `item`.
    rerender(<FileDetailPanel {...props} item={imagemB} />);

    const imgB = container.querySelector('img');
    expect(imgB).not.toBeNull();
    expect(imgB).toHaveAttribute('src', `${BATCH}-b`);
    expect(imgB).toHaveAttribute('alt', 'foto-b.png');
    // O resto dos detalhes também tem de acompanhar o novo arquivo.
    expect(screen.getByText('foto-b.png')).toBeInTheDocument();
    expect(screen.queryByText('foto-a.png')).not.toBeInTheDocument();
  });

  it('a renovação bem-sucedida da URL reapresenta a imagem do mesmo arquivo', () => {
    const expirada = mediaItem({ id: 'c3', displayName: 'foto-c.png', signedUrl: `${BATCH}-expirada` });
    const renovada = { ...expirada, signedUrl: `${FRESH}-renovada` };
    const { container, rerender, props } = renderPanel(expirada);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', `${BATCH}-expirada`);

    fireEvent.error(img as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();

    // O resolvedor terminou o refresh e a consulta entregou uma URL assinada nova.
    rerender(<FileDetailPanel {...props} item={renovada} />);

    expect(container.querySelector('img')).toHaveAttribute('src', `${FRESH}-renovada`);
  });

  it('a mesma URL que falhou continua com o placeholder (o erro não é esquecido a cada render)', () => {
    const imagemA = mediaItem({ id: 'a1', signedUrl: `${BATCH}-a`, displayName: 'foto-a.png' });
    const { container, rerender, props } = renderPanel(imagemA);
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();

    rerender(<FileDetailPanel {...props} />);

    expect(container.querySelector('img')).toBeNull();
  });
});

/**
 * R07 (S49–S53): o painel de detalhes do mockup — remetente com foto, legenda, Baixar pela
 * política (D06), Encaminhar HABILITADO pelo MESMO caminho do cartão (S52) e Excluir (S53).
 *
 * O `SenderAvatar` é o componente REAL (só os dados do perfil entram por prop): quem prova a
 * identidade aqui é o painel renderizado, não um mock que já traria o nome pronto.
 */
describe('FileDetailContent — R07 (painel de detalhes igual ao mockup)', () => {
  const FOTO = 'https://cdn.test/foto-atendente.png';

  it('S49/D01: "Enviado por" com a foto e o nome do atendente que enviou o arquivo', () => {
    renderContent(
      { sender: 'agent', agentId: 'p-2' },
      { senderProfiles: { 'p-2': { id: 'p-2', name: 'Joaquim Ataides', nickname: null, avatar_url: FOTO } }, currentUserId: 'p-9' },
    );

    expect(screen.getByText('Enviado por')).toBeInTheDocument();
    expect(screen.getByTestId('sender-avatar-photo')).toHaveAttribute('src', FOTO);
    expect(screen.getByTestId('sender-avatar-name')).toHaveTextContent('Joaquim Ataides');
    expect(screen.getByTestId('sender-avatar')).toHaveAttribute('aria-label', 'Enviado por Joaquim Ataides');
  });

  it('S49/D01: "Você" quando o arquivo foi enviado pelo próprio usuário logado', () => {
    renderContent(
      { sender: 'agent', agentId: 'p-2' },
      { senderProfiles: { 'p-2': { id: 'p-2', name: 'Joaquim Ataides', avatar_url: FOTO } }, currentUserId: 'p-2' },
    );

    expect(screen.getByTestId('sender-avatar-name')).toHaveTextContent('Você');
    expect(screen.getByTestId('sender-avatar-photo')).toHaveAttribute('src', FOTO);
  });

  it('S49/D01: arquivo do contato mostra o nome do contato (sem foto, iniciais)', () => {
    renderContent({ sender: 'contact', senderLabel: null });

    expect(screen.getByTestId('sender-avatar-name')).toHaveTextContent('Ana Cliente');
    expect(screen.queryByTestId('sender-avatar-photo')).not.toBeInTheDocument();
    expect(screen.getByTestId('sender-avatar-initials')).toBeInTheDocument();
  });

  it('S49/D01: atendente sem agent_id (celular/automação) mostra "Equipe", sem foto', () => {
    renderContent({ sender: 'agent', agentId: null });

    expect(screen.getByTestId('sender-avatar-name')).toHaveTextContent('Equipe');
    expect(screen.queryByTestId('sender-avatar-photo')).not.toBeInTheDocument();
  });

  it('S50: a legenda do arquivo aparece no painel', () => {
    renderContent({ caption: 'Segue o orçamento revisado.' });

    expect(screen.getByText('Segue o orçamento revisado.')).toBeInTheDocument();
  });

  it('S51/D06: sem permissão o botão é o cadeado com o motivo e não baixa nada', () => {
    vi.stubGlobal('fetch', vi.fn());
    renderContent({}, { downloadAllowed: false });

    const cadeado = screen.getByRole('button', { name: /bloqueado pela política/i });
    expect(cadeado).toBeDisabled();
    expect(cadeado).toHaveAttribute('title', 'Bloqueado pela política de segurança');

    fireEvent.click(cadeado);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('S51/D06: com permissão baixa pelo caminho existente (fetch + anchor com o nome do arquivo)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['x']) });
    vi.stubGlobal('fetch', fetchSpy);
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
    const original = document.createElement.bind(document);
    const anchors: HTMLAnchorElement[] = [];
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      const el = original(tagName, options);
      if (tagName === 'a') anchors.push(el as HTMLAnchorElement);
      return el;
    }) as typeof document.createElement);

    renderContent({}, { downloadAllowed: true });
    fireEvent.click(screen.getByRole('button', { name: 'Baixar arquivo' }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith(BATCH));
    await waitFor(() => expect(anchors).toHaveLength(1));
    expect(anchors[0].download).toBe('planilha.png');

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('S52: Encaminhar fica HABILITADO e chama o MESMO handler do cartão com o item', () => {
    const { props } = renderContent();

    const encaminhar = screen.getByRole('button', { name: 'Encaminhar' });
    expect(encaminhar).toBeEnabled();
    expect(encaminhar).not.toHaveAttribute('title', 'Disponível em breve');

    fireEvent.click(encaminhar);
    expect(props.onForward).toHaveBeenCalledTimes(1);
    expect(props.onForward).toHaveBeenCalledWith(props.item);
  });

  it('S53: Excluir pede a exclusão ao dono do estado (nunca apaga sozinho)', () => {
    const { props } = renderContent({ sender: 'agent' });

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(props.onRequestDelete).toHaveBeenCalledWith(props.item);
  });

  it('S53: arquivo enviado pelo contato não oferece Excluir', () => {
    renderContent({ sender: 'contact' });

    expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument();
  });
});

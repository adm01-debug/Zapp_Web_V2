import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { FileCard } from '../FileCard';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';

vi.mock('@/hooks/storage/useResolvedStorageUrl', () => ({
  useResolvedStorageUrl: (source: string) => ({ url: source, isLoading: false, error: null, refresh: vi.fn() }),
}));

const mockToastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args), success: vi.fn() },
}));

const FOTO = 'https://cdn.test/foto.png';

const ITEM: ContactMediaItem = {
  id: 'm1',
  url: 'https://x/planilha.png',
  type: 'image',
  filename: 'planilha-total.png',
  displayName: 'planilha-total.png',
  extension: 'png',
  senderLabel: 'Atendente',
  agentId: 'p-1',
  created_at: '2026-09-24T17:54:00.000Z',
  caption: null,
  mimetype: 'image/png',
  size: 1200000,
  meta: null,
  sender: 'agent',
  signedUrl: 'https://signed.test/planilha.png',
};

const DOC: ContactMediaItem = {
  ...ITEM,
  id: 'm2',
  type: 'document',
  filename: 'contrato.pdf',
  displayName: 'contrato.pdf',
  extension: 'pdf',
  size: null,
  sender: 'contact',
  senderLabel: null,
  agentId: null,
};

/** Arquivo do WhatsApp: o nome exibido Ã© genÃ©rico e o hex tÃ©cnico sÃ³ aparece na dica (D09). */
const TECNICO: ContactMediaItem = {
  ...ITEM,
  id: 'm3',
  filename: '3EB0E6947FC0A0ECAED14D_1790283276022.png',
  displayName: 'Imagem Â· 25/09 09:40',
  extension: 'png',
  sender: 'contact',
  agentId: null,
};

function renderCard(item: ContactMediaItem = ITEM, overrides: Partial<React.ComponentProps<typeof FileCard>> = {}) {
  const props: React.ComponentProps<typeof FileCard> = {
    item,
    contactName: 'Ana Cliente',
    selected: false,
    onSelect: vi.fn(),
    onToggleSelection: vi.fn(),
    onPreview: vi.fn(),
    onForward: vi.fn(),
    onRequestDelete: vi.fn(),
    ...overrides,
  };
  return { ...render(<FileCard {...props} />), props };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('FileCard â€” layout do mockup (R04, S28â€“S31)', () => {
  it('S28: a linha 1 Ã© o nome; o nome completo/tÃ©cnico fica na dica', () => {
    const { unmount } = renderCard();
    const nome = screen.getByRole('button', { name: 'planilha-total.png' });
    expect(nome).toHaveAttribute('title', 'planilha-total.png');
    unmount();

    renderCard(TECNICO);
    const tecnico = screen.getByRole('button', { name: 'Imagem Â· 25/09 09:40' });
    expect(tecnico).toHaveAttribute('title', '3EB0E6947FC0A0ECAED14D_1790283276022.png');
    // O hex nÃ£o aparece na tela: sÃ³ na dica.
    expect(screen.queryByText('3EB0E6947FC0A0ECAED14D_1790283276022.png')).not.toBeInTheDocument();
  });

  it('S29: a linha 2 Ã© sÃ³ tipo Â· tamanho, com vÃ­rgula no decimal', () => {
    renderCard();
    const meta = screen.getByText('Imagem Â· 1,1 MB');
    expect(meta.tagName).toBe('P');
  });

  it('S30: a linha 3 Ã© a data curta do cartÃ£o', () => {
    renderCard({ ...ITEM, created_at: new Date().toISOString() });
    expect(screen.getByText(/^Hoje, \d{2}:\d{2}$/)).toBeInTheDocument();
  });

  it('S30: data antiga sai por extenso ("02 set 2026, 18:45")', () => {
    renderCard();
    expect(screen.getByText(/^\d{2} [a-z]{3} \d{4}, \d{2}:\d{2}$/)).toBeInTheDocument();
  });

  it('S36: as quatro linhas existem sempre â€” inclusive sem tamanho (altura uniforme)', () => {
    const { unmount } = renderCard();
    expect(screen.getByRole('button', { name: 'planilha-total.png' })).toBeInTheDocument();
    expect(screen.getByText('Imagem Â· 1,1 MB')).toBeInTheDocument();
    expect(screen.getByText(/^\d{2} [a-z]{3} \d{4}, \d{2}:\d{2}$/)).toBeInTheDocument();
    expect(screen.getByTestId('sender-avatar')).toBeInTheDocument();
    unmount();

    // Sem tamanho, a linha 2 continua no lugar (sÃ³ o tipo) â€” nada some da altura do cartÃ£o.
    renderCard(DOC);
    expect(screen.getByRole('button', { name: 'contrato.pdf' })).toBeInTheDocument();
    expect(screen.getByText('Documento')).toBeInTheDocument();
    expect(screen.getByText(/^\d{2} [a-z]{3} \d{4}, \d{2}:\d{2}$/)).toBeInTheDocument();
    expect(screen.getByTestId('sender-avatar')).toBeInTheDocument();
  });
});

describe('FileCard â€” quem enviou (R04, S31 / D01â€“D03)', () => {
  it('S31: arquivo do prÃ³prio usuÃ¡rio logado vira "VocÃª" com a foto dele', () => {
    renderCard(ITEM, {
      currentUserId: 'p-1',
      senderProfiles: { 'p-1': { id: 'p-1', name: 'Joaquim', avatar_url: FOTO } },
    });

    expect(screen.getByTestId('sender-avatar-name')).toHaveTextContent('VocÃª');
    expect(screen.getByTestId('sender-avatar-photo')).toHaveAttribute('src', FOTO);
  });

  it('S31: arquivo de OUTRO atendente mostra o nome e a foto do perfil', () => {
    renderCard(ITEM, {
      currentUserId: 'eu',
      senderProfiles: { 'p-1': { id: 'p-1', name: 'Ana Atendente', avatar_url: FOTO } },
    });

    expect(screen.getByTestId('sender-avatar-name')).toHaveTextContent('Ana Atendente');
    expect(screen.getByTestId('sender-avatar-photo')).toHaveAttribute('src', FOTO);
  });

  it('S31: atendente sem agent_id (celular/automaÃ§Ã£o) vira "Equipe", sem foto', () => {
    renderCard({ ...ITEM, agentId: null }, { senderProfiles: {} });

    expect(screen.getByTestId('sender-avatar-name')).toHaveTextContent('Equipe');
    expect(screen.queryByTestId('sender-avatar-photo')).not.toBeInTheDocument();
  });

  it('S31: arquivo do contato mostra o nome do contato', () => {
    renderCard(DOC);
    expect(screen.getByTestId('sender-avatar-name')).toHaveTextContent('Ana Cliente');
  });

  it('S31/D03: em 5 colunas fica sÃ³ a foto, com o nome na dica (aria-label)', () => {
    const { unmount } = renderCard(ITEM, { effectiveColumns: 4 });
    expect(screen.getByTestId('sender-avatar-name')).toBeInTheDocument();
    unmount();

    renderCard(ITEM, { effectiveColumns: 5, senderProfiles: { 'p-1': { name: 'Ana Atendente' } } });
    expect(screen.queryByTestId('sender-avatar-name')).not.toBeInTheDocument();
    expect(screen.getByTestId('sender-avatar')).toHaveAttribute('aria-label', 'Enviado por Ana Atendente');
  });
});

describe('FileCard â€” aÃ§Ãµes do cartÃ£o (R04, S32 / D06, D07)', () => {
  it('S32: as aÃ§Ãµes sÃ£o olho, baixar/cadeado, encaminhar (em breve) e â‹® â€” sem Copiar link', () => {
    renderCard();
    expect(screen.getByRole('button', { name: 'Visualizar' })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Baixar/ })).toBeInTheDocument();
    // O encaminhamento do cartÃ£o segue desabilitado ("em breve"), como nas outras vistas.
    const encaminhar = screen.getByRole('button', { name: 'Encaminhar' });
    expect(encaminhar).toBeDisabled();
    expect(encaminhar).toHaveAttribute('title', 'DisponÃ­vel em breve');
    expect(screen.getByRole('button', { name: 'Mais aÃ§Ãµes' })).toBeInTheDocument();
    expect(screen.queryByText(/Copiar link/)).not.toBeInTheDocument();
  });

  it('S32: sem permissÃ£o o botÃ£o Ã© o cadeado com a explicaÃ§Ã£o e nÃ£o baixa nada', () => {
    vi.stubGlobal('fetch', vi.fn());
    renderCard(ITEM, { downloadAllowed: false });

    const cadeado = screen.getByRole('button', { name: /bloqueado por polÃ­tica de seguranÃ§a/i });
    expect(cadeado).toHaveAttribute('title', 'Download bloqueado por polÃ­tica de seguranÃ§a');

    fireEvent.click(cadeado);
    expect(mockToastError).toHaveBeenCalledWith(
      'ğŸ”’ Download bloqueado por polÃ­tica de seguranÃ§a',
      expect.objectContaining({ description: expect.stringMatching(/administrador/i) }),
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('S32: com permissÃ£o baixa pelo caminho existente (fetch + anchor com o nome do arquivo)', async () => {
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

    renderCard(ITEM, { downloadAllowed: true });
    fireEvent.click(screen.getByRole('button', { name: 'Baixar' }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('https://signed.test/planilha.png'));
    await waitFor(() => expect(anchors).toHaveLength(1));
    expect(anchors[0].download).toBe('planilha-total.png');

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('S32: em Ã¡udio, o play do A01 continua na linha de aÃ§Ãµes', () => {
    renderCard({ ...ITEM, id: 'a1', type: 'audio' });
    // A06b: o rÃ³tulo cita o nome do arquivo do cartÃ£o â€” o seletor segue EXATOKğìÈZ^HBˆËÈÙ\ˆÈ¼ìİ[ÈÙ[°ê\šXÛÎÈÛÛœİ[\ˆ•ØØ\ˆ0è]Y[Èˆ\›È\]ZHXÚ\šXH™\›È›İ0íY\Ë‚ˆ^Xİ
ØÜ™Y[‹™Ù]T›ÛJ	Ø]Û‰ËÈ˜[YNˆ	ÕØØ\ˆ0è]Y[È[š[K]İ[œ™ÉÈJJKĞ™R[•QØİ[Y[

NÂˆJNÂ‚ˆ]
	ÔÌÌ‹ÑÎˆØ[˜\ˆ˜HØ[\šXH°èÛÈ^\İH[HYØ\ˆ™[š[HÈØ\0èÛÉË

HOˆÂˆ™[™\Ø\™

NÂˆ^Xİ
ØÜ™Y[‹œ]Y\PU^
ÔØ[˜\ˆ˜HØ[\šXKÚJJK››İĞ™R[•QØİ[Y[

NÂˆJNÂŸJNÂ‚™\ØÜšX™J	Ñš[PØ\™8 %Ù[péğèÛÈH[ÙÈÙ[XÚ[Û˜\ˆ
ŒÌÌËÌÍ
IË

HOˆÂˆ]
	ÔÌÌÎˆÈØ\0èÛÈX\˜ØYÈ^0íYHÈ\İYÈÙ[XÚ[Û˜YÈHH›Ü™H^[
š[X\JIË

HOˆÂˆÛÛœİÈ[›[İ[HH™[™\Ø\™
USKÈÙ[XİYˆ˜[ÙHJNÂˆ^Xİ
ØÜ™Y[‹™Ù]U\İY
	Ùš[\ËZ][K[LIÊJKÒ]™P]šX]J	Ù]K\Ù[XİY	Ë	Ù˜[ÙIÊNÂˆ[›[İ[

NÂ‚ˆ™[™\Ø\™
USKÈÙ[XİYˆYHJNÂˆÛÛœİØ\™HØÜ™Y[‹™Ù]U\İY
	Ùš[\ËZ][K[LIÊNÂˆ^Xİ
Ø\™
KÒ]™P]šX]J	Ù]K\Ù[XİY	Ë	İYIÊNÂˆ^Xİ
Ø\™˜Û\ÜÓ˜[YJKĞÛÛZ[Š	Ø›Ü™\‹\š[X\IÊNÂˆJNÂ‚ˆ]
	ÔÌÍˆ›È[ÙÈÙ[XÚ[Û˜\ˆÈX\˜ØYÜˆÈØ\0èÛÈÛÛ[XH[\›˜[™ÈHÙ[péğèÛÉË

HOˆÂˆÛÛœİÈ›ÜÈHH™[™\Ø\™
USKÈÙ[Xİ[Û“[ÙNˆYKÙ[Xİ[ÛÚXÚÙYˆYHJNÂˆÛÛœİX\˜ØYÜˆHØÜ™Y[‹™Ù]T›ÛJ	ØÚXÚØ›Ş	ËÈ˜[YNˆ	ÔÙ[XÚ[Û˜\ˆ[š[K]İ[œ™ÉÈJNÂˆ^Xİ
X\˜ØYÜŠKĞ™PÚXÚÙY

NÂˆ^Xİ
ØÜ™Y[‹™Ù]U\İY
	Ùš[\ËZ][K[LIÊJKÒ]™P]šX]J	Ù]K\Ù[XİY	Ë	İYIÊNÂ‚ˆš\™Q]™[˜ÛXÚÊX\˜ØYÜŠNÂˆ^Xİ
›ÜË›Û•ÙÙÛTÙ[Xİ[ÛŠKÒ]™P™Y[Ø[Y[Y\ÊJNÂˆ^Xİ
›ÜË›Û”™]šY]ÊK››İÒ]™P™Y[Ø[Y

NÂˆJNÂŸJNÂ‚™\ØÜšX™J	Ñš[PØ\™8 %ÛÛ\Ü[Y[È™\Ù\˜YÈ
]\\ÈMø $ÌŒ
IË

HOˆÂˆ]
	Ù]\HŒˆ0êH[H\XÛOˆÛÛHš[\ËZ][KOY‹°ê]šXHH›ÛYHğèÛÈ›İ0íY\ÉË

HOˆÂˆ™[™\Ø\™

NÂˆ^Xİ
ØÜ™Y[‹™Ù]U\İY
	Ùš[\ËZ][K[LIÊJKĞ™R[•QØİ[Y[

NÂ‚ˆÛÛœİ™]šXHHØÜ™Y[‹™Ù]T›ÛJ	Ø]Û‰ËÈ˜[YNˆ	Õš\İX[^˜\ˆ[š[K]İ[œ™ÉÈJNÂˆ^Xİ
™]šXKYÓ˜[YJKĞ™J	Ğ•UÓ‰ÊNÂ‚ˆÛÛœİ›ÛYHHØÜ™Y[‹™Ù]T›ÛJ	Ø]Û‰ËÈ˜[YNˆ	Ü[š[K]İ[œ™ÉÈJNÂˆ^Xİ
›ÛYKYÓ˜[YJKĞ™J	Ğ•UÓ‰ÊNÂˆ^Xİ
›ÛYJKÒ]™P]šX]J	İ]IË	Ü[š[K]İ[œ™ÉÊNÂˆJNÂ‚ˆ]
	Ù]\HŒˆ[\‹ØÛ]YH˜H°ê]šXHXœ™HÈš\İX[^˜YÜÈ›È›ÛYHXœ™HÜÈ][\ÉË

HOˆÂˆÛÛœİÈ›ÜÈHH™[™\Ø\™

NÂˆš\™Q]™[˜ÛXÚÊØÜ™Y[‹™Ù]T›ÛJ	Ø]Û‰ËÈ˜[YNˆ	Õš\İX[^˜\ˆ[š[K]İ[œ™ÉÈJJNÂˆ^Xİ
›ÜË›Û”™]šY]ÊKÒ]™P™Y[Ø[Y[Y\ÊJNÂˆ^Xİ
›ÜË›Û”Ù[Xİ
K››İÒ]™P™Y[Ø[Y

NÂ‚ˆš\™Q]™[˜ÛXÚÊØÜ™Y[‹™Ù]T›ÛJ	Ø]Û‰ËÈ˜[YNˆ	Ü[š[K]İ[œ™ÉÈJJNÂˆ^Xİ
›ÜË›Û”Ù[Xİ
KÒ]™P™Y[Ø[Y[Y\ÊJNÂˆJNÂ‚ˆ]
	Ù]\HŒˆ›È[ÙÈÙ[péğèÛÈH°ê]šXH[\›˜HHÙ[péğèÛÈH°èÛÈXœ™H˜YIË

HOˆÂˆÛÛœİÈ›ÜÈHH™[™\Ø\™
USKÈÙ[Xİ[Û“[ÙNˆYHJNÂ‚ˆš\™Q]™[˜ÛXÚÊØÜ™Y[‹™Ù]T›ÛJ	Ø]Û‰ËÈ˜[YNˆ	Õš\İX[^˜\ˆ[š[K]İ[œ™ÉÈJJNÂˆ^Xİ
›ÜË›Û•ÙÙÛTÙ[Xİ[ÛŠKÒ]™P™Y[Ø[Y[Y\ÊJNÂˆ^Xİ
›ÜË›Û”™]šY]ÊK››İÒ]™P™Y[Ø[Y

NÂˆ^Xİ
›ÜË›Û”Ù[Xİ
K››İÒ]™P™Y[Ø[Y

NÂˆJNÂ‚ˆ]
	Ù]\HŒˆÜXÙH›ÈÚXÚØ›Ş[\›˜HÙ[HXœš\ˆ°ê]šXH™[H][\ÉË

HOˆÂˆÛÛœİÈ›ÜÈHH™[™\Ø\™
USKÈÙ[Xİ[Û“[ÙNˆYKÙ[Xİ[ÛÚXÚÙYˆ˜[ÙHJNÂˆÛÛœİÚXÚØ›ŞHØÜ™Y[‹™Ù]T›ÛJ	ØÚXÚØ›Ş	ËÈ˜[YNˆ	ÔÙ[XÚ[Û˜\ˆ[š[K]İ[œ™ÉÈJNÂ‚ˆš\™Q]™[˜ÛXÚÊÚXÚØ›Ş
NÂˆ^Xİ
›ÜË›Û•ÙÙÛTÙ[Xİ[ÛŠKÒ]™P™Y[Ø[Y[Y\ÊJNÂˆ^Xİ
›ÜË›Û”™]šY]ÊK››İÒ]™P™Y[Ø[Y

NÂˆ^Xİ
›ÜË›Û”Ù[Xİ
K››İÒ]™P™Y[Ø[Y

NÂˆJNÂ‚ˆ]
	Ù]\HNNˆÈY[H˜^ˆ˜Z^\ˆ\ØXš[]YÈÛÛHÈ[İ]›ÈH^ÛZ\ˆğìÈÈ][™[IË

HOˆÂˆ™[™\Ø\™

NÂˆš\™Q]™[œÚ[\‘İÛŠØÜ™Y[‹™Ù]T›ÛJ	Ø]Û‰ËÈ˜[YNˆ	ÓXZ\ÈpéğíY\ÉÈJKÈ]Ûˆİ›Ù^Nˆ˜[ÙHJNÂ‚ˆÛÛœİ˜Z^\ˆHØÜ™Y[‹™Ù]U^
Ğ›Ü]YXYÈ[HÛ0ë]XØHHÙYİ\˜[°éØKÊNÂˆ^Xİ
˜Z^\‹˜ÛÜÙ\İ
	ÖÙ]KY\ØX›YIÊJK››İĞ™S[

NÂˆ^Xİ
ØÜ™Y[‹™Ù]T›ÛJ	ÛY[Z][IËÈ˜[YNˆĞ˜Z^\‹ÈJJKÒ]™P]šX]J	Ù]KY\ØX›Y	ÊNÂˆ^Xİ
ØÜ™Y[‹™Ù]T›ÛJ	ÛY[Z][IËÈ˜[YNˆÑ^ÛZ\ˆY[œØYÙ[KÈJJKĞ™R[•QØİ[Y[

NÂˆJNÂ‚ˆ]
	Ù]\HNNˆÛÜX\ˆ[šÈˆ°èÛÈ^\İHXZ\ÈH˜YH\ØÜ™]™H˜H0è\™XHH˜[œÙ™\°ê›˜ÚXIË

HOˆÂˆÛÛœİÜš]U^HšK™›Š
NÂˆØš™Xİ™Yš[™T›Ü\J˜]šYØ]Ü‹	ØÛ\›Ø\™	ËÈ˜[YNˆÈÜš]U^KÛÛ™šYİ\˜X›NˆYHJNÂ‚ˆ™[™\Ø\™

NÂˆš\™Q]™[œÚ[\‘İÛŠØÜ™Y[‹™Ù]T›ÛJ	Ø]Û‰ËÈ˜[YNˆ	ÓXZ\ÈpéğíY\ÉÈJKÈ]Ûˆİ›Ù^Nˆ˜[ÙHJNÂˆ^Xİ
ØÜ™Y[‹œ]Y\PU^
ĞÛÜX\ˆ[šËÊJK››İĞ™R[•QØİ[Y[

NÂˆ^Xİ
Üš]U^
K››İÒ]™P™Y[Ø[Y

NÂˆJNÂ‚ˆ]
	Ù]\HNNˆÙ[HİÛ›ØY]]›È8 %È][H°èÛÈ^\İH\˜HÛÛ]ÉË

HOˆÂˆ™[™\Ø\™
ĞÊNÂˆš\™Q]™[œÚ[\‘İÛŠØÜ™Y[‹™Ù]T›ÛJ	Ø]Û‰ËÈ˜[YNˆ	ÓXZ\ÈpéğíY\ÉÈJKÈ]Ûˆİ›Ù^Nˆ˜[ÙHJNÂˆ^Xİ
ØÜ™Y[‹œ]Y\PT›ÛJ	ÛY[Z][IËÈ˜[YNˆÑ^ÛZ\ˆY[œØYÙ[KÈJJK››İĞ™R[•QØİ[Y[

NÂˆJNÂ‚ˆ]
	Ù]\HMÎˆH[XYÙ[HH°ê]šXH\ØHØš™XİXÛÛZ[ˆ
š[H[š[H°èÛÈ0êHÛÜYÊIË

HOˆÂˆ™[™\Ø\™

NÂˆÛÛœİ[YÈHÚ][ŠØÜ™Y[‹™Ù]T›ÛJ	Ø]Û‰ËÈ˜[YNˆ	Õš\İX[^˜\ˆ[š[K]İ[œ™ÉÈJJK™Ù]T›ÛJ	Ú[YÉÊNÂˆ^Xİ
[YË˜Û\ÜÓ˜[YJKĞÛÛZ[Š	ÛØš™XİXÛÛZ[‰ÊNÂˆ^Xİ
[YË˜Û\ÜÓ˜[YJK››İĞÛÛZ[Š	ÛØš™XİXÛİ™\‰ÊNÂˆJNÂŸJNÂ‚˜Y\‘XXÚ


HOˆÂˆšKœ™\İÜ™P[[ØÚÜÊ
NÂˆšK[œİX[ÛØ˜[Ê
NÂŸJNÂ
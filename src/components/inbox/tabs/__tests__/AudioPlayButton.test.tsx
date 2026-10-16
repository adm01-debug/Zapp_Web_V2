import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { axe } from 'vitest-axe';

/**
 * A02–A05 — play/pause do áudio direto no cartão da aba Arquivos.
 *
 * O componente é REAL (o `AudioPlayButton` e o resolver de URL assinada são os de produção);
 * o que se troca é a fronteira de plataforma: o cliente do Supabase (a guarda de rede do
 * `src/test/setup.ts` proíbe falar com o banco real) e `Audio`, que no jsdom não decodifica
 * nada.
 *
 * Q08 — `attachMediaVolume` é um ESPIÃO cuja implementação padrão é a REAL (antes era um
 * no-op mockado: o mock "já trazia a resposta" e nada media o volume do áudio do cartão).
 * Agora quem responde é `element.volume`/`element.muted` de verdade, e o espião continua
 * provando QUEM foi ligado e que o desligamento roda no unmount.
 */
const { createSignedUrl } = vi.hoisted(() => ({ createSignedUrl: vi.fn() }));
const { attachMediaVolume } = vi.hoisted(() => ({ attachMediaVolume: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { storage: { from: () => ({ createSignedUrl }) } },
}));
vi.mock('@/lib/mediaVolumeElement', async (importOriginal) => {
  const moduloReal = await importOriginal<typeof import('@/lib/mediaVolumeElement')>();
  attachMediaVolume.mockImplementation(moduloReal.attachMediaVolume);
  return { ...moduloReal, attachMediaVolume };
});
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { AudioPlayButton } from '../AudioPlayButton';
import { FileCard } from '../FileCard';
import { FilesListView } from '../FilesListView';
import { FilesTableView } from '../FilesTableView';
import { getPlayingAudioId } from '@/hooks/chat/useExclusiveAudio';
import { setMuted, setVolume } from '@/lib/mediaVolumeStore';
import { SUPABASE_URL } from '@/config/supabase';
import { toast } from 'sonner';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';

/**
 * `Audio` de mentira: registra cada elemento criado, deixa o teste disparar os eventos do
 * ciclo de vida (metadados, fim, erro) e respeita a regra do navegador de não reemitir
 * `pause` num elemento já pausado (é o que impede laço entre store e elemento).
 */
class FakeAudio {
  static created: FakeAudio[] = [];
  /** Falhas de `play()` enfileiradas: 'reject' = a tentativa falha (URL expirada). */
  static playQueue: Array<'ok' | 'reject'> = [];

  src = '';
  preload = '';
  currentTime = 0;
  duration = 0;
  paused = true;
  /** Q08 — é AQUI que o volume global tem de aparecer (caminho nativo do `element.volume`). */
  volume = 1;
  muted = false;
  /** Listeners de DOM: o `attachMediaVolume` real liga `loadedmetadata` e `play` no elemento. */
  listeners = new Map<string, Set<EventListener>>();
  onloadedmetadata: (() => void) | null = null;
  ontimeupdate: (() => void) | null = null;
  onplay: (() => void) | null = null;
  onpause: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor() {
    FakeAudio.created.push(this);
  }

  play = vi.fn(() => {
    if (FakeAudio.playQueue.shift() === 'reject') return Promise.reject(new Error('expirada'));
    this.paused = false;
    this.onplay?.();
    // Evento de DOM de verdade: é nele que o controle de volume reaquece e reaplica.
    this.emit('play');
    return Promise.resolve();
  });

  pause = vi.fn(() => {
    if (this.paused) return;
    this.paused = true;
    this.onpause?.();
  });

  addEventListener(type: string, callback: EventListener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(callback);
  }

  removeEventListener(type: string, callback: EventListener) {
    this.listeners.get(type)?.delete(callback);
  }

  /** Reemite um evento de DOM para os listeners que o controle de volume registrou. */
  emit(type: string) {
    this.listeners.get(type)?.forEach((callback) => callback(new Event(type)));
  }

  loadMetadata(seconds: number) {
    this.duration = seconds;
    this.onloadedmetadata?.();
    this.emit('loadedmetadata');
  }

  seek(seconds: number) {
    this.currentTime = seconds;
    this.ontimeupdate?.();
  }

  /** URL expirada/ilegível: é assim que o elemento avisa (evento `error`). */
  fail() {
    this.onerror?.();
  }
}

// O jsdom não decodifica mídia: o `new Audio()` do componente é este duplo controlável.
vi.stubGlobal('Audio', FakeAudio);

let assinaturas = 0;

const MEDIA_URL = (bucket: string, path: string) =>
  `${SUPABASE_URL}/storage/v1/object/sign/${bucket}/${path}`;

function audioItem(overrides: Partial<ContactMediaItem> = {}): ContactMediaItem {
  return {
    id: 'a1',
    url: MEDIA_URL('audio-messages', 'conv-1/a1.ogg'),
    type: 'audio',
    filename: 'recado.ogg',
    displayName: 'recado.ogg',
    extension: 'ogg',
    senderLabel: null,
    created_at: '2026-10-07T12:00:00.000Z',
    caption: null,
    mimetype: 'audio/ogg',
    size: 41000,
    meta: null,
    sender: 'contact',
    ...overrides,
  };
}

const IMAGE: ContactMediaItem = {
  ...audioItem(),
  id: 'm1',
  url: MEDIA_URL('whatsapp-media', 'conv-1/m1.png'),
  type: 'image',
  filename: 'foto.png',
  displayName: 'foto.png',
  extension: 'png',
  mimetype: 'image/png',
};

beforeEach(() => {
  FakeAudio.created = [];
  FakeAudio.playQueue = [];
  assinaturas = 0;
  vi.clearAllMocks();
  createSignedUrl.mockImplementation(() => {
    assinaturas += 1;
    return Promise.resolve({ data: { signedUrl: `https://signed.test/audio-${assinaturas}.ogg` }, error: null });
  });
});

/** Clica e espera o áudio REALMENTE tocar (URL assinada resolvida → elemento tocando). */
async function tocar(
  button: HTMLElement = screen.getByRole('button', { name: 'Tocar áudio recado.ogg' }),
  pausar = 'Pausar áudio recado.ogg',
) {
  fireEvent.click(button);
  await waitFor(() => expect(FakeAudio.created.some((audio) => audio.play.mock.calls.length > 0)).toBe(true));
  await waitFor(() => expect(screen.getByRole('button', { name: pausar })).toBeInTheDocument());
}

describe('AudioPlayButton (A02/D03/D04)', () => {
  it('D03: montar não assina nem cria áudio; a URL sai no PRIMEIRO clique e o som toca', async () => {
    render(<AudioPlayButton item={audioItem()} />);

    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(FakeAudio.created).toHaveLength(0);

    await tocar();

    expect(createSignedUrl).toHaveBeenCalledTimes(1);
    expect(createSignedUrl.mock.calls[0][0]).toBe('conv-1/a1.ogg');
    expect(FakeAudio.created).toHaveLength(1);
    expect(FakeAudio.created[0].src).toBe('https://signed.test/audio-1.ogg');
    expect(FakeAudio.created[0].play).toHaveBeenCalledTimes(1);
    expect(getPlayingAudioId()).toBe('a1');
    expect(attachMediaVolume).toHaveBeenCalledWith(FakeAudio.created[0]);
  });

  it('D04: mostra o tempo restante e a barra fina enquanto toca; ao terminar volta ao play', async () => {
    render(<AudioPlayButton item={audioItem()} />);
    await tocar();
    const audio = FakeAudio.created[0];

    act(() => {
      audio.loadMetadata(120);
      audio.seek(30);
    });

    expect(screen.getByTestId('audio-remaining-a1')).toHaveTextContent('1:30');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');

    act(() => {
      audio.currentTime = 120;
      audio.onended?.();
    });

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tocar áudio recado.ogg' })).toBeInTheDocument();
    expect(getPlayingAudioId()).toBeNull();
  });

  it('D03: erro de URL expirada renova UMA vez e volta a tocar, sem mensagem de falha', async () => {
    FakeAudio.playQueue = ['reject'];
    render(<AudioPlayButton item={audioItem()} />);

    await tocar();

    const audio = FakeAudio.created[0];
    expect(createSignedUrl).toHaveBeenCalledTimes(2);
    expect(audio.src).toBe('https://signed.test/audio-2.ogg');
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(toast.error).not.toHaveBeenCalled();
    expect(getPlayingAudioId()).toBe('a1');
  });

  it('D03: falhando de novo, avisa "Não foi possível tocar" e volta ao estado de play', async () => {
    FakeAudio.playQueue = ['reject', 'reject'];
    render(<AudioPlayButton item={audioItem()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tocar áudio recado.ogg' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Não foi possível tocar'));
    expect(createSignedUrl).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Tocar áudio recado.ogg' })).toBeInTheDocument();
    expect(getPlayingAudioId()).toBeNull();
  });

  it('D04: é um <button> nativo e focável — Enter/Espaço do navegador chegam no mesmo clique', async () => {
    const { container } = render(<AudioPlayButton item={audioItem()} />);
    const button = screen.getByRole('button', { name: 'Tocar áudio recado.ogg' });

    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
    button.focus();
    expect(document.activeElement).toBe(button);

    // O clique é o evento que Enter/Espaço produzem num botão nativo: alterna o som.
    await tocar(button);
    fireEvent.click(screen.getByRole('button', { name: 'Pausar áudio recado.ogg' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tocar áudio recado.ogg' })).toBeInTheDocument());
    expect(FakeAudio.created[0].pause).toHaveBeenCalled();
    expect(getPlayingAudioId()).toBeNull();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('D03/D02: pausar antes de a URL chegar não deixa o som começar sozinho depois', async () => {
    let liberar: ((value: unknown) => void) | null = null;
    createSignedUrl.mockImplementationOnce(
      () => new Promise((resolve) => { liberar = resolve; }),
    );
    render(<AudioPlayButton item={audioItem()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tocar áudio recado.ogg' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pausar áudio recado.ogg' }));

    await act(async () => {
      liberar?.({ data: { signedUrl: 'https://signed.test/audio-1.ogg' }, error: null });
    });

    expect(getPlayingAudioId()).toBeNull();
    expect(FakeAudio.created.every((audio) => audio.play.mock.calls.length === 0)).toBe(true);
    expect(screen.getByRole('button', { name: 'Tocar áudio recado.ogg' })).toBeInTheDocument();
  });

  it('D03: pausar durante a renovação da URL não reinicia o som depois', async () => {
    render(<AudioPlayButton item={audioItem()} />);
    await tocar();
    const audio = FakeAudio.created[0];
    expect(audio.src).toBe('https://signed.test/audio-1.ogg');

    // A URL expirou: o elemento erra e o componente renova (renovação em voo, adiada).
    let liberar: ((value: unknown) => void) | null = null;
    createSignedUrl.mockImplementationOnce(() => new Promise((resolve) => { liberar = resolve; }));
    act(() => {
      audio.fail();
    });
    await waitFor(() => expect(createSignedUrl).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: 'Pausar áudio recado.ogg' }));
    expect(getPlayingAudioId()).toBeNull();

    await act(async () => {
      liberar?.({ data: { signedUrl: 'https://signed.test/audio-2.ogg' }, error: null });
    });

    expect(audio.src).toBe('https://signed.test/audio-1.ogg');
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Tocar áudio recado.ogg' })).toBeInTheDocument();
  });

  it('D05: o clique do play não borbulha para o cartão (modo Selecionar não marca)', async () => {
    const cliqueNoCartao = vi.fn();
    render(
      <div onClick={cliqueNoCartao}>
        <AudioPlayButton item={audioItem()} />
      </div>,
    );

    await tocar();

    expect(cliqueNoCartao).not.toHaveBeenCalled();
  });

  it('A05: desmontar o cartão pausa o som e libera o áudio para os outros', async () => {
    const { unmount } = render(<AudioPlayButton item={audioItem()} />);
    await tocar();
    const audio = FakeAudio.created[0];
    expect(getPlayingAudioId()).toBe('a1');

    unmount();

    expect(audio.pause).toHaveBeenCalled();
    expect(getPlayingAudioId()).toBeNull();
  });

  it('A05: desmontar também libera o controle de volume da mídia', async () => {
    const detach = vi.fn();
    attachMediaVolume.mockReturnValueOnce(detach);
    const { unmount } = render(<AudioPlayButton item={audioItem()} />);
    await tocar();

    unmount();

    expect(detach).toHaveBeenCalled();
  });

  it('A01/D02: tocar o item B pausa o item A (um áudio por vez)', async () => {
    const a = audioItem();
    const b = audioItem({ id: 'b1', url: MEDIA_URL('audio-messages', 'conv-1/b1.ogg'), displayName: 'b1.ogg' });
    render(
      <>
        <AudioPlayButton item={a} />
        <AudioPlayButton item={b} />
      </>,
    );

    await tocar(screen.getAllByRole('button', { name: 'Tocar áudio recado.ogg' })[0]);

    // O rótulo do B cita o nome DELE: é por aqui que o leitor de tela distingue os dois.
    await tocar(screen.getByRole('button', { name: 'Tocar áudio b1.ogg' }), 'Pausar áudio b1.ogg');

    const [audioA, audioB] = FakeAudio.created;
    expect(audioA.pause).toHaveBeenCalled();
    expect(audioB.play).toHaveBeenCalled();
    expect(getPlayingAudioId()).toBe('b1');
    expect(screen.getAllByRole('button', { name: 'Tocar áudio recado.ogg' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Pausar áudio b1.ogg' })).toBeInTheDocument();
  });

  it('A06b: dois áudios com nomes diferentes têm rótulos diferentes', () => {
    const a = audioItem(); // recado.ogg
    const b = audioItem({
      id: 'b1',
      url: MEDIA_URL('audio-messages', 'conv-1/b1.ogg'),
      filename: 'audio-a1.wav',
      displayName: 'audio-a1.wav',
    });
    render(
      <>
        <AudioPlayButton item={a} />
        <AudioPlayButton item={b} />
      </>,
    );

    expect(screen.getByRole('button', { name: 'Tocar áudio recado.ogg' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tocar áudio audio-a1.wav' })).toBeInTheDocument();
  });

  it('A06b: tocando, o botão e a barra citam o nome do arquivo', async () => {
    render(<AudioPlayButton item={audioItem()} />);

    await tocar();
    act(() => {
      FakeAudio.created[0].loadMetadata(120);
      FakeAudio.created[0].seek(30);
    });

    expect(screen.getByRole('button', { name: 'Pausar áudio recado.ogg' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Progresso do áudio recado.ogg' })).toBeInTheDocument();
  });

  it('A06b: item sem nome mantém o rótulo antigo', () => {
    render(<AudioPlayButton item={audioItem({ filename: '', displayName: '' })} />);

    // Rótulo EXATAMENTE o antigo: sem nome não sobra espaço nem sufixo.
    expect(screen.getByRole('button', { name: /^Tocar áudio$/ })).toBeInTheDocument();
  });

  it('A06b: nome longo entra truncado em ~60 caracteres', () => {
    const longo = `${'a'.repeat(200)}.ogg`;
    render(<AudioPlayButton item={audioItem({ filename: longo, displayName: longo })} />);

    const botao = screen.getByRole('button', { name: /^Tocar áudio / });
    expect(botao).toHaveAttribute('aria-label', `Tocar áudio ${'a'.repeat(60)}…`);
  });
});

describe('vistas da aba Arquivos (A03/A04)', () => {
  it('FileCard: o play fica na linha de ações e só em item de áudio', () => {
    const { unmount } = render(
      <FileCard
        item={audioItem()}
        contactName="Ana Cliente"
        selected={false}
        onSelect={vi.fn()}
        onToggleSelection={vi.fn()}
        onPreview={vi.fn()}
        onForward={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );
    const botao = screen.getByRole('button', { name: 'Tocar áudio recado.ogg' });
    expect(botao.parentElement?.parentElement).toBe(
      screen.getByRole('button', { name: 'Visualizar' }).parentElement,
    );
    unmount();

    render(
      <FileCard
        item={IMAGE}
        contactName="Ana Cliente"
        selected={false}
        onSelect={vi.fn()}
        onToggleSelection={vi.fn()}
        onPreview={vi.fn()}
        onForward={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /^Tocar áudio/ })).not.toBeInTheDocument();
  });

  it('FilesListView: linha de áudio ganha o play e o clique não abre a prévia nem seleciona', async () => {
    const props = {
      items: [audioItem(), IMAGE],
      contactName: 'Ana Cliente',
      selectionMode: true,
      selectedIds: new Set<string>(),
      containerWidth: 900,
      onSelect: vi.fn(),
      onToggleSelection: vi.fn(),
      onPreview: vi.fn(),
      onRequestDelete: vi.fn(),
    };
    render(<FilesListView {...props} />);

    const linha = screen.getByTestId('files-item-a1');
    const botao = within(linha).getByRole('button', { name: 'Tocar áudio recado.ogg' });
    await tocar(botao);

    expect(props.onPreview).not.toHaveBeenCalled();
    expect(props.onToggleSelection).not.toHaveBeenCalled();
    expect(within(screen.getByTestId('files-item-m1')).queryByRole('button', { name: /^Tocar áudio/ }))
      .not.toBeInTheDocument();
  });

  it('FilesTableView: linha de áudio ganha o play e o clique não abre a prévia', async () => {
    const props = {
      items: [audioItem(), IMAGE],
      contactName: 'Ana Cliente',
      selectionMode: false,
      selectedIds: new Set<string>(),
      containerWidth: 900,
      sort: 'recent' as const,
      onSortChange: vi.fn(),
      onSelect: vi.fn(),
      onToggleSelection: vi.fn(),
      onPreview: vi.fn(),
      onRequestDelete: vi.fn(),
    };
    render(<FilesTableView {...props} />);

    const linha = screen.getByTestId('files-item-a1');
    await tocar(within(linha).getByRole('button', { name: 'Tocar áudio recado.ogg' }));

    expect(props.onPreview).not.toHaveBeenCalled();
    expect(within(screen.getByTestId('files-item-m1')).queryByRole('button', { name: /^Tocar áudio/ }))
      .not.toBeInTheDocument();
  });
});

/**
 * Q08 — o player do cartão (Grid, Lista e Tabela renderizam este mesmo botão) tem de
 * obedecer ao controle ÚNICO de volume das mídias de conversa, ao vivo.
 *
 * O volume global começa em 40 (ganho 0.16, ≠ 1) DE PROPÓSITO: o duplo de `Audio` nasce
 * com `volume = 1`, então só um valor diferente do padrão prova que a ligação rodou —
 * um teste que montasse no estado final passaria sem o `attachMediaVolume`.
 */
describe('Q08 — o áudio do cartão obedece o volume das mídias', () => {
  beforeEach(() => {
    act(() => {
      setVolume(40);
      setMuted(false);
    });
  });

  it('nasce no volume global e o acompanha ENQUANTO toca (mudar o volume muda element.volume)', async () => {
    render(<AudioPlayButton item={audioItem()} />);
    await tocar();
    const audio = FakeAudio.created[0];

    // Já no primeiro play: 40 no controle → 0.16 no elemento (curva perceptual de `toGain`).
    expect(audio.volume).toBeCloseTo(0.16, 5);

    // Melhor caso: o teto do controle.
    act(() => setVolume(100));
    expect(audio.volume).toBeCloseTo(1, 5);

    // Pior caso: silêncio de verdade, com o som em reprodução.
    act(() => setVolume(0));
    expect(audio.volume).toBeCloseTo(0, 5);

    // Meio da escala.
    act(() => setVolume(50));
    expect(audio.volume).toBeCloseTo(0.25, 5);

    // Tudo no MESMO elemento: o ajuste vem do controle global, sem recriar o player.
    expect(FakeAudio.created).toHaveLength(1);
    expect(audio.paused).toBe(false);
    expect(getPlayingAudioId()).toBe('a1');
  });

  it('o mudo global silencia o áudio do cartão e o desmudo devolve o volume, sem zerar', async () => {
    render(<AudioPlayButton item={audioItem()} />);
    await tocar();
    const audio = FakeAudio.created[0];
    expect(audio.muted).toBe(false);

    act(() => setMuted(true));
    expect(audio.muted).toBe(true);
    // D4: o mudo é estado próprio — desmutar devolve o volume de antes, não zera.
    expect(audio.volume).toBeCloseTo(0.16, 5);

    act(() => setMuted(false));
    expect(audio.muted).toBe(false);
    expect(audio.volume).toBeCloseTo(0.16, 5);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ═══════════════════════════════════════════════════════════
// Item 343 / R2-INB-050 — importação de mídia e salvamento de
// áudio gerado deixam objetos ÓRFÃOS no Storage quando o
// insert (a "entrada" no banco) falha.
//
// O defeito: o objeto sobe para o bucket, o insert do registro
// falha e ninguém remove o objeto — ele fica no bucket sem
// nenhuma linha que o referencie.
//
// A prova: RENDERIZA o `MediaLibraryAdmin` real (o componente que
// a tela usa) e dispara o fluxo do usuário; a asserção é sobre o
// `storage.remove` do MESMO caminho que acabou de ser enviado.
// ═══════════════════════════════════════════════════════════

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  getPublicUrl: vi.fn(),
  storageFrom: vi.fn(),
  invoke: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => {
  const makeFrom = () => ({
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    insert: (...args: unknown[]) => mocks.insert(...args),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
      in: vi.fn().mockResolvedValue({ error: null }),
    }),
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
      in: vi.fn().mockResolvedValue({ error: null }),
    }),
    eq: vi.fn().mockResolvedValue({ error: null }),
    in: vi.fn().mockResolvedValue({ error: null }),
  });

  return {
    supabase: {
      from: vi.fn(() => makeFrom()),
      storage: {
        from: (...args: unknown[]) => {
          mocks.storageFrom(...args);
          return {
            upload: (...a: unknown[]) => mocks.upload(...a),
            remove: (...a: unknown[]) => mocks.remove(...a),
            getPublicUrl: (...a: unknown[]) => mocks.getPublicUrl(...a),
          };
        },
      },
      functions: { invoke: (...args: unknown[]) => mocks.invoke(...args) },
      auth: { getUser: () => mocks.getUser() },
    },
  };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Áudio no jsdom não tem encoder (lamejs/AudioContext): a conversão devolve
// `undefined` e o upload segue com o arquivo original — o caminho real do hook.
vi.mock('@/utils/audioToMp3', () => ({
  convertAudioToMp3: vi.fn(),
  MAX_AUDIO_DURATION_S: 600,
}));

import { MediaLibraryAdmin } from '../MediaLibraryAdmin';
import { toast } from 'sonner';

// O `input type=file` é o mesmo da tela (escondido); o usuário o aciona pelo botão.
function getFileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement | null;
  if (!input) throw new Error('input de arquivo não encontrado na tela');
  return input;
}

// Radix Tabs só ativa a aba no `mousedown` (não no `click` puro).
async function abrirAba(name: RegExp) {
  const tab = await screen.findByRole('tab', { name });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
}

describe('MediaLibraryAdmin — limpeza de objeto órfão (item 343)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insert.mockResolvedValue({ error: null });
    mocks.upload.mockResolvedValue({ error: null });
    mocks.remove.mockResolvedValue({ error: null });
    mocks.getPublicUrl.mockReturnValue({
      data: { publicUrl: 'https://proj.supabase.co/storage/v1/object/public/audio-memes/x.mp3' },
    });
    mocks.invoke.mockResolvedValue({ data: {}, error: null });
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

    // Sem Audio real: a prévia da geração só precisa não quebrar o fluxo.
    vi.stubGlobal('Audio', class {
      play() { return Promise.resolve(); }
      pause() {}
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' }),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('remove do Storage o arquivo importado quando o insert falha', async () => {
    mocks.insert.mockResolvedValue({ error: { message: 'insert recusado' } });

    render(<MediaLibraryAdmin />);
    await abrirAba(/Áudios Meme/);

    const file = new File([new Uint8Array([1, 2, 3, 4])], 'risada.mp3', { type: 'audio/mpeg' });
    fireEvent.change(await waitFor(getFileInput), { target: { files: [file] } });

    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    const caminhoEnviado = mocks.upload.mock.calls[0][0] as string;
    expect(caminhoEnviado).toMatch(/^bulk_/);

    // O MESMO objeto que subiu tem de ser removido — não outro caminho.
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith([caminhoEnviado]));
    expect(mocks.storageFrom).toHaveBeenCalledWith('audio-memes');
    // Nada de sucesso inventado: o item não entrou na biblioteca.
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('0/1'));
  });

  it('NÃO remove o objeto quando o insert dá certo (importação normal segue intacta)', async () => {
    mocks.insert.mockResolvedValue({ error: null });

    render(<MediaLibraryAdmin />);
    await abrirAba(/Áudios Meme/);

    const file = new File([new Uint8Array([9, 9, 9])], 'aplausos.mp3', { type: 'audio/mpeg' });
    fireEvent.change(await waitFor(getFileInput), { target: { files: [file] } });

    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('1/1')));
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('remove do Storage o áudio gerado quando o insert ao salvar falha', async () => {
    mocks.invoke.mockImplementation((nome: string) => {
      if (nome === 'elevenlabs-sfx') {
        return Promise.resolve({ data: { audioContent: 'QUJD' }, error: null });
      }
      if (nome === 'classify-audio-meme') {
        return Promise.resolve({ data: { category: 'risada' }, error: null });
      }
      return Promise.resolve({ data: {}, error: null });
    });
    mocks.insert.mockResolvedValue({ error: { message: 'insert recusado' } });

    render(<MediaLibraryAdmin />);
    await abrirAba(/Áudios Meme/);
    fireEvent.click(await screen.findByRole('button', { name: /Gerar com IA/ }));

    const campo = await screen.findByPlaceholderText(/Risada de vilão/);
    fireEvent.change(campo, { target: { value: 'risada de vilão' } });
    fireEvent.click(screen.getByRole('button', { name: /Gerar Preview/ }));

    fireEvent.click(await screen.findByRole('button', { name: /Salvar na Biblioteca/ }));

    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    const caminhoEnviado = mocks.upload.mock.calls[0][0] as string;
    expect(caminhoEnviado).toMatch(/^ai_gen_/);
    expect(caminhoEnviado).toMatch(/\.mp3$/);

    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith([caminhoEnviado]));
    expect(mocks.storageFrom).toHaveBeenCalledWith('audio-memes');
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });
});

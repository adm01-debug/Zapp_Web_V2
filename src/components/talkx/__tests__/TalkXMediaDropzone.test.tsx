import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * X095 (V4) — envio de arquivo do template do Talk X no lugar do campo de URL.
 *
 * O limite de 16 MB (16 777 216 bytes) e a lista de tipos NÃO vêm do componente:
 * são o contrato do bucket `talkx-media` (CAP-059/X061) e estão escritos aqui à
 * mão, de propósito, como a especificação — se o componente divergir dela, este
 * arquivo fica vermelho. O arquivo de 17 MB e o `.exe` provam que a recusa
 * acontece ANTES do Storage: nada é enviado.
 *
 * O `Harness` guarda o estado como o editor de template vai guardar (componente
 * CONTROLADO) e publica o valor produzido para as asserções: o teste digita e
 * clica como o autor, não chama o `onChange` à mão.
 */

const mocks = vi.hoisted(() => ({
  storageFrom: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  profile: { id: '11111111-2222-3333-4444-555555555555' } as { id: string } | null,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { storage: { from: mocks.storageFrom } },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: mocks.profile }),
}));

import { TalkXMediaDropzone } from '../TalkXMediaDropzone';
import type { TalkxMediaValue } from '../useTalkXMediaUpload';

const MAX_BYTES = 16 * 1024 * 1024;

function makeFile(name: string, type: string, size: number): File {
  const file = new File([new Uint8Array(1)], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function Harness({ initial = null }: { initial?: TalkxMediaValue | null }) {
  const [value, setValue] = useState<TalkxMediaValue | null>(initial);
  return (
    <>
      <TalkXMediaDropzone value={value} onChange={setValue} />
      <pre data-testid="payload">{JSON.stringify(value)}</pre>
    </>
  );
}

function payload(): TalkxMediaValue | null {
  return JSON.parse(screen.getByTestId('payload').textContent ?? 'null') as TalkxMediaValue | null;
}

function chooseFile(file: File) {
  fireEvent.change(screen.getByTestId('talkx-media-input'), { target: { files: [file] } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.profile = { id: '11111111-2222-3333-4444-555555555555' };
  mocks.storageFrom.mockImplementation((bucket: string) => ({
    upload: (path: string, file: unknown, opts: unknown) => mocks.upload(bucket, path, file, opts),
    remove: (paths: string[]) => mocks.remove(bucket, paths),
  }));
  mocks.upload.mockResolvedValue({ data: { path: 'x' }, error: null });
  mocks.remove.mockResolvedValue({ data: null, error: null });
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 1920, height: 1080, close: vi.fn() })));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TalkXMediaDropzone (X095)', () => {
  it('recusa arquivo acima de 16 MB sem chamar o Storage', () => {
    render(<Harness />);
    chooseFile(makeFile('grande.jpg', 'image/jpeg', MAX_BYTES + 1));

    expect(screen.getByTestId('talkx-media-error')).toHaveTextContent('16 MB');
    expect(mocks.storageFrom).not.toHaveBeenCalled();
    expect(payload()).toBeNull();
  });

  it('aceita o arquivo no limite exato de 16 MB', async () => {
    render(<Harness />);
    chooseFile(makeFile('video.mp4', 'video/mp4', MAX_BYTES));

    await waitFor(() => expect(payload()?.media_type).toBe('video'));
    expect(screen.queryByTestId('talkx-media-error')).not.toBeInTheDocument();
    expect(mocks.upload).toHaveBeenCalledTimes(1);
  });

  it('recusa tipo fora da lista (.exe) sem chamar o Storage', () => {
    render(<Harness />);
    chooseFile(makeFile('instalador.exe', 'application/x-msdownload', 1024));

    expect(screen.getByTestId('talkx-media-error')).toHaveTextContent('não é aceito');
    expect(mocks.storageFrom).not.toHaveBeenCalled();
    expect(payload()).toBeNull();
  });

  it('recusa a queda por arrastar e soltar o mesmo arquivo inválido', () => {
    render(<Harness />);
    fireEvent.drop(screen.getByTestId('talkx-media-zone'), {
      dataTransfer: { files: [makeFile('script.exe', 'application/x-msdownload', 512)] },
    });

    expect(screen.getByTestId('talkx-media-error')).toHaveTextContent('não é aceito');
    expect(mocks.storageFrom).not.toHaveBeenCalled();
  });

  it('envia a imagem aceita ao bucket e preenche os 6 campos', async () => {
    render(<Harness />);
    chooseFile(makeFile('catalogo.jpg', 'image/jpeg', 245 * 1024));

    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));

    const [bucket, objectPath, file, options] = mocks.upload.mock.calls[0] as [string, string, File, { contentType: string }];
    expect(bucket).toBe('talkx-media');
    expect(objectPath.startsWith(`${mocks.profile!.id}/`)).toBe(true);
    expect(objectPath.endsWith('-catalogo.jpg')).toBe(true);
    expect(file.name).toBe('catalogo.jpg');
    expect(options.contentType).toBe('image/jpeg');

    expect(payload()).toEqual({
      media_url: `talkx-media/${objectPath}`,
      media_file_name: 'catalogo.jpg',
      media_type: 'image',
      media_size_bytes: 245 * 1024,
      media_width: 1920,
      media_height: 1080,
    });
    expect(screen.getByTestId('talkx-media-file')).toHaveTextContent('1920 x 1080 • 245 KB');
  });

  it('✕ limpa os 6 campos e apaga o objeto enviado do bucket', async () => {
    render(<Harness />);
    chooseFile(makeFile('catalogo.jpg', 'image/jpeg', 1024));
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    const objectPath = mocks.upload.mock.calls[0][1] as string;

    fireEvent.click(screen.getByTestId('talkx-media-remove'));

    expect(payload()).toBeNull();
    expect(screen.queryByTestId('talkx-media-file')).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('talkx-media', [objectPath]));
  });

  it('cancelar durante o envio apaga o objeto que chegou e não grava mídia', async () => {
    let resolveUpload!: (value: { data: { path: string }; error: null }) => void;
    mocks.upload.mockReturnValueOnce(new Promise((resolve) => { resolveUpload = resolve; }));

    render(<Harness />);
    chooseFile(makeFile('catalogo.jpg', 'image/jpeg', 1024));
    fireEvent.click(screen.getByTestId('talkx-media-cancel'));
    resolveUpload({ data: { path: 'x' }, error: null });

    await waitFor(() => expect(mocks.remove).toHaveBeenCalledTimes(1));
    expect(payload()).toBeNull();
    expect(screen.getByTestId('talkx-media-error')).toHaveTextContent('cancelado');
  });

  it('descarta o envio cancelado quando outro arquivo já foi escolhido', async () => {
    let resolveA!: (value: { data: { path: string }; error: null }) => void;
    let resolveB!: (value: { data: { path: string }; error: null }) => void;
    mocks.upload
      .mockImplementationOnce(() => new Promise((resolve) => { resolveA = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveB = resolve; }));

    render(<Harness />);
    chooseFile(makeFile('a.pdf', 'application/pdf', 1024));
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    const pathA = mocks.upload.mock.calls[0][1] as string;

    fireEvent.click(screen.getByTestId('talkx-media-cancel'));
    chooseFile(makeFile('b.pdf', 'application/pdf', 1024));
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(2));
    const pathB = mocks.upload.mock.calls[1][1] as string;

    // O envio antigo resolve depois de cancelado: o objeto dele vai para o
    // lixo, não vira mídia e o "Enviando" do novo não é derrubado.
    resolveA({ data: { path: pathA }, error: null });
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('talkx-media', [pathA]));
    expect(payload()).toBeNull();
    expect(screen.getByTestId('talkx-media-status')).toHaveTextContent('b.pdf');

    resolveB({ data: { path: pathB }, error: null });
    await waitFor(() => expect(payload()?.media_url).toBe(`talkx-media/${pathB}`));
    expect(payload()?.media_file_name).toBe('b.pdf');
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('talkx-media-status')).not.toBeInTheDocument();
  });

  it('não remove do bucket um valor persistido; só objetos enviados nesta sessão', async () => {
    const persistedPath = `${mocks.profile!.id}/0b1c2d3e-catalogo.jpg`;
    const persisted: TalkxMediaValue = {
      media_url: `talkx-media/${persistedPath}`,
      media_type: 'image',
      media_file_name: 'catalogo.jpg',
      media_size_bytes: 1024,
      media_width: 800,
      media_height: 600,
    };

    // Remover: o valor sai da tela, mas o objeto persistido fica no bucket —
    // quem decide o destino dele é o salvamento do editor.
    const first = render(<Harness initial={persisted} />);
    fireEvent.click(screen.getByTestId('talkx-media-remove'));
    expect(payload()).toBeNull();
    await act(async () => {});
    expect(mocks.remove).not.toHaveBeenCalled();

    // Trocar: um envio novo desta sessão continua removível; o persistido, não.
    chooseFile(makeFile('novo.pdf', 'application/pdf', 1024));
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    const sessionPath = mocks.upload.mock.calls[0][1] as string;
    await waitFor(() => expect(payload()?.media_url).toBe(`talkx-media/${sessionPath}`));
    fireEvent.click(screen.getByTestId('talkx-media-remove'));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('talkx-media', [sessionPath]));
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.remove).not.toHaveBeenCalledWith('talkx-media', [persistedPath]);
    first.unmount();

    // "Usar link" sobre o valor persistido: mesma regra, nada sai do bucket.
    render(<Harness initial={persisted} />);
    fireEvent.click(screen.getByTestId('talkx-media-link-toggle'));
    expect(payload()).toBeNull();
    await act(async () => {});
    expect(mocks.remove).toHaveBeenCalledTimes(1);
  });

  it('sem profile.id recusa o envio antes do Storage, sem caminho sem prefixo', async () => {
    mocks.profile = null;
    render(<Harness />);
    chooseFile(makeFile('catalogo.pdf', 'application/pdf', 1024));

    expect(await screen.findByTestId('talkx-media-error')).toHaveTextContent(/perfil/i);
    expect(mocks.storageFrom).not.toHaveBeenCalled();
    expect(payload()).toBeNull();
    expect(screen.queryByTestId('talkx-media-status')).not.toBeInTheDocument();
  });

  it('avisa que o texto da mensagem não acompanha o áudio', async () => {
    render(<Harness />);
    chooseFile(makeFile('recado.ogg', 'audio/ogg', 2048));

    await waitFor(() => expect(payload()?.media_type).toBe('audio'));
    expect(screen.getByTestId('talkx-media-audio-warning')).toHaveTextContent('não é enviado junto com o áudio');
  });

  it('"Usar link" grava a URL do template antigo sem tocar no bucket', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('talkx-media-link-toggle'));
    fireEvent.change(screen.getByTestId('talkx-media-link-input'), {
      target: { value: 'https://exemplo.supabase.co/storage/v1/object/sign/catalogo.pdf' },
    });

    expect(payload()).toEqual({
      media_url: 'https://exemplo.supabase.co/storage/v1/object/sign/catalogo.pdf',
      media_type: 'document',
      media_file_name: null,
      media_size_bytes: null,
      media_width: null,
      media_height: null,
    });
    expect(mocks.storageFrom).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('talkx-media-remove'));
    expect(payload()).toBeNull();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('mensagem de falha do Storage não deixa mídia gravada', async () => {
    mocks.upload.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });

    render(<Harness />);
    chooseFile(makeFile('catalogo.jpg', 'image/jpeg', 1024));

    expect(await screen.findByTestId('talkx-media-error')).toHaveTextContent('Falha ao enviar');
    expect(payload()).toBeNull();
  });
});

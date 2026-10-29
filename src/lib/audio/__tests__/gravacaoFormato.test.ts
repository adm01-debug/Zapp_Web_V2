/**
 * G9 — o gravador escolhe um formato que o navegador sabe gravar.
 * Aqui provamos a decisão isolada: mime preferido por `isTypeSupported`, e a
 * extensão/Content-Type que saem do mime real do blob.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  PREFERENCIA_GRAVACAO,
  escolherMimeGravacao,
  formatoDeUpload,
  mensagemErroGravacao,
  mimeBase,
} from '@/lib/audio/gravacaoFormato';

/** MediaRecorder fake cujo isTypeSupported aceita só os prefixos passados. */
function stubMediaRecorder(suportados: string[] | null) {
  class Fake {
    static isTypeSupported = suportados ? (tipo: string) => suportados.some((s) => tipo.startsWith(s)) : undefined;
  }
  vi.stubGlobal('MediaRecorder', Fake);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('escolherMimeGravacao', () => {
  it('escolhe webm/opus quando o navegador suporta (Chrome/Edge/Firefox)', () => {
    stubMediaRecorder(['audio/webm']);
    expect(escolherMimeGravacao()).toBe('audio/webm;codecs=opus');
  });

  it('escolhe audio/mp4 no Safari, que recusa webm', () => {
    stubMediaRecorder(['audio/mp4']);
    expect(escolherMimeGravacao()).toBe('audio/mp4');
  });

  it('devolve null quando nenhum formato da lista é suportado (navegador decide o padrão)', () => {
    stubMediaRecorder([]);
    expect(escolherMimeGravacao()).toBeNull();
    expect(PREFERENCIA_GRAVACAO.length).toBeGreaterThan(0);
  });

  it('sem isTypeSupported (navegador antigo) mantém a primeira preferência', () => {
    stubMediaRecorder(null);
    expect(escolherMimeGravacao()).toBe(PREFERENCIA_GRAVACAO[0]);
  });

  it('sem MediaRecorder definido não lança', () => {
    expect(typeof MediaRecorder).toBe('undefined');
    expect(escolherMimeGravacao()).toBe(PREFERENCIA_GRAVACAO[0]);
  });
});

describe('formatoDeUpload', () => {
  it('mime base descarta os codecs', () => {
    expect(mimeBase('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(mimeBase('')).toBe('');
    expect(mimeBase(undefined)).toBe('');
  });

  it('mp4 vira m4a com Content-Type audio/mp4 (Safari)', () => {
    expect(formatoDeUpload('audio/mp4')).toEqual({ contentType: 'audio/mp4', extensao: 'm4a' });
  });

  it('webm continua webm (Chrome)', () => {
    expect(formatoDeUpload('audio/webm;codecs=opus')).toEqual({ contentType: 'audio/webm', extensao: 'webm' });
  });

  it('ogg vira ogg (Firefox)', () => {
    expect(formatoDeUpload('audio/ogg;codecs=opus')).toEqual({ contentType: 'audio/ogg', extensao: 'ogg' });
  });

  it('mime desconhecido ou vazio mantém webm (decisão do SL-072)', () => {
    expect(formatoDeUpload('')).toEqual({ contentType: 'audio/webm', extensao: 'webm' });
    expect(formatoDeUpload('application/octet-stream')).toEqual({ contentType: 'audio/webm', extensao: 'webm' });
  });
});

describe('mensagemErroGravacao', () => {
  it('distingue permissão negada', () => {
    expect(mensagemErroGravacao({ name: 'NotAllowedError' })).toContain('Permissão do microfone negada');
    expect(mensagemErroGravacao({ name: 'SecurityError' })).toContain('Permissão do microfone negada');
  });

  it('distingue microfone ausente', () => {
    expect(mensagemErroGravacao({ name: 'NotFoundError' })).toContain('Nenhum microfone disponível');
    expect(mensagemErroGravacao({ name: 'NotReadableError' })).toContain('Nenhum microfone disponível');
  });

  it('distingue formato não suportado de microfone', () => {
    const formato = mensagemErroGravacao({ name: 'NotSupportedError' });
    expect(formato).toContain('formato compatível');
    expect(formato).not.toBe(mensagemErroGravacao({ name: 'NotAllowedError' }));
  });

  it('erro desconhecido cai na mensagem genérica de microfone', () => {
    expect(mensagemErroGravacao(new Error('boom'))).toBe('Não foi possível acessar o microfone.');
    expect(mensagemErroGravacao(null)).toBe('Não foi possível acessar o microfone.');
  });
});

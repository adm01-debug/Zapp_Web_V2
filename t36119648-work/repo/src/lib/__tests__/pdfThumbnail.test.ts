import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * M01 — miniatura da 1ª página de PDF.
 *
 * `pdfjs-dist` é mockado (a biblioteca de verdade precisa de worker + canvas), mas o módulo é
 * importado do MESMO jeito que em produção — `await import('pdfjs-dist')` — e a fábrica do mock
 * conta os carregamentos: é assim que o teste prova o carregamento sob demanda.
 */
const pdfjsMock = vi.hoisted(() => ({
  carregamentos: 0,
  getDocument: vi.fn(),
  workerSrc: '',
}));

vi.mock('pdfjs-dist', () => {
  pdfjsMock.carregamentos += 1;
  return {
    getDocument: (...args: unknown[]) => pdfjsMock.getDocument(...args),
    GlobalWorkerOptions: {
      get workerSrc() {
        return pdfjsMock.workerSrc;
      },
      set workerSrc(valor: string) {
        pdfjsMock.workerSrc = valor;
      },
    },
  };
});

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: '/assets/pdf.worker.min-mock.mjs',
}));

vi.mock('@/lib/logger', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  contarMiniaturasPdfEmCache,
  limparCacheMiniaturasPdf,
  PDF_THUMBNAIL_CACHE_MAX,
  PDF_THUMBNAIL_LARGURA_PADRAO,
  PDF_THUMBNAIL_MAX_BYTES,
  PDF_THUMBNAIL_TIMEOUT_MS,
  renderPdfThumbnail,
} from '@/lib/pdfThumbnail';
import { log } from '@/lib/logger';

const CONTEUDO_BLOB = 'miniatura-jpeg';
const BASE = 'https://proj.supabase.co/storage/v1/object/sign/whatsapp-media/';
const urlPdf = (nome: string, token = 'token-1') => `${BASE}${nome}?token=${token}`;

/* ------------------------------------------------------------------ *
 * pdfjs falso
 * ------------------------------------------------------------------ */

function documentoFalso(paginas = 1) {
  const paginasRenderizadas: number[] = [];
  const render = vi.fn((_parametros: { canvas: HTMLCanvasElement }) => ({
    promise: Promise.resolve(),
    cancel: vi.fn(),
  }));
  const getPage = vi.fn(async (numero: number) => {
    if (numero > paginas) throw new Error(`Página ${numero} não existe`);
    paginasRenderizadas.push(numero);
    return {
      getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
      render,
    };
  });
  return { getPage, render, paginasRenderizadas };
}

interface CargaFalsa {
  parametros: { data?: Uint8Array; verbosity?: number };
  documento: ReturnType<typeof documentoFalso>;
  destroy: ReturnType<typeof vi.fn>;
  abrir: () => void;
  falhar: (erro: unknown) => void;
}

/** Cada `getDocument` vira uma carga que o teste abre (ou faz falhar) quando quiser. */
function instalarPdf({ paginas = 1, automatico = true } = {}): CargaFalsa[] {
  const cargas: CargaFalsa[] = [];
  pdfjsMock.getDocument.mockImplementation((parametros: { data?: Uint8Array; verbosity?: number }) => {
    const documento = documentoFalso(paginas);
    const destroy = vi.fn(async () => undefined);
    let abrir: () => void = () => undefined;
    let falhar: (erro: unknown) => void = () => undefined;
    const promessa = new Promise<ReturnType<typeof documentoFalso>>((resolve, reject) => {
      abrir = () => resolve(documento);
      falhar = reject;
    });
    cargas.push({ parametros, documento, destroy, abrir, falhar });
    if (automatico) abrir();
    return { promise: promessa, destroy };
  });
  return cargas;
}

function erroNomeado(nome: string, mensagem = 'falhou') {
  const erro = new Error(mensagem);
  erro.name = nome;
  return erro;
}

/* ------------------------------------------------------------------ *
 * fetch falso
 * ------------------------------------------------------------------ */

const fetchMock = vi.fn();

function respostaOk({ bytes = 2048, contentLength, corpo }: {
  bytes?: number;
  contentLength?: number;
  corpo?: ArrayBuffer;
} = {}) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(contentLength === undefined ? {} : { 'content-length': String(contentLength) }),
    arrayBuffer: async () => corpo ?? new ArrayBuffer(bytes),
  };
}

/** ArrayBuffer "grande" sem alocar os bytes: a lib só lê o `byteLength`. */
function bufferComTamanho(byteLength: number) {
  return { byteLength } as ArrayBuffer;
}

beforeEach(() => {
  limparCacheMiniaturasPdf();
  pdfjsMock.getDocument.mockReset();
  vi.mocked(log.warn).mockClear();

  fetchMock.mockReset();
  fetchMock.mockImplementation(() => Promise.resolve(respostaOk()));
  vi.stubGlobal('fetch', (...args: unknown[]) => fetchMock(...args));

  // jsdom não desenha canvas: a lib usa `toBlob`; `toDataURL` fica proibido no teste.
  Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
    configurable: true,
    value: function toBlobFalso(callback: (blob: Blob | null) => void, tipo?: string) {
      callback(new Blob([CONTEUDO_BLOB], { type: tipo ?? 'image/jpeg' }));
    },
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
    configurable: true,
    value: vi.fn(() => {
      throw new Error('toDataURL não pode ser usado nesta miniatura');
    }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/* ------------------------------------------------------------------ *
 * carregamento sob demanda
 * ------------------------------------------------------------------ */

describe('renderPdfThumbnail — pdfjs-dist só sob demanda', () => {
  it('não carrega pdfjs-dist no import do módulo e só o carrega na primeira miniatura', async () => {
    // Primeiro teste do arquivo: se a lib importasse pdfjs no topo, o contador já seria 1 aqui.
    expect(pdfjsMock.carregamentos).toBe(0);

    instalarPdf();
    await renderPdfThumbnail(urlPdf('a.pdf'));

    expect(pdfjsMock.carregamentos).toBe(1);

    // Segunda miniatura: o módulo já está carregado, não é importado de novo.
    await renderPdfThumbnail(urlPdf('b.pdf'));
    expect(pdfjsMock.carregamentos).toBe(1);
  });

  it('não tem import estático de pdfjs-dist no arquivo-fonte (o contrato M03 varre o resto)', () => {
    const origem = readFileSync(join(process.cwd(), 'src/lib/pdfThumbnail.ts'), 'utf8');
    const estaticos = origem
      .split('\n')
      .filter((linha) => /^\s*import\b/.test(linha) && !/^\s*import\s*\(/.test(linha) && linha.includes('pdfjs-dist'));

    expect(estaticos).toEqual([]);
    expect(origem).toContain("import('pdfjs-dist')");
    expect(origem).toContain("import('pdfjs-dist/build/pdf.worker.min.mjs?url')");
  });

  it('aponta o worker para o asset resolvido com ?url e manda os BYTES baixados ao getDocument', async () => {
    const cargas = instalarPdf();

    const blob = await renderPdfThumbnail(urlPdf('doc.pdf', 'token-abc'));

    expect(blob).not.toBeNull();
    expect(pdfjsMock.workerSrc).toBe('/assets/pdf.worker.min-mock.mjs');
    expect(fetchMock).toHaveBeenCalledWith(urlPdf('doc.pdf', 'token-abc'), expect.objectContaining({ credentials: 'omit' }));
    expect(cargas).toHaveLength(1);
    expect(cargas[0].parametros.data).toBeInstanceOf(Uint8Array);
    expect(cargas[0].parametros.verbosity).toBe(0);
    // PDF fechado depois de usar: nada de worker pendurado por miniatura.
    expect(cargas[0].destroy).toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ *
 * página 1, canvas e Blob
 * ------------------------------------------------------------------ */

describe('renderPdfThumbnail — só a página 1, em canvas, como Blob', () => {
  it('renderiza a página 1 no canvas e devolve o Blob do toBlob (nunca toDataURL)', async () => {
    const cargas = instalarPdf({ paginas: 3 });

    const blob = await renderPdfThumbnail(urlPdf('relatorio.pdf'));

    expect(blob).toBeInstanceOf(Blob);
    expect(await blob?.text()).toBe(CONTEUDO_BLOB);

    const { documento } = cargas[0];
    expect(documento.getPage).toHaveBeenCalledTimes(1);
    expect(documento.getPage).toHaveBeenCalledWith(1);
    expect(documento.paginasRenderizadas).toEqual([1]);

    const parametros = documento.render.mock.calls[0][0];
    expect(parametros.canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(parametros.canvas.width).toBe(PDF_THUMBNAIL_LARGURA_PADRAO);
    expect(parametros.canvas.height).toBe(Math.round(800 * (PDF_THUMBNAIL_LARGURA_PADRAO / 600)));
    expect(vi.mocked(parametros.canvas.toDataURL)).not.toHaveBeenCalled();
  });

  it('a largura pedida define a escala do viewport e a largura do canvas', async () => {
    const cargas = instalarPdf();

    await renderPdfThumbnail(urlPdf('foto.pdf'), { largura: 150 });

    const parametros = cargas[0].documento.render.mock.calls[0][0] as { canvas: HTMLCanvasElement };
    expect(parametros.canvas.width).toBe(150);
    expect(parametros.canvas.height).toBe(200);
  });
});

/* ------------------------------------------------------------------ *
 * fila
 * ------------------------------------------------------------------ */

describe('renderPdfThumbnail — fila de no máximo 2', () => {
  it('nunca deixa mais de 2 renderizações em andamento e respeita a ordem de chegada', async () => {
    const cargas = instalarPdf({ automatico: false });
    const urls = [1, 2, 3, 4, 5].map((n) => urlPdf(`f${n}.pdf`));

    const promessas = urls.map((url) => renderPdfThumbnail(url));

    // Só as duas primeiras passam do download; a fila segura as outras três.
    await vi.waitFor(() => expect(cargas).toHaveLength(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cargas).toHaveLength(2);
    expect(fetchMock.mock.calls.map((chamada) => chamada[0])).toEqual([urls[0], urls[1]]);

    cargas[0].abrir();
    cargas[1].abrir();
    await vi.waitFor(() => expect(cargas).toHaveLength(4));
    expect(fetchMock.mock.calls.map((chamada) => chamada[0])).toEqual([urls[0], urls[1], urls[2], urls[3]]);

    cargas[2].abrir();
    cargas[3].abrir();
    await vi.waitFor(() => expect(cargas).toHaveLength(5));
    cargas[4].abrir();

    const resultados = await Promise.all(promessas);
    expect(resultados.every((blob) => blob instanceof Blob)).toBe(true);
  });

  it('uma falha não trava a fila: a vaga volta para o próximo', async () => {
    const cargas = instalarPdf({ automatico: false });

    const promessas = [1, 2, 3].map((n) => renderPdfThumbnail(urlPdf(`x${n}.pdf`)));
    await vi.waitFor(() => expect(cargas).toHaveLength(2));

    cargas[0].falhar(erroNomeado('PasswordException', 'Password required'));
    cargas[1].abrir();

    await vi.waitFor(() => expect(cargas).toHaveLength(3));
    cargas[2].abrir();

    const [primeiro, segundo, terceiro] = await Promise.all(promessas);
    expect(primeiro).toBeNull();
    expect(segundo).toBeInstanceOf(Blob);
    expect(terceiro).toBeInstanceOf(Blob);
  });
});

/* ------------------------------------------------------------------ *
 * cache
 * ------------------------------------------------------------------ */

describe('renderPdfThumbnail — cache LRU por chave estável', () => {
  it('a mesma origem não renderiza duas vezes, mesmo com o token da assinatura trocado', async () => {
    const cargas = instalarPdf();

    await renderPdfThumbnail(urlPdf('contrato.pdf', 'token-antigo'));
    await renderPdfThumbnail(urlPdf('contrato.pdf', 'token-novo'));

    expect(cargas).toHaveLength(1);
    expect(contarMiniaturasPdfEmCache()).toBe(1);
  });

  it('a chave explícita do chamador vence e a largura faz parte da chave', async () => {
    const cargas = instalarPdf();
    const url = urlPdf('contrato.pdf');

    await renderPdfThumbnail(url, { chave: 'midia-1' });
    await renderPdfThumbnail(url, { chave: 'midia-1' });
    expect(cargas).toHaveLength(1);

    await renderPdfThumbnail(url, { chave: 'midia-1', largura: 150 });
    expect(cargas).toHaveLength(2);
  });

  it('guarda no máximo 60 miniaturas e descarta a mais antiga', async () => {
    const cargas = instalarPdf();
    const urls = Array.from({ length: PDF_THUMBNAIL_CACHE_MAX + 1 }, (_valor, indice) => urlPdf(`arq-${indice}.pdf`));

    for (const url of urls) {
      await renderPdfThumbnail(url);
    }

    expect(cargas).toHaveLength(PDF_THUMBNAIL_CACHE_MAX + 1);
    expect(contarMiniaturasPdfEmCache()).toBe(PDF_THUMBNAIL_CACHE_MAX);

    // A mais antiga saiu do cache: renderiza de novo. A última continua lá: não renderiza.
    const antes = cargas.length;
    await renderPdfThumbnail(urls[0]);
    expect(cargas).toHaveLength(antes + 1);
    await renderPdfThumbnail(urls[urls.length - 1]);
    expect(cargas).toHaveLength(antes + 1);
  });

  it('falha não entra no cache', async () => {
    const cargas = instalarPdf({ automatico: false });
    const promessa = renderPdfThumbnail(urlPdf('quebrado.pdf'));

    await vi.waitFor(() => expect(cargas).toHaveLength(1));
    cargas[0].falhar(erroNomeado('InvalidPDFException', 'Invalid PDF structure'));

    await expect(promessa).resolves.toBeNull();
    expect(contarMiniaturasPdfEmCache()).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * teto de 25 MB
 * ------------------------------------------------------------------ */

describe('renderPdfThumbnail — teto de 25 MB', () => {
  it('content-length acima do teto devolve null sem nem carregar a biblioteca', async () => {
    const cargas = instalarPdf();
    fetchMock.mockImplementation(() =>
      Promise.resolve(respostaOk({ bytes: 10, contentLength: PDF_THUMBNAIL_MAX_BYTES + 1 })));

    await expect(renderPdfThumbnail(urlPdf('enorme.pdf'))).resolves.toBeNull();

    expect(cargas).toHaveLength(0);
  });

  it('sem content-length, os bytes decidem: acima do teto null, no limite exato renderiza', async () => {
    const cargas = instalarPdf();

    fetchMock.mockImplementation(() =>
      Promise.resolve(respostaOk({ corpo: bufferComTamanho(PDF_THUMBNAIL_MAX_BYTES + 1) })));
    await expect(renderPdfThumbnail(urlPdf('grande.pdf'))).resolves.toBeNull();
    expect(cargas).toHaveLength(0);
    expect(contarMiniaturasPdfEmCache()).toBe(0);

    fetchMock.mockImplementation(() =>
      Promise.resolve(respostaOk({ corpo: bufferComTamanho(PDF_THUMBNAIL_MAX_BYTES) })));
    await expect(renderPdfThumbnail(urlPdf('grande.pdf'))).resolves.toBeInstanceOf(Blob);
    expect(cargas).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ *
 * cancelamento
 * ------------------------------------------------------------------ */

describe('renderPdfThumbnail — AbortSignal', () => {
  it('sinal já abortado devolve null sem baixar nada', async () => {
    const cargas = instalarPdf();
    const controlador = new AbortController();
    controlador.abort();

    const resultado = await renderPdfThumbnail(urlPdf('a.pdf'), { sinal: controlador.signal });

    expect(resultado).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cargas).toHaveLength(0);
  });

  it('abortar durante a renderização cancela o desenho, devolve null e não enche o cache', async () => {
    const cargas = instalarPdf({ automatico: false });
    const cancelar = vi.fn();
    const controlador = new AbortController();

    const promessa = renderPdfThumbnail(urlPdf('lento.pdf'), { sinal: controlador.signal });

    await vi.waitFor(() => expect(cargas).toHaveLength(1));
    // Render que nunca termina: o abort é a única saída.
    cargas[0].documento.render.mockImplementation(() => ({
      promise: new Promise<void>(() => undefined),
      cancel: cancelar,
    }));
    cargas[0].abrir();
    await vi.waitFor(() => expect(cargas[0].documento.render).toHaveBeenCalled());

    controlador.abort();

    await expect(promessa).resolves.toBeNull();
    expect(cancelar).toHaveBeenCalled();
    expect(cargas[0].destroy).toHaveBeenCalled();
    expect(contarMiniaturasPdfEmCache()).toBe(0);
  });

  it('abortar quem está na FILA resolve null na hora, sem baixar e sem ocupar vaga', async () => {
    const cargas = instalarPdf({ automatico: false });
    const controlador = new AbortController();

    const primeiro = renderPdfThumbnail(urlPdf('a.pdf'));
    const segundo = renderPdfThumbnail(urlPdf('b.pdf'));
    const terceiro = renderPdfThumbnail(urlPdf('c.pdf'), { sinal: controlador.signal });

    // 1 e 2 pegaram as vagas; 3 está parado em `espera` (nunca chamou o fetch).
    await vi.waitFor(() => expect(cargas).toHaveLength(2));
    expect(fetchMock.mock.calls.map((chamada) => chamada[0])).toEqual([urlPdf('a.pdf'), urlPdf('b.pdf')]);

    controlador.abort();

    // A terceira resolve SEM que ninguém tenha liberado vaga (as duas primeiras seguem em voo).
    await expect(terceiro).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    cargas[0].abrir();
    cargas[1].abrir();
    const [resultadoPrimeiro, resultadoSegundo] = await Promise.all([primeiro, segundo]);
    expect(resultadoPrimeiro).toBeInstanceOf(Blob);
    expect(resultadoSegundo).toBeInstanceOf(Blob);
    // As vagas liberadas não acordam trabalho fantasma: nada mais entrou na fila.
    expect(cargas).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ *
 * erro nunca vira exceção
 * ------------------------------------------------------------------ */

describe('renderPdfThumbnail — erro vira null, nunca exceção', () => {
  it('PDF protegido por senha', async () => {
    const cargas = instalarPdf({ automatico: false });
    const promessa = renderPdfThumbnail(urlPdf('com-senha.pdf'));

    await vi.waitFor(() => expect(cargas).toHaveLength(1));
    cargas[0].falhar(erroNomeado('PasswordException', 'Password required'));

    await expect(promessa).resolves.toBeNull();
  });

  it('PDF corrompido', async () => {
    const cargas = instalarPdf({ automatico: false });
    const promessa = renderPdfThumbnail(urlPdf('corrompido.pdf'));

    await vi.waitFor(() => expect(cargas).toHaveLength(1));
    cargas[0].falhar(erroNomeado('InvalidPDFException', 'Invalid PDF structure'));

    await expect(promessa).resolves.toBeNull();
  });

  it('getDocument lançando na hora (worker indisponível)', async () => {
    instalarPdf();
    pdfjsMock.getDocument.mockImplementationOnce(() => {
      throw new Error('Worker indisponível');
    });

    await expect(renderPdfThumbnail(urlPdf('sem-worker.pdf'))).resolves.toBeNull();
  });

  it('render do canvas rejeitando', async () => {
    instalarPdf();
    pdfjsMock.getDocument.mockImplementation(() => ({
      promise: Promise.resolve({
        getPage: async () => ({
          getViewport: () => ({ width: 600, height: 800 }),
          render: () => ({ promise: Promise.reject(new Error('canvas 2d indisponível')), cancel: vi.fn() }),
        }),
      }),
      destroy: vi.fn(async () => undefined),
    }));

    await expect(renderPdfThumbnail(urlPdf('render-quebrado.pdf'))).resolves.toBeNull();
  });

  it('resposta HTTP sem sucesso e rede/CORS fora devolvem null', async () => {
    instalarPdf();
    fetchMock.mockImplementation(() =>
      Promise.resolve({ ok: false, status: 403, headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(0) }));
    await expect(renderPdfThumbnail(urlPdf('sem-permissao.pdf'))).resolves.toBeNull();

    fetchMock.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
    await expect(renderPdfThumbnail(urlPdf('sem-cors.pdf'))).resolves.toBeNull();
  });

  it('acima de 15 s desiste: null, com o trabalho em voo descartado', async () => {
    // Aquece o import dinâmico com timers reais; depois o teste usa fake timers só para o prazo.
    instalarPdf();
    await renderPdfThumbnail(urlPdf('aquecimento.pdf'));
    limparCacheMiniaturasPdf();

    vi.useFakeTimers();
    const cargas = instalarPdf({ automatico: false });
    const promessa = renderPdfThumbnail(urlPdf('travado.pdf'));

    await vi.waitFor(() => expect(cargas).toHaveLength(1), { timeout: 2000, interval: 1 });
    await vi.advanceTimersByTimeAsync(PDF_THUMBNAIL_TIMEOUT_MS);

    await expect(promessa).resolves.toBeNull();
    expect(cargas[0].destroy).toHaveBeenCalled();
    expect(contarMiniaturasPdfEmCache()).toBe(0);
  });

  it('o prazo de 15 s aborta o DOWNLOAD em voo: null, getDocument nunca chamado e a vaga volta', async () => {
    // Aquece o import dinâmico com timers reais; depois o teste usa fake timers só para o prazo.
    instalarPdf();
    await renderPdfThumbnail(urlPdf('aquecimento-download.pdf'));
    limparCacheMiniaturasPdf();

    vi.useFakeTimers();
    const cargas = instalarPdf();
    let sinalDoFetch: AbortSignal | undefined;
    fetchMock.mockImplementation((_url: string, opcoes: { signal?: AbortSignal } = {}) => {
      sinalDoFetch = opcoes.signal;
      return new Promise(() => undefined); // download que nunca termina
    });

    const promessa = renderPdfThumbnail(urlPdf('download-travado.pdf'));
    for (let passo = 0; passo < 20 && !sinalDoFetch; passo += 1) await Promise.resolve();
    expect(sinalDoFetch?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(PDF_THUMBNAIL_TIMEOUT_MS);

    await expect(promessa).resolves.toBeNull();
    // O download foi ABORTADO de verdade (não seguiu baixando em segundo plano)...
    expect(sinalDoFetch?.aborted).toBe(true);
    // ...e o pdfjs nem foi carregado: nada de getDocument/render fora da fila.
    expect(cargas).toHaveLength(0);

    // A vaga voltou e a fila funciona: a miniatura seguinte roda normal.
    fetchMock.mockImplementation(() => Promise.resolve(respostaOk()));
    await expect(renderPdfThumbnail(urlPdf('depois-do-prazo.pdf'))).resolves.toBeInstanceOf(Blob);
    expect(cargas).toHaveLength(1);
  });

  it('canvas que não devolve Blob (toBlob nulo ou ausente) devolve null', async () => {
    instalarPdf();
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      configurable: true,
      value: function toBlobNulo(callback: (blob: Blob | null) => void) {
        callback(null);
      },
    });
    await expect(renderPdfThumbnail(urlPdf('sem-blob.pdf'))).resolves.toBeNull();

    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', { configurable: true, value: undefined });
    await expect(renderPdfThumbnail(urlPdf('sem-toblob.pdf'))).resolves.toBeNull();
  });

  it('a URL assinada não vai para o log (só origem + caminho)', async () => {
    instalarPdf();
    fetchMock.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));

    await renderPdfThumbnail(urlPdf('a.pdf', 'token-secreto-de-teste'));

    const contexto = JSON.stringify(vi.mocked(log.warn).mock.calls);
    expect(contexto).not.toContain('token-secreto-de-teste');
    expect(contexto).toContain('/storage/v1/object/sign/whatsapp-media/a.pdf');
  });
});

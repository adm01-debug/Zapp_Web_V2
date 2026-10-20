/**
 * M01 — Miniatura da 1ª página de PDF (aba Arquivos do painel do chat).
 *
 * A biblioteca `pdfjs-dist` NÃO pode entrar no bundle inicial (decisão D03 do plano
 * `docs/plans/PLANO_MINIATURAS_E_FIGURINHAS_ARQUIVOS_2026-10-07.md`): aqui ela é carregada
 * por `import()` dinâmico, na primeira miniatura pedida, nunca no topo do módulo. O worker
 * é resolvido com `?url` e apontado em `GlobalWorkerOptions.workerSrc` uma única vez.
 *
 * Regras deste módulo (o chamador nunca recebe exceção):
 * - só a PÁGINA 1 é renderizada, num canvas, e sai como `Blob` (`toBlob`);
 * - no máximo 2 renderizações ao mesmo tempo (fila FIFO), porque a aba monta um tile por
 *   arquivo e a rolagem pede várias de uma vez;
 * - cache LRU de 60 miniaturas por chave ESTÁVEL (o token da URL assinada não entra na
 *   chave: ele muda a cada renovação e nunca acertaria o cache);
 * - 25 MB de teto, 15 s de prazo (que aborta de verdade o download e a renderização em voo) e
 *   cancelamento por `AbortSignal`;
 * - PDF protegido por senha, corrompido, lento demais, grande demais, sem CORS ou com falha
 *   de rede devolve `null` — quem chama cai no ícone do arquivo.
 */

import { log } from '@/lib/logger';

/** Teto do download: acima disso não vale a pena baixar o arquivo só para a miniatura. */
export const PDF_THUMBNAIL_MAX_BYTES = 25 * 1024 * 1024;
/** Prazo de UMA miniatura (download + parse + render). Estourou: `null`. */
export const PDF_THUMBNAIL_TIMEOUT_MS = 15_000;
/** Quantas miniaturas podem ser renderizadas ao mesmo tempo. */
export const PDF_THUMBNAIL_MAX_CONCORRENTES = 2;
/** Itens guardados no cache LRU (memória do navegador: cada item é um Blob pequeno). */
export const PDF_THUMBNAIL_CACHE_MAX = 60;
/** Largura padrão do canvas, em px de CSS. */
export const PDF_THUMBNAIL_LARGURA_PADRAO = 320;

export interface PdfThumbnailOpcoes {
  /** Largura do canvas, em px. Não altera a proporção da página. */
  largura?: number;
  /** Cancela fila, download, parse e render. */
  sinal?: AbortSignal;
  /**
   * Chave ESTÁVEL do objeto (ex.: o id durável da mídia). Sem ela a chave sai da própria URL
   * sem a query — a rota e o caminho do objeto não mudam quando o token é reemitido.
   */
  chave?: string;
}

/**
 * Tipos do pdfjs por consulta de tipo (`import('pdfjs-dist')`), nunca por `import` estático:
 * o contrato M03 (`tests/contracts/pdfjs-sob-demanda.contract.test.ts`) proíbe o import estático
 * e é ele que garante que a biblioteca não entra no bundle inicial.
 */
type TarefaCargaPdf = import('pdfjs-dist').PDFDocumentLoadingTask;
type DocumentoPdf = import('pdfjs-dist').PDFDocumentProxy;
type PaginaPdf = import('pdfjs-dist').PDFPageProxy;

/* ------------------------------------------------------------------ *
 * pdfjs-dist sob demanda
 * ------------------------------------------------------------------ */

async function importarPdfjs() {
  const pdfjs = await import('pdfjs-dist');
  const { default: workerSrc } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  return pdfjs;
}

let carregamentoPdfjs: ReturnType<typeof importarPdfjs> | null = null;

/** Carrega (uma vez) o módulo e o worker. Falha não fica presa: a próxima chamada tenta de novo. */
function carregarPdfjs() {
  if (!carregamentoPdfjs) {
    carregamentoPdfjs = importarPdfjs().catch((causa) => {
      carregamentoPdfjs = null;
      throw causa;
    });
  }
  return carregamentoPdfjs;
}

/* ------------------------------------------------------------------ *
 * Fila (no máximo PDF_THUMBNAIL_MAX_CONCORRENTES ao mesmo tempo)
 * ------------------------------------------------------------------ */

let emAndamento = 0;
const espera: Array<() => void> = [];

/**
 * Pega uma vaga na fila (no máximo 2). `true` = vaga pega (e `liberarVaga` é obrigatório);
 * `false` = o sinal abortou enquanto esperava, então NADA foi reservado e não há o que liberar.
 * Quem espera ouve o `abort` e sai da fila na hora: sem isso a chamada cancelada ficaria presa
 * em `espera` até outra terminar, segurando uma vaga que ninguém usa.
 */
function aguardarVaga(sinal?: AbortSignal): Promise<boolean> {
  if (emAndamento < PDF_THUMBNAIL_MAX_CONCORRENTES) {
    emAndamento += 1;
    return Promise.resolve(true);
  }
  if (sinal?.aborted) return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    const aoAbortar = () => {
      const posicao = espera.indexOf(entrar);
      if (posicao >= 0) espera.splice(posicao, 1);
      resolve(false);
    };
    const entrar = () => {
      sinal?.removeEventListener('abort', aoAbortar);
      emAndamento += 1;
      resolve(true);
    };
    sinal?.addEventListener('abort', aoAbortar, { once: true });
    espera.push(entrar);
  });
}

function liberarVaga(): void {
  emAndamento -= 1;
  const proximo = espera.shift();
  if (proximo) proximo();
}

/* ------------------------------------------------------------------ *
 * Cache LRU
 * ------------------------------------------------------------------ */

const cache = new Map<string, Blob>();

function chaveDaMiniatura(url: string, largura: number, chave?: string): string {
  return `${chave || chaveEstavelDaUrl(url)}::${largura}`;
}

/** Origem + caminho, sem query nem hash: o token da assinatura muda, o objeto não. */
function chaveEstavelDaUrl(url: string): string {
  try {
    const alvo = new URL(url);
    return `${alvo.origin}${alvo.pathname}`;
  } catch {
    return url;
  }
}

function lerDoCache(chave: string): Blob | null {
  const achado = cache.get(chave);
  if (!achado) return null;
  // Recência: apaga e reinsere para ir ao fim da ordem de inserção (o começo é o mais antigo).
  cache.delete(chave);
  cache.set(chave, achado);
  return achado;
}

function gravarNoCache(chave: string, blob: Blob): void {
  cache.delete(chave);
  cache.set(chave, blob);
  while (cache.size > PDF_THUMBNAIL_CACHE_MAX) {
    const maisAntiga = cache.keys().next();
    if (maisAntiga.done) break;
    cache.delete(maisAntiga.value);
  }
}

/** Limpa o cache (troca de contato/aba, logout, teste). */
export function limparCacheMiniaturasPdf(): void {
  cache.clear();
}

/** Quantas miniaturas estão no cache agora. */
export function contarMiniaturasPdfEmCache(): number {
  return cache.size;
}

/* ------------------------------------------------------------------ *
 * Falhas: log sem dado sensível e sem exceção para o chamador
 * ------------------------------------------------------------------ */

/** URL sem token/query: nunca registrar a URL assinada inteira. */
function origemSegura(url: string): string {
  try {
    const alvo = new URL(url);
    return `${alvo.origin}${alvo.pathname}`;
  } catch {
    return '(url-invalida)';
  }
}

function motivoDaFalha(causa: unknown): string {
  const nome = causa instanceof Error ? causa.name : '';
  const mensagem = causa instanceof Error ? causa.message : String(causa);
  if (/abort|cancel/i.test(nome) || /aborted|destroyed/i.test(mensagem)) return 'cancelado';
  if (/password/i.test(nome)) return 'protegido-por-senha';
  if (/invalidpdf|corrupt/i.test(nome)) return 'arquivo-invalido';
  return 'falha';
}

function registrarFalha(causa: unknown, url: string, motivo?: string): void {
  const razao = motivo ?? motivoDaFalha(causa);
  if (razao === 'cancelado') return;
  log.warn('Miniatura de PDF indisponível', {
    dominio: url ? origemSegura(url) : null,
    motivo: razao,
    nome: causa instanceof Error ? causa.name : typeof causa,
  });
}

/* ------------------------------------------------------------------ *
 * Vigia: prazo de 15 s + AbortSignal
 * ------------------------------------------------------------------ */

interface Vigia {
  /** Resolve (`null`) quando o prazo estoura ou o sinal aborta. */
  promessa: Promise<null>;
  limpar: () => void;
}

function criarVigia(sinal: AbortSignal | undefined, aoInterromper: () => void): Vigia {
  let resolver: (valor: null) => void = () => undefined;
  let encerrado = false;
  const promessa = new Promise<null>((resolve) => {
    resolver = resolve;
  });
  const interromper = () => {
    if (encerrado) return;
    encerrado = true;
    aoInterromper();
    resolver(null);
  };
  const timer = setTimeout(interromper, PDF_THUMBNAIL_TIMEOUT_MS);
  const aoAbortar = () => interromper();
  if (sinal) {
    if (sinal.aborted) interromper();
    else sinal.addEventListener('abort', aoAbortar);
  }
  return {
    promessa,
    limpar: () => {
      encerrado = true;
      clearTimeout(timer);
      sinal?.removeEventListener('abort', aoAbortar);
    },
  };
}

/* ------------------------------------------------------------------ *
 * Render
 * ------------------------------------------------------------------ */

function normalizarLargura(largura?: number): number {
  if (typeof largura !== 'number' || !Number.isFinite(largura) || largura <= 0) {
    return PDF_THUMBNAIL_LARGURA_PADRAO;
  }
  return Math.round(largura);
}

/**
 * Baixa o PDF com teto de 25 MB. O arquivo inteiro é baixado (e não por faixas do pdfjs)
 * porque o teto é conhecido e não faz sentido abrir dezenas de conexões para uma miniatura.
 */
async function baixarPdf(url: string, sinal: AbortSignal | undefined): Promise<Uint8Array | null> {
  try {
    const resposta = await fetch(url, { signal: sinal, credentials: 'omit' });
    if (!resposta.ok) {
      registrarFalha(new Error(`HTTP ${resposta.status}`), url, 'resposta-nao-ok');
      return null;
    }
    const declarado = Number(resposta.headers.get('content-length'));
    if (Number.isFinite(declarado) && declarado > PDF_THUMBNAIL_MAX_BYTES) {
      registrarFalha(new Error('Arquivo acima do teto'), url, 'maior-que-25mb');
      return null;
    }
    const buffer = await resposta.arrayBuffer();
    if (buffer.byteLength > PDF_THUMBNAIL_MAX_BYTES) {
      registrarFalha(new Error('Arquivo acima do teto'), url, 'maior-que-25mb');
      return null;
    }
    return new Uint8Array(buffer);
  } catch (causa) {
    registrarFalha(causa, url);
    return null;
  }
}

function canvasParaBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  // `toBlob` (e não `toDataURL`, que devolveria uma string base64 ~33% maior): qualquer
  // trava do canvas vira `null`, nunca exceção para o tile.
  return new Promise((resolve) => {
    if (typeof canvas.toBlob !== 'function') {
      resolve(null);
      return;
    }
    try {
      canvas.toBlob((blob) => resolve(blob ?? null), 'image/jpeg', 0.82);
    } catch (causa) {
      registrarFalha(causa, '');
      resolve(null);
    }
  });
}

/** Monta o canvas da página 1 na largura pedida e devolve o Blob (ou `null`). */
async function renderizarPagina1(
  documento: DocumentoPdf,
  largura: number,
  registrarDescarte: (descartar: () => void) => void,
): Promise<Blob | null> {
  const pagina = await documento.getPage(1);
  const base = pagina.getViewport({ scale: 1 });
  if (!base || !Number.isFinite(base.width) || base.width <= 0) return null;
  const viewport = pagina.getViewport({ scale: largura / base.width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const tarefa = pagina.render({ canvas, viewport });
  registrarDescarte(() => tarefa.cancel());
  await tarefa.promise;
  return canvasParaBlob(canvas);
}

async function processar(url: string, largura: number, sinal: AbortSignal | undefined): Promise<Blob | null> {
  // `descarte` é preenchido conforme o trabalho avança; o vigia (prazo/abort) o chama para
  // parar de verdade o que estiver em voo, em vez de só abandonar a resposta.
  const descarte: { atual: (() => void) | null } = { atual: null };
  // Sinal INTERNO: une o pedido do chamador e o prazo de 15 s. É ele que vai ao `fetch` e às
  // checagens de cancelamento — sem isso, o estouro do prazo só abandonava a resposta e o
  // download seguia baixando, o pdfjs carregava e o `getDocument`/render rodavam fora da fila
  // (a fila de 2 deixava de valer e a CPU era gasta à toa).
  const interno = new AbortController();
  const vigia = criarVigia(sinal, () => {
    interno.abort();
    descarte.atual?.();
  });

  const trabalho = (async (): Promise<Blob | null> => {
    try {
      const bytes = await baixarPdf(url, interno.signal);
      if (!bytes) return null;
      if (interno.signal.aborted) return null;

      const pdfjs = await carregarPdfjs();
      if (interno.signal.aborted) return null;

      const carga: TarefaCargaPdf = pdfjs.getDocument({ data: bytes, verbosity: 0 });
      // Registrado ANTES de esperar: se o prazo/abort chegar enquanto o PDF ainda carrega, o
      // `destroy` derruba o worker e a leitura em voo (sem isso ela ficaria pendurada).
      descarte.atual = () => {
        void carga.destroy().catch(() => undefined);
      };
      try {
        const documento = await carga.promise;
        if (interno.signal.aborted) return null;

        // Só a página 1: um PDF de 500 páginas custa o mesmo que um de uma.
        return await renderizarPagina1(documento, largura, (descartar) => {
          descarte.atual = () => {
            descartar();
            void carga.destroy().catch(() => undefined);
          };
        });
      } finally {
        descarte.atual = null;
        void carga.destroy().catch(() => undefined);
      }
    } catch (causa) {
      // Senha, arquivo corrompido, worker derrubado, abort: tudo termina em `null`.
      registrarFalha(causa, url);
      return null;
    }
  })();

  try {
    return await Promise.race([trabalho, vigia.promessa]);
  } finally {
    vigia.limpar();
  }
}

/**
 * Miniatura da 1ª página de um PDF. Devolve `null` quando não há prévia possível — o chamador
 * mostra o ícone do arquivo. Nunca lança.
 */
export async function renderPdfThumbnail(
  url: string,
  opcoes: PdfThumbnailOpcoes = {},
): Promise<Blob | null> {
  const sinal = opcoes.sinal;
  if (!url || sinal?.aborted) return null;

  const largura = normalizarLargura(opcoes.largura);
  const chave = chaveDaMiniatura(url, largura, opcoes.chave);

  const doCache = lerDoCache(chave);
  if (doCache) return doCache;

  // `false` = o sinal abortou enquanto esperava a fila: nenhuma vaga foi reservada.
  const obteveVaga = await aguardarVaga(sinal);
  if (!obteveVaga) return null;
  try {
    if (sinal?.aborted) return null;
    // A espera na fila pode ter sido longa: se outra chamada idêntica já renderizou, usa o cache.
    const aposFila = lerDoCache(chave);
    if (aposFila) return aposFila;

    const blob = await processar(url, largura, sinal);
    if (blob) gravarNoCache(chave, blob);
    return blob;
  } finally {
    liberarVaga();
  }
}

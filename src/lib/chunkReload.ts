import { getLogger } from '@/lib/logger';

/**
 * Recuperacao de "deploy novo": quando a producao publica um build, o HTML que a
 * aba ja carregou aponta para hashes de chunk que nao existem mais. O navegador
 * falha o import dinamico e a tela fica presa ate alguem apertar F5.
 *
 * Fonte UNICA desta decisao (segue a V3, src/lib/lazyWithRetry.ts ~l.71-197): o
 * reconhecimento das 5 mensagens de chunk, o orcamento de recargas por sessao e
 * o cooldown. ErrorBoundary, lazyWithRetry e a tela de nova versao importam
 * daqui — nenhum deles redetecta nem duplica o orcamento.
 */
const log = getLogger('ChunkReload');

/** Instante da ultima recarga automatica (epoch ms, sessionStorage). */
export const CHUNK_RELOAD_AT_KEY = '__zapp_chunk_reload_at';
/** Quantas recargas automaticas a sessao ja gastou. */
export const CHUNK_RELOAD_COUNT_KEY = '__zapp_chunk_reload_count';
/**
 * Chave da guarda antiga do ErrorBoundary (v1). Limpa junto com as novas para
 * nao deixar estado orfao de sessoes gravadas por um build anterior.
 */
export const LEGACY_CHUNK_RELOAD_KEY = 'zapp_chunk_reload_v1';

/** Tempo minimo entre duas recargas automaticas. */
export const CHUNK_RELOAD_COOLDOWN_MS = 30_000;

/**
 * Teto de recargas automaticas por aba. Dois e deliberado: a primeira cobre o
 * caso comum ("um deploy chegou enquanto a aba estava aberta"); a segunda, um
 * deploy que caiu durante a primeira recarga. Depois disso a aba esta perdendo
 * uma corrida que nao pode vencer sozinha — paramos e entregamos ao usuario.
 */
export const MAX_CHUNK_RELOADS = 2;

/**
 * Tolerancia de relogio torto ao ler o instante da recarga. Um valor so e aceito
 * quando e finito, nao negativo e no maximo 60 s no futuro. Sem o teto superior,
 * um valor como 1e308 (extensao do browser, DevTools) passaria por
 * Number.isFinite e travaria a guarda para sempre (lockout permanente).
 */
export const CLOCK_SKEW_TOLERANCE_MS = 60_000;

/**
 * Memoria em processo para o caso em que o sessionStorage falhou nesta aba.
 * Sem storage nao ha contador confiavel; portanto a direcao segura e bloquear a
 * recarga automatica e mostrar a tela manual ate o usuario apertar o botao.
 */
let recargaAutomaticaBloqueadaPorStorage = false;

/**
 * Mensagens que o navegador usa quando o chunk nao veio (deploy novo ou rede).
 * Comparadas em minusculas: as 5 da V3 mais 'loading css chunk', que a V2 ja
 * reconhecia — removê-la seria regressao.
 */
const MENSAGENS_DE_CHUNK = [
  'failed to fetch dynamically imported module',
  'loading chunk',
  'loading css chunk',
  'importing a module script failed',
  'error loading dynamically imported module',
  'unable to preload css for',
];

/**
 * Reconhece falha de chunk sem depender do tipo do erro (um import dinamico pode
 * rejeitar com Error, TypeError ou um objeto solto) e sem diferenciar maiusculas.
 */
export function isChunkLoadError(err: unknown): boolean {
  if (err == null) return false;
  let nome = '';
  let mensagem = '';
  try {
    if (err instanceof Error) {
      nome = err.name;
      mensagem = err.message;
    } else if (typeof (err as { message?: unknown }).message === 'string') {
      mensagem = (err as { message: string }).message;
    } else {
      mensagem = String(err);
    }
  } catch {
    return false;
  }
  if (nome === 'ChunkLoadError') return true;
  const texto = mensagem.toLowerCase();
  return MENSAGENS_DE_CHUNK.some((m) => texto.includes(m));
}

/**
 * Le o contador da sessao, preso a [0, MAX_CHUNK_RELOADS]. Prender (em vez de
 * zerar) e a direcao segura: um valor corrompido degrada para "esgotado" e
 * mostra a tela acionavel ao usuario; zerar reabriria o laco infinito.
 */
function lerContador(): number {
  try {
    const valor = Number(sessionStorage.getItem(CHUNK_RELOAD_COUNT_KEY) ?? '0');
    if (!Number.isFinite(valor) || valor < 0) return 0;
    return Math.min(valor, MAX_CHUNK_RELOADS);
  } catch {
    recargaAutomaticaBloqueadaPorStorage = true;
    return MAX_CHUNK_RELOADS;
  }
}

/** true quando as recargas automaticas da sessao acabaram e cabe ao usuario agir. */
export function hasExhaustedChunkReloads(): boolean {
  return recargaAutomaticaBloqueadaPorStorage || lerContador() >= MAX_CHUNK_RELOADS;
}

/**
 * Zera o orcamento e o instante da ultima recarga. Chamado pelo "Atualizar
 * agora"/"Recarregar" visivel ao usuario para que a proxima sessao comece limpa.
 */
export function resetChunkReloadGuard(): void {
  recargaAutomaticaBloqueadaPorStorage = false;
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_COUNT_KEY);
    sessionStorage.removeItem(CHUNK_RELOAD_AT_KEY);
    sessionStorage.removeItem(LEGACY_CHUNK_RELOAD_KEY);
  } catch {
    /* sessionStorage indisponivel: nao ha guarda para limpar */
  }
}

/**
 * Recarrega a pagina quando o cooldown ja passou E o orcamento da sessao nao
 * acabou.
 *
 * @returns true quando disparou a recarga; false quando o chamador deve mostrar a
 *          tela de nova versao. Quem chama PRECISA tratar o false — devolver em
 *          silencio e o que produzia o laco invisivel antes desta guarda.
 */
export function triggerChunkReload(): boolean {
  try {
    const contador = lerContador();
    if (contador >= MAX_CHUNK_RELOADS) return false;

    const bruto = Number(sessionStorage.getItem(CHUNK_RELOAD_AT_KEY) ?? '0');
    const agora = Date.now();
    const ultima =
      Number.isFinite(bruto) && bruto >= 0 && bruto <= agora + CLOCK_SKEW_TOLERANCE_MS
        ? bruto
        : 0;

    if (agora - ultima <= CHUNK_RELOAD_COOLDOWN_MS) return false;

    sessionStorage.setItem(CHUNK_RELOAD_AT_KEY, String(agora));
    sessionStorage.setItem(CHUNK_RELOAD_COUNT_KEY, String(contador + 1));
    window.location.reload();
    return true;
  } catch (erro) {
    // sessionStorage indisponivel (navegacao privada, storage bloqueado). Sem
    // persistir o contador o orcamento nao existe aqui. Recarregar mesmo assim
    // reabre o laco infinito que esta guarda evita; a saida segura e mostrar a
    // tela acionavel para o usuario atualizar manualmente.
    recargaAutomaticaBloqueadaPorStorage = true;
    log.warn('sessionStorage indisponivel na recuperacao de chunk -- mostrando tela manual', erro);
    return false;
  }
}

/**
 * Eleição de aba líder da sessão de chamadas.
 *
 * Só uma aba "possui" a sessão de chamadas por vez. A eleição é cooperativa:
 * cada aba reivindica, espera um jitter curto e relê o lock persistido para
 * decidir — quem relê primeiro assume, quem encontra o lock vivo vira seguidora.
 * A aba líder renova o lock periodicamente (heartbeat); se ela morrer sem avisar,
 * o TTL expira e outra aba assume na próxima reivindicação.
 *
 * Módulo puro: sem React e sem DOM obrigatório. Papel em memória + lock em
 * `localStorage`, coordenado por `BroadcastChannel`. Sem canal, ou com o canal
 * lançando, ou com o `localStorage` bloqueado, a aba assume sozinha (modo aba
 * única): a coordenação degrada, o app nunca trava por falta de canal.
 *
 * Espelha a estrutura de `src/lib/mediaVolumeStore.ts`: singleton de módulo,
 * `getSnapshot`/`subscribe` para `useSyncExternalStore`, e tolerância a
 * `localStorage`/canal indisponíveis em try/catch.
 */

import { BASE36_MAIUSCULO, secureRandomChars, secureRandomFloat } from '../secureRandom';

export const CALL_SESSION_CHANNEL_NAME = 'zapp-call-session';

export const TAB_LEADER_STORAGE_KEY = 'zapp.call.tab-leader';

/** Janela de validade do lock: cobre a queda da aba líder sem aviso prévio. */
export const LEADER_TTL_MS = 10_000;

/** Cadência com que a líder renova o lock enquanto está viva. */
export const LEADER_HEARTBEAT_MS = 3_000;

/** Jitter máximo de boot: desempata abas que reivindicam no mesmo instante. */
export const LEADER_CLAIM_JITTER_MS = 120;

export type TabRole = 'leader' | 'follower';

export interface TabLeaderSnapshot {
  role: TabRole;
  leaderId: string | null;
  expiresAt: number | null;
  tabId: string;
}

/** Valor gravado em `localStorage[TAB_LEADER_STORAGE_KEY]`. */
interface LeaderLock {
  tabId: string;
  expiresAt: number;
}

/** Contrato v1 das mensagens trocadas no canal. */
type LeaderMessage =
  | { version: 1; type: 'CLAIM'; tabId: string; at: number }
  | { version: 1; type: 'HEARTBEAT'; tabId: string; at: number; expiresAt: number }
  | { version: 1; type: 'RELEASE'; tabId: string };

type Listener = () => void;

const listeners = new Set<Listener>();

let broadcastChannel: BroadcastChannel | null = null;
let broadcastChannelResolved = false;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let claimTimer: ReturnType<typeof setTimeout> | null = null;

/** Contador do ultimo recurso de `generateTabId()` (sem `crypto` nenhum). */
let contadorSemCrypto = 0;

const tabId = generateTabId();

/** Nasce seguidora: quem decide o papel é `claimLeadership()`, já com jitter. */
let current: TabLeaderSnapshot = { role: 'follower', leaderId: null, expiresAt: null, tabId };

/**
 * Identidade da aba. Escada de recurso, do melhor para o pior:
 * `crypto.randomUUID` -> `crypto.getRandomValues` -> relogio + contador.
 *
 * O id nasce no topo do modulo (`const tabId = generateTabId()`), entao NADA
 * aqui pode lancar: um throw derruba o modulo e a eleicao de aba inteira. Foi
 * por isso que este arquivo nao usa `secureRandomFloat()` direto — ele lanca
 * quando `crypto.getRandomValues` nao existe, que e exatamente o cenario deste
 * fallback. Os outros geradores do arquivo passaram a usar o helper.
 *
 * `crypto.randomUUID` exige contexto seguro (HTTPS); `getRandomValues` nao, e
 * existe em qualquer navegador desde ~2013. Ou seja: o ramo 2 e o que roda de
 * verdade em navegador sem `randomUUID`, e ele e criptografico.
 *
 * O valor e persistido (lock em localStorage) e trocado no BroadcastChannel,
 * mas so por IGUALDADE de string: nao e comparado por regex, nao e enviado ao
 * banco e o formato nao e lido por ninguem.
 */
function generateTabId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      return `tab-${secureRandomChars(10, BASE36_MAIUSCULO).toLowerCase()}`;
    }
  } catch {
    // `crypto` bloqueado pelo navegador: cai no ultimo recurso abaixo.
  }
  // Ultimo recurso, sem fonte aleatoria nenhuma. Duas abas abertas no mesmo
  // milissegundo colidiriam — cenario que nao existe em navegador suportado e
  // que e preferivel a derrubar o modulo por causa do id.
  contadorSemCrypto += 1;
  return `tab-${Date.now().toString(36)}-${contadorSemCrypto.toString(36)}`;
}

/** Leitura tolerante do lock: `localStorage` bloqueado/inexistente ou JSON inválido → sem lock. */
function readLock(): LeaderLock | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(TAB_LEADER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LeaderLock>;
    if (typeof parsed?.tabId === 'string' && typeof parsed?.expiresAt === 'number') {
      return { tabId: parsed.tabId, expiresAt: parsed.expiresAt };
    }
    return null;
  } catch {
    return null;
  }
}

/** Escrita tolerante: quota estourada ou cookies bloqueados não quebram o app. */
function writeLock(lock: LeaderLock): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(TAB_LEADER_STORAGE_KEY, JSON.stringify(lock));
  } catch {
    // O lock continua valendo nesta aba enquanto o processo viver.
  }
}

function clearLock(): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.removeItem(TAB_LEADER_STORAGE_KEY);
  } catch {
    // Sem storage não há lock para limpar.
  }
}

function resolveBroadcastChannel(): BroadcastChannel | null {
  if (broadcastChannelResolved) return broadcastChannel;
  broadcastChannelResolved = true;
  try {
    if (typeof BroadcastChannel === 'undefined') {
      broadcastChannel = null;
      return null;
    }
    const channel = new BroadcastChannel(CALL_SESSION_CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent) => handleMessage(event.data);
    broadcastChannel = channel;
  } catch {
    // Canal bloqueado ou sem suporte: cai no modo aba única.
    broadcastChannel = null;
  }
  return broadcastChannel;
}

function publish(message: LeaderMessage): void {
  const channel = resolveBroadcastChannel();
  if (!channel) return;
  try {
    channel.postMessage(message);
  } catch {
    // Canal fechado (unload): não há quem receba.
  }
}

function emit(): void {
  listeners.forEach((listener) => listener());
}

/**
 * Troca o snapshot só quando algo muda: referência nova é o que faz o
 * `useSyncExternalStore` re-renderizar, e identidade estável quando nada muda
 * evita render em loop.
 */
function setState(next: { role: TabRole; leaderId: string | null; expiresAt: number | null }): void {
  if (
    current.role === next.role &&
    current.leaderId === next.leaderId &&
    current.expiresAt === next.expiresAt
  ) {
    return;
  }
  current = { role: next.role, leaderId: next.leaderId, expiresAt: next.expiresAt, tabId };
  emit();
}

/**
 * Liga o relógio do store. Vive enquanto houver listener (ver `subscribe`):
 * sem UI montada não há quem reaja à eleição, então não há por que rodar.
 */
function startTick(): void {
  if (heartbeatTimer !== null) return;
  heartbeatTimer = setInterval(tick, LEADER_HEARTBEAT_MS);
}

/** Desliga o relógio — chamado quando o último listener sai. */
function stopTick(): void {
  if (heartbeatTimer === null) return;
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

/**
 * Um passo do relógio, decidido pelo PAPEL atual:
 * - líder: renova o lock e avisa as seguidoras (heartbeat);
 * - seguidora: consulta o TTL — se o lock sumiu/expirou, a líder morreu sem
 *   avisar e esta aba tenta assumir. O TTL só salva alguém se a seguidora o ler.
 */
function tick(): void {
  if (current.role === 'leader') {
    renewLeadership();
    return;
  }
  considerPromotion();
}

/** Renovação periódica: estende o lock e avisa as seguidoras. */
function renewLeadership(): void {
  if (current.role !== 'leader') return;
  const expiresAt = Date.now() + LEADER_TTL_MS;
  writeLock({ tabId, expiresAt });
  setState({ role: 'leader', leaderId: tabId, expiresAt });
  publish({ version: 1, type: 'HEARTBEAT', tabId, at: Date.now(), expiresAt });
}

/**
 * Seguidora no tick: só assume quando não há líder renovando o lock (ausente
 * ou expirado, ou o dono do lock já não é esta aba). Passa pelo
 * `claimLeadership()` — jitter + releitura — para que duas seguidoras
 * despertadas no mesmo instante não virem duas líderes.
 */
function considerPromotion(): void {
  const lock = readLock();
  if (lock && lock.expiresAt > Date.now() && lock.tabId !== tabId) {
    // Líder viva: mantém o `leaderId` sincronizado com o dono real do lock.
    setState({ role: 'follower', leaderId: lock.tabId, expiresAt: lock.expiresAt });
    return;
  }
  claimLeadership();
}

function becomeLeader(announce: boolean): void {
  const at = Date.now();
  const expiresAt = at + LEADER_TTL_MS;
  writeLock({ tabId, expiresAt });
  setState({ role: 'leader', leaderId: tabId, expiresAt });
  if (announce) publish({ version: 1, type: 'CLAIM', tabId, at });
}

function becomeFollower(leaderId: string | null, expiresAt: number | null): void {
  // O relógio NÃO para aqui: uma seguidora precisa dele para vigiar o TTL da
  // líder. Quem liga/desliga o relógio é o ciclo de vida do `subscribe`.
  setState({ role: 'follower', leaderId, expiresAt });
}

/** Decisão tomada só depois do jitter: relê o lock e assume se ele está livre/expirado. */
function performClaim(): void {
  // Sem canal não há coordenação possível: esta é a única aba e ela assume,
  // sem esperar por um canal que não existe.
  if (!resolveBroadcastChannel()) {
    becomeLeader(false);
    return;
  }
  const lock = readLock();
  if (lock && lock.tabId !== tabId && lock.expiresAt > Date.now()) {
    becomeFollower(lock.tabId, lock.expiresAt);
    return;
  }
  becomeLeader(true);
}

function handleMessage(payload: unknown): void {
  if (!isLeaderMessage(payload)) return;
  // O emissor nunca aprende o próprio papel pela própria mensagem.
  if (payload.tabId === tabId) return;

  if (payload.type === 'RELEASE') {
    if (current.role === 'leader') return;
    // A líder saiu: a seguidora reivindica (com jitter e releitura do lock,
    // para que duas seguidoras não se tornem líderes ao mesmo tempo).
    claimLeadership();
    return;
  }

  // Líder não cede a mensagens de terceiros: ela é quem segura o lock.
  if (current.role === 'leader') return;

  if (payload.type === 'CLAIM') {
    becomeFollower(payload.tabId, Date.now() + LEADER_TTL_MS);
    return;
  }
  becomeFollower(payload.tabId, payload.expiresAt);
}

function isLeaderMessage(payload: unknown): payload is LeaderMessage {
  if (!payload || typeof payload !== 'object') return false;
  const { version, type, tabId: senderId } = payload as {
    version?: unknown;
    type?: unknown;
    tabId?: unknown;
  };
  if (version !== 1 || typeof senderId !== 'string') return false;
  if (type === 'CLAIM' || type === 'RELEASE') return true;
  if (type === 'HEARTBEAT') {
    return typeof (payload as { expiresAt?: unknown }).expiresAt === 'number';
  }
  return false;
}

export function getSnapshot(): TabLeaderSnapshot {
  return current;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  resolveBroadcastChannel();
  // O relógio sobe com o primeiro interessado e só desce quando não resta
  // nenhum: é ele que renova a liderança E vigia o TTL da líder na seguidora.
  startTick();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopTick();
  };
}

/**
 * Reivindica a liderança: espera um jitter de 0–120 ms e só então relê o lock.
 * O jitter é o que desempata abas que sobem no mesmo instante.
 */
export function claimLeadership(): void {
  if (current.role === 'leader' || claimTimer !== null) return;
  const jitter = Math.floor(secureRandomFloat() * (LEADER_CLAIM_JITTER_MS + 1));
  claimTimer = setTimeout(() => {
    claimTimer = null;
    performClaim();
  }, jitter);
}

/** Devolve a liderança: libera o lock e avisa as seguidoras, que reivindicam. */
export function releaseLeadership(): void {
  if (current.role !== 'leader') return;
  if (claimTimer !== null) {
    clearTimeout(claimTimer);
    claimTimer = null;
  }
  // O relógio fica de pé: quem libera vira seguidora e continua vigiando o TTL
  // (o ciclo de vida do relógio é o `subscribe`, não o papel).
  clearLock();
  setState({ role: 'follower', leaderId: null, expiresAt: null });
  publish({ version: 1, type: 'RELEASE', tabId });
}

export function isLeader(): boolean {
  return current.role === 'leader';
}

import { useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { log } from '@/lib/logger';

/**
 * R2-PREF-001 — preferências de interface sincronizadas com o servidor.
 *
 * Antes, cada preferência de UI (skin, densidade, atalhos, favoritos de
 * resposta rápida, assinatura) vivia SÓ no `localStorage`. Trocar de navegador
 * — ou limpar os dados do site — perdia tudo, e a tabela
 * `public.user_ui_preferences` (criada na migration
 * `20261013143000_user_ui_preferences.sql`) não tinha ninguém do lado do front.
 *
 * Este é o ÚNICO ponto que fala com a tabela. Ele guarda o objeto de
 * preferências sob a chave `prefs` (jsonb), com duas fontes:
 *
 *  - `localStorage['ui-preferences-cache']` — cache para o boot offline, lido
 *    antes de qualquer rede;
 *  - a linha do usuário em `public.user_ui_preferences` — o SERVIDOR VENCE
 *    quando existe, exceto as chaves que o usuário mexeu enquanto a leitura
 *    estava em voo (ver `mesclarComPendentes`).
 *
 * Sem sessão (deslogado, ou `getSession` falhou) o hook degrada em silêncio
 * para o modo local: nada é enviado, nada quebra e o cache continua servindo.
 *
 * Gravação: as escritas são agrupadas por um debounce e enviadas num único
 * `upsert` sobre `user_id` (a chave primária), nunca um request por tecla.
 */

/** Chaves que o front sincroniza. Uma por preferência de UI. */
export type UiPreferenceKey =
  | 'theme'
  | 'density'
  | 'shortcuts'
  | 'quickReplyFavorites'
  | 'signatureEnabled';

/** O objeto `prefs` como ele viaja: chave de preferência -> valor serializável. */
export type UiPreferences = Record<string, unknown>;

export interface UiPreferencesSnapshot {
  /** Servidor + pendências locais sobrescritas por cima (fonte do front). */
  prefs: UiPreferences;
  /**
   * Só o que o servidor devolveu na última leitura bem-sucedida (`null` antes
   * disso). É daqui — e nunca de `prefs`, que carrega escrita local pendente —
   * que um hook de preferência adota o valor "da conta".
   */
  serverPrefs: UiPreferences | null;
  /** `true` depois da primeira leitura (com ou sem sessão). Antes disso, cache. */
  ready: boolean;
  /** `true` enquanto um `upsert` está em voo. */
  syncing: boolean;
  /** Última falha (leitura ou gravação). `null` quando está tudo certo. */
  error: string | null;
  setPreference: (key: UiPreferenceKey, value: unknown) => void;
  clearPreference: (key: UiPreferenceKey) => void;
  syncNow: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const UI_PREFERENCES_CACHE_KEY = 'ui-preferences-cache';
export const UI_PREFERENCES_TABLE = 'user_ui_preferences';
/**
 * Chave RESERVADA dentro de `prefs`: carimbo de tempo (ms desde a época) por
 * chave de preferência. É o que implementa o "conflito = vence o mais recente"
 * do cartão: cada `setPreference`/`clearPreference` carimba a chave com
 * `Date.now()`, o carimbo viaja no cache e no `upsert` junto com o valor, e a
 * leitura compara o carimbo local com o do servidor chave a chave. Nenhum hook
 * consumidor lê esta chave (cada um lê só a sua).
 */
export const UI_PREFERENCES_TIMESTAMPS_KEY = '__atualizadoEm';

/** Carimbos por chave (`UiPreferenceKey` -> ms). Tombstone: chave apagada localmente mantém o carimbo. */
/** Agrupa rajadas de escrita (arrastar o slider de raio dispara vários `onChange`). */
export const UI_PREFERENCES_DEBOUNCE_MS = 400;

/** Sentinela de remoção: a chave precisa SUMIR do objeto enviado. */
const REMOVIDO = '\u0000removido';

/** Snapshot devolvido no render do servidor: só o cache vazio, sem tocar em rede. */
const SNAPSHOT_SERVIDOR: UiPreferencesSnapshot = {
  prefs: {},
  serverPrefs: null,
  ready: false,
  syncing: false,
  error: null,
  setPreference: setUiPreference,
  clearPreference: clearUiPreference,
  syncNow: enviarPendentes,
  refresh: atualizarDoServidor,
};

type Status = 'idle' | 'loading' | 'ready' | 'offline';

let prefs: UiPreferences = lerCache();
/** Última cópia lida do servidor (`null` enquanto não houver leitura com sessão). */
let serverPrefs: UiPreferences | null = null;
let status: Status = 'idle';
let syncing = false;
let erro: string | null = null;
let sessaoUserId: string | null = null;
let carregamentoIniciado = false;
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * O que foi mexido localmente e ainda não confirmou no servidor: chave ->
 * valor serializado no momento da escrita. Comparar o valor (e não só a chave)
 * é o que evita perder uma edição feita DURANTE um `upsert` em voo.
 */
const pendentes = new Map<UiPreferenceKey, string>();

const listeners = new Set<() => void>();

function mensagemDeErro(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * O logger é opcional aqui de propósito: parte da suíte troca `@/lib/logger` por
 * um stub sem `log`, e o log NUNCA pode virar a falha da sincronização.
 */
function registrarErro(mensagem: string, e: unknown): void {
  try { log?.error?.(mensagem, e); } catch { /* logger indisponível */ }
}

function registrarSucesso(mensagem: string, dados: Record<string, unknown>): void {
  try { log?.debug?.(mensagem, dados); } catch { /* logger indisponível */ }
}

/** JSON válido que não é objeto (null, array, escalar) não vira `prefs`. */
function normalizarPrefs(valor: unknown): UiPreferences {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) return {};
  return valor as UiPreferences;
}

/**
 * Só carimbo finito vira carimbo: lixo de outra aba/versão (string, null,
 * objeto) é ignorado e a chave passa a valer 0 (o servidor vence o empate).
 */
function normalizarCarimbos(valor: unknown): Record<string, number> {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) return {};
  const limpos: Record<string, number> = {};
  for (const [chave, ts] of Object.entries(valor as Record<string, unknown>)) {
    if (typeof ts === 'number' && Number.isFinite(ts)) limpos[chave] = ts;
  }
  return limpos;
}

/** Carimbos guardados no `prefs` vigente (a chave reservada nunca é preferência). */
function carimbosLocais(): Record<string, number> {
  return normalizarCarimbos((prefs as UiPreferences)[UI_PREFERENCES_TIMESTAMPS_KEY]);
}

/** Devolve `prefs` sem a chave reservada (é o que os hooks adotam como "cópia da conta"). */
function semCarimbos(valor: UiPreferences): UiPreferences {
  const copia = { ...valor };
  delete copia[UI_PREFERENCES_TIMESTAMPS_KEY];
  return copia;
}

function lerCache(): UiPreferences {
  try {
    const raw = localStorage.getItem(UI_PREFERENCES_CACHE_KEY);
    if (!raw) return {};
    return normalizarPrefs(JSON.parse(raw));
  } catch {
    return {};
  }
}

function gravarCache(valor: UiPreferences): void {
  try {
    localStorage.setItem(UI_PREFERENCES_CACHE_KEY, JSON.stringify(valor));
  } catch { /* storage indisponível (modo restrito/quota): o servidor ainda é a fonte */ }
}

/**
 * Conflito "vence o mais recente", chave a chave.
 *
 * Compara o carimbo local (do cache, que sobrevive ao recarregar a aba — ao
 * contrário de `pendentes`, que é só memória) com o carimbo que veio na linha
 * do servidor. Chave sem carimbo dos dois lados vale 0, e no empate o SERVIDOR
 * vence (regra determinística para o cache antigo, que não tem carimbos).
 *
 * O que o local venceu — valor novo que a conta ainda não tem, edição offline
 * recarregada antes de subir, ou remoção local (tombstone) mais nova que a
 * cópia do servidor — volta para a fila (`pendentes`), então o fim do
 * carregamento agenda o envio e a conta recebe sem o usuário mexer de novo.
 */
function mesclarPorRecencia(doServidor: UiPreferences): UiPreferences {
  const tsServidor = normalizarCarimbos(doServidor[UI_PREFERENCES_TIMESTAMPS_KEY]);
  const tsLocal = carimbosLocais();
  const servidor = semCarimbos(doServidor);
  const local = semCarimbos(prefs);
  const mesclado: UiPreferences = {};
  const tsMesclado: Record<string, number> = {};
  const chaves = new Set([
    ...Object.keys(servidor),
    ...Object.keys(local),
    ...Object.keys(tsServidor),
    ...Object.keys(tsLocal),
  ]);
  chaves.forEach(chave => {
    if (chave === '__proto__') return; // nunca vira chave própria (atribuição direta)
    const noServidor = chave in servidor;
    const noLocal = chave in local;
    const tS = tsServidor[chave] ?? (noServidor ? 0 : -1);
    const tL = tsLocal[chave] ?? (noLocal ? 0 : -1);
    const localVence = noLocal && (!noServidor || tL > tS);
    const remocaoVence = !noLocal && noServidor && tL > tS;
    if (localVence) {
      mesclado[chave] = local[chave];
      tsMesclado[chave] = tL;
      definirPendencia(
        chave as UiPreferenceKey,
        JSON.stringify(local[chave]),
      );
    } else if (remocaoVence) {
      tsMesclado[chave] = tL;
      definirPendencia(chave as UiPreferenceKey, REMOVIDO);
    } else if (noServidor) {
      mesclado[chave] = servidor[chave];
      tsMesclado[chave] = tS;
    } else {
      tsMesclado[chave] = Math.max(tL, tS);
    }
  });
  mesclado[UI_PREFERENCES_TIMESTAMPS_KEY] = tsMesclado;
  return mesclado;
}

/**
 * Aplica o que veio do servidor mantendo por cima as chaves mexidas enquanto a
 * leitura estava em voo — a resposta atrasada não pode desfazer a edição do
 * usuário (e as pendências seguem na fila para subir).
 */
function mesclarComPendentes(doServidor: UiPreferences): UiPreferences {
  const mesclado: UiPreferences = { ...doServidor };
  pendentes.forEach((serializado, chave) => {
    if (serializado === REMOVIDO) delete mesclado[chave];
    else mesclado[chave] = prefs[chave];
  });
  return mesclado;
}

function buildSnapshot(): UiPreferencesSnapshot {
  return {
    prefs,
    serverPrefs,
    ready: status === 'ready' || status === 'offline',
    syncing,
    error: erro,
    setPreference: setUiPreference,
    clearPreference: clearUiPreference,
    syncNow: enviarPendentes,
    refresh: atualizarDoServidor,
  };
}

let snapshot: UiPreferencesSnapshot = buildSnapshot();

function emit(): void {
  snapshot = buildSnapshot();
  listeners.forEach(listener => listener());
}

export function subscribeUiPreferences(listener: () => void): () => void {
  garantirCarregamento();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Snapshot atual (para quem não é componente React, ex.: o store de atalhos). */
export function getUiPreferences(): UiPreferences {
  garantirCarregamento();
  return prefs;
}

/** `true` depois da primeira leitura; antes disso o valor é só o cache local. */
export function uiPreferencesReady(): boolean {
  return status === 'ready' || status === 'offline';
}

/**
 * Cópia da CONTA (`null` enquanto não houver leitura com sessão). Diferente de
 * `getUiPreferences()`, não carrega escrita local pendente — é o que um hook de
 * preferência pode adotar sem desfazer a escolha do usuário.
 */
export function getUiPreferencesDoServidor(): UiPreferences | null {
  return serverPrefs;
}

export function getUiPreferencesError(): string | null {
  return erro;
}

function garantirCarregamento(): void {
  if (carregamentoIniciado) return;
  carregamentoIniciado = true;
  // Fora do render: o `emit` do status não pode disparar durante o `getSnapshot`.
  void Promise.resolve().then(() => loadFromServer());
}

function definirPendencia(chave: UiPreferenceKey, serializado: string): void {
  pendentes.set(chave, serializado);
}

function agendarEnvio(): void {
  if (timer !== null) { clearTimeout(timer); timer = null; }
  // Sem sessão conhecida ainda (carregamento em voo) ou sem pendência: nada a enviar.
  // O fim do carregamento chama de novo quando houver fila.
  if (pendentes.size === 0 || !sessaoUserId) return;
  timer = setTimeout(() => { timer = null; void enviarPendentes(); }, UI_PREFERENCES_DEBOUNCE_MS);
}

/**
 * Cartão que reusa uma propriedade deste objeto é o mesmo que o app envia ao
 * servidor: um upsert por `user_id` com o objeto INTEIRO (não é merge parcial),
 * então chave removida daqui também some do banco.
 */
export function setUiPreference(key: UiPreferenceKey, value: unknown): void {
  if (value === undefined) { clearUiPreference(key); return; }
  prefs = {
    ...prefs,
    [key]: value,
    [UI_PREFERENCES_TIMESTAMPS_KEY]: { ...carimbosLocais(), [key]: Date.now() },
  };
  definirPendencia(key, JSON.stringify(value));
  gravarCache(prefs);
  emit();
  agendarEnvio();
}

export function clearUiPreference(key: UiPreferenceKey): void {
  if (key in prefs) {
    const proximo = { ...prefs };
    delete proximo[key];
    prefs = proximo;
  }
  prefs = {
    ...prefs,
    [UI_PREFERENCES_TIMESTAMPS_KEY]: { ...carimbosLocais(), [key]: Date.now() },
  };
  definirPendencia(key, REMOVIDO);
  gravarCache(prefs);
  emit();
  agendarEnvio();
}

async function loadFromServer(): Promise<void> {
  status = 'loading';
  emit();
  try {
    const sessao = await supabase.auth.getSession();
    const uid = sessao?.data?.session?.user?.id ?? null;
    sessaoUserId = uid;
    if (!uid) {
      // Deslogado: modo local. Não é erro — o cache já está aplicado.
      erro = null;
      status = 'offline';
      return;
    }
    const resposta = await supabase
      .from(UI_PREFERENCES_TABLE)
      .select('prefs')
      .eq('user_id', uid)
      .maybeSingle();
    if (resposta?.error) throw resposta.error;
    const doServidor = normalizarPrefs((resposta?.data as { prefs?: unknown } | null)?.prefs);
    // Só a leitura com sessão atualiza a "cópia da conta" que os hooks podem adotar
    // (sem a chave reservada de carimbos: ela é controle do motor, não preferência).
    serverPrefs = semCarimbos(doServidor);
    // Antes de aplicar as pendências em voo, resolve o conflito persistido:
    // o que o cache tem de mais novo que a conta volta para a fila e sobe.
    prefs = mesclarComPendentes(mesclarPorRecencia(doServidor));
    gravarCache(prefs);
    erro = null;
    status = 'ready';
  } catch (e) {
    // Falha de rede/RLS: segue com o cache local e conta o erro no snapshot.
    erro = mensagemDeErro(e);
    status = 'offline';
    registrarErro('useUiPreferences: falha ao ler as preferências do servidor', e);
  } finally {
    emit();
    if (pendentes.size > 0) agendarEnvio();
  }
}

/** Releitura explícita (ex.: voltou do login). Mantém as pendências locais. */
export async function atualizarDoServidor(): Promise<void> {
  await loadFromServer();
}

/** Envia agora o que está na fila, sem esperar o debounce. */
export async function enviarPendentes(): Promise<void> {
  if (timer !== null) { clearTimeout(timer); timer = null; }
  let uid = sessaoUserId;
  if (!uid || pendentes.size === 0) return;
  // Sem leitura bem-sucedida não há base da conta para mesclar: o objeto
  // INTEIRO sairia do cache e apagaria da conta chaves nunca lidas. Tenta ler
  // primeiro; se continuar sem leitura, a fila espera (nada é enviado).
  if (serverPrefs === null) {
    await loadFromServer();
    uid = sessaoUserId;
    if (!uid || serverPrefs === null || pendentes.size === 0) return;
  }

  // Cópia de segurança: só sai da fila o que foi enviado E não mudou no meio do envio.
  const enviados = new Map(pendentes);
  const corpo: UiPreferences = { ...prefs };
  syncing = true;
  emit();
  try {
    const resposta = await supabase
      .from(UI_PREFERENCES_TABLE)
      .upsert({ user_id: uid, prefs: corpo as unknown as Json }, { onConflict: 'user_id' });
    if (resposta?.error) throw resposta.error;
    enviados.forEach((serializado, chave) => {
      if (pendentes.get(chave) === serializado) pendentes.delete(chave);
    });
    erro = null;
    registrarSucesso('useUiPreferences: preferências sincronizadas', { chaves: Array.from(enviados.keys()) });
  } catch (e) {
    // A pendência FICA na fila (nada é perdido no servidor por causa de uma falha)
    // e a próxima edição — ou a volta da rede — tenta de novo. Sem laço de retry.
    erro = mensagemDeErro(e);
    registrarErro('useUiPreferences: falha ao gravar as preferências no servidor', e);
  } finally {
    syncing = false;
    emit();
  }
}

if (typeof window !== 'undefined') {
  // Voltou a rede: a fila parada (falha anterior) ganha nova tentativa.
  window.addEventListener('online', () => agendarEnvio());
  // Fechar/ocultar a aba: manda o que estiver na fila sem esperar o debounce.
  document?.addEventListener?.('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void enviarPendentes();
  });
}

/** Somente para teste: zera o módulo entre cenários (não existe no app). */
export function __resetUiPreferencesParaTeste(): void {
  // O cache local é relido (o teste pode semear o `localStorage` antes de zerar).
  prefs = lerCache();
  serverPrefs = null;
  status = 'idle';
  syncing = false;
  erro = null;
  sessaoUserId = null;
  carregamentoIniciado = false;
  pendentes.clear();
  if (timer !== null) { clearTimeout(timer); timer = null; }
  listeners.clear();
  snapshot = buildSnapshot();
}

export function useUiPreferences(): UiPreferencesSnapshot {
  return useSyncExternalStore(
    subscribeUiPreferences,
    () => snapshot,
    () => SNAPSHOT_SERVIDOR,
  );
}

import { useCallback, useSyncExternalStore } from 'react';
import { log } from '@/lib/logger';
import { DEFAULT_SHORTCUTS } from '@/hooks/shortcuts/defaultShortcuts';

export interface ShortcutBinding {
  id: string;
  /**
   * Etapa 84: rótulo do atalho. Fica ausente nos 7 atalhos de Tarefas, cujo
   * `name`/`description` é carregado sob demanda por `useTaskShortcutLabels`
   * (chunk à parte) para não pesar no `initial-js`.
   */
  name?: string;
  /** Etapa 84: ver `name` — mesma origem sob demanda nos atalhos de Tarefas. */
  description?: string;
  defaultKey: string;
  defaultModifiers: {
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
  };
  customKey?: string;
  customModifiers?: {
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
  };
  category: 'chat' | 'navigation' | 'actions' | 'selection';
  /**
   * Etapa 77: views (`?view=`) em que o atalho vale. Ausente = global.
   * O `useGlobalKeyboardShortcuts` ignora o atalho fora do escopo — é assim que
   * os 7 atalhos de Tarefas ficam presos a `tasks` (E09: o Quadro virou um modo
   * de Tarefas, então `pipeline` saiu do escopo).
   */
  scope?: string[];
  /**
   * Etapa 77: teclas equivalentes à `defaultKey`. Existe para o atalho único de
   * modo das Tarefas responder a `1`, `2` e `3` sem virar três entradas.
   */
  alternateKeys?: string[];
}

/** Os três modificadores que o app usa numa combinação. */
type ShortcutModifiers = {
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
};

/** Tecla capturada durante a gravação, antes de o usuário confirmar. */
interface PendingShortcut {
  key: string;
  modifiers: ShortcutModifiers;
}

/** Formato gravado no `localStorage`: só as personalizações, por id. */
type StoredBindings = Record<string, { key: string; modifiers: ShortcutModifiers }>;

const STORAGE_KEY = 'custom-keyboard-shortcuts';

/** Campos vazios da gravação — o snapshot do SSR não monta o store. */
const ESTADO_PADRAO: ShortcutStoreState = {
  shortcuts: DEFAULT_SHORTCUTS,
  isRecording: null,
  pendingShortcut: null,
};

/**
 * R2-PLAT-008 — as preferências de atalho são um store único da aba.
 *
 * Antes, cada `useCustomShortcuts()` tinha o PRÓPRIO `useState` hidratado do
 * `localStorage` só no mount. A tela de Configurações monta um por linha, o
 * registry global monta outro, o painel de ajuda outro:
 *
 *  - editar numa instância não chegava às outras — o listener global (que tem a
 *    própria instância) continuava executando a combinação antiga e as linhas
 *    seguiam exibindo o binding velho;
 *  - `saveShortcuts` gravava o conjunto COMPLETO da instância que editou, e como
 *    o storage guarda o mapa inteiro, a segunda personalização apagava a
 *    primeira que a outra já tinha gravado (a tela ainda anunciava sucesso).
 *
 * Agora existe uma fonte só: `state` (bindings + modo de gravação) é
 * compartilhado por toda a aba e os componentes assinam por
 * `useSyncExternalStore`. Toda edição parte do estado vigente, então nada
 * sobrescreve o que outra instância acabou de mudar.
 */
interface ShortcutStoreState {
  shortcuts: ShortcutBinding[];
  isRecording: string | null;
  pendingShortcut: PendingShortcut | null;
}

let state: ShortcutStoreState = ESTADO_PADRAO;
let hydrated = false;
let recordingListenerAttached = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    // Sem ninguém montado, a gravação não pode continuar capturando teclas:
    // antes isso era o cleanup do efeito da instância que gravava.
    if (listeners.size === 0) endRecording();
  };
}

function getSnapshot(): ShortcutStoreState {
  hydrate();
  return state;
}

/** SSR/primeiro paint: estado estável e sem preferências lidas do disco. */
function getServerSnapshot(): ShortcutStoreState {
  return ESTADO_PADRAO;
}

function setState(patch: Partial<ShortcutStoreState>) {
  state = { ...state, ...patch };
  emit();
}

/** Funde as personalizações gravadas nos defaults — id fora do mapa volta ao padrão. */
function aplicarGravados(bindings: StoredBindings): ShortcutBinding[] {
  return DEFAULT_SHORTCUTS.map(shortcut => {
    const custom = bindings?.[shortcut.id];
    if (!custom) return shortcut;
    return { ...shortcut, customKey: custom.key, customModifiers: custom.modifiers };
  });
}

/** Lê o `localStorage` uma vez por aba; depois o estado vive no store. */
function hydrate() {
  if (hydrated) return;
  hydrated = true;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    state = { ...state, shortcuts: aplicarGravados(JSON.parse(stored) as StoredBindings) };
  } catch (e) {
    log.error('Failed to parse stored shortcuts:', e);
  }
}

function persist(shortcuts: ShortcutBinding[]) {
  const customBindings: StoredBindings = {};
  shortcuts.forEach(shortcut => {
    if (shortcut.customKey) {
      customBindings[shortcut.id] = { key: shortcut.customKey, modifiers: shortcut.customModifiers || {} };
    }
  });
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(customBindings)); } catch { /* storage unavailable */ }
}

function updateShortcutBinding(id: string, key: string, modifiers: ShortcutModifiers) {
  const shortcuts = state.shortcuts.map(shortcut =>
    shortcut.id === id ? { ...shortcut, customKey: key, customModifiers: modifiers } : shortcut
  );
  persist(shortcuts);
  setState({ shortcuts });
}

function resetShortcutBinding(id: string) {
  const shortcuts = state.shortcuts.map(shortcut =>
    shortcut.id === id ? { ...shortcut, customKey: undefined, customModifiers: undefined } : shortcut
  );
  persist(shortcuts);
  setState({ shortcuts });
}

function resetAllBindings() {
  hydrated = true;
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
  setState({ shortcuts: DEFAULT_SHORTCUTS });
}

/** Outra aba gravou: a preferência vale para a instalação inteira. */
function rebuildFromStorage() {
  hydrated = true;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    setState({ shortcuts: stored ? aplicarGravados(JSON.parse(stored) as StoredBindings) : DEFAULT_SHORTCUTS });
  } catch (e) {
    log.error('Failed to parse stored shortcuts:', e);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key === null || event.key === STORAGE_KEY) rebuildFromStorage();
  });
}

/**
 * A gravação é um modo da aba, não da linha: um único listener de teclado
 * enquanto `isRecording` está posto (antes cada instância que gravava montava o
 * seu, e a tecla era capturada em todas).
 */
function recordKeyPress(event: KeyboardEvent) {
  if (!state.isRecording) return;
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return;
  event.preventDefault();
  setState({
    pendingShortcut: {
      key: event.key,
      modifiers: {
        ctrlKey: event.ctrlKey || undefined,
        shiftKey: event.shiftKey || undefined,
        altKey: event.altKey || undefined,
      },
    },
  });
}

function attachRecordingListener() {
  if (recordingListenerAttached || typeof window === 'undefined') return;
  window.addEventListener('keydown', recordKeyPress);
  recordingListenerAttached = true;
}

/** Sai do modo de gravação limpando o listener e o estado pendente. */
function endRecording() {
  if (recordingListenerAttached) {
    window.removeEventListener('keydown', recordKeyPress);
    recordingListenerAttached = false;
  }
  if (state.isRecording !== null || state.pendingShortcut !== null) {
    setState({ isRecording: null, pendingShortcut: null });
  }
}

function startRecordingBinding(id: string) {
  hydrate();
  attachRecordingListener();
  setState({ isRecording: id, pendingShortcut: null });
}

function stopRecordingBinding() {
  const { isRecording, pendingShortcut } = state;
  if (isRecording && pendingShortcut) updateShortcutBinding(isRecording, pendingShortcut.key, pendingShortcut.modifiers);
  endRecording();
}

export function useCustomShortcuts() {
  const { shortcuts, isRecording, pendingShortcut } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const updateShortcut = useCallback((id: string, key: string, modifiers: ShortcutModifiers) => {
    updateShortcutBinding(id, key, modifiers);
  }, []);

  const resetShortcut = useCallback((id: string) => {
    resetShortcutBinding(id);
  }, []);

  const resetAllShortcuts = useCallback(() => {
    resetAllBindings();
  }, []);

  const getActiveBinding = useCallback((shortcut: ShortcutBinding) => ({
    key: shortcut.customKey || shortcut.defaultKey,
    modifiers: shortcut.customModifiers || shortcut.defaultModifiers,
  }), []);

  const getShortcutById = useCallback((id: string) => shortcuts.find(s => s.id === id), [shortcuts]);

  const formatShortcut = useCallback((shortcut: ShortcutBinding) => {
    const binding = getActiveBinding(shortcut);
    const parts: string[] = [];
    if (binding.modifiers.ctrlKey) parts.push('Ctrl');
    if (binding.modifiers.shiftKey) parts.push('Shift');
    if (binding.modifiers.altKey) parts.push('Alt');
    parts.push(binding.key === ' ' ? 'Space' : binding.key);
    return parts;
  }, [getActiveBinding]);

  const startRecording = useCallback((id: string) => { startRecordingBinding(id); }, []);
  const stopRecording = useCallback(() => { stopRecordingBinding(); }, []);
  const cancelRecording = useCallback(() => { endRecording(); }, []);

  const checkConflict = useCallback((id: string, key: string, modifiers: ShortcutModifiers) => {
    return shortcuts.find(s => {
      if (s.id === id) return false;
      const binding = getActiveBinding(s);
      return binding.key.toLowerCase() === key.toLowerCase() && !!binding.modifiers.ctrlKey === !!modifiers.ctrlKey && !!binding.modifiers.shiftKey === !!modifiers.shiftKey && !!binding.modifiers.altKey === !!modifiers.altKey;
    });
  }, [shortcuts, getActiveBinding]);

  return {
    shortcuts, isRecording, pendingShortcut,
    updateShortcut, resetShortcut, resetAllShortcuts,
    getActiveBinding, getShortcutById, formatShortcut,
    startRecording, stopRecording, cancelRecording, checkConflict,
  };
}

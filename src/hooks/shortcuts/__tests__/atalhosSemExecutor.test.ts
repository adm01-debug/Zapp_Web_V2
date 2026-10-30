/**
 * t_3d996237 — a tela de atalhos não promete tecla sem executor.
 *
 * A varredura não copia lista nenhuma: chama `criarAcoesGlobais()` (a tabela
 * REAL de executores, a mesma que o registry usa) e compara com
 * `DEFAULT_SHORTCUTS`. Tirar uma ação do registry, acrescentar um atalho sem
 * dono ou esconder um atalho que funciona quebra este teste.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SHORTCUTS,
  SHORTCUTS_SOMENTE_INFORMATIVOS,
  listarAtalhosEditaveis,
} from '@/hooks/shortcuts/defaultShortcuts';
import { criarAcoesGlobais } from '@/hooks/ui/useGlobalKeyboardShortcuts';

/**
 * Ids com executor. Além das ações globais, o `GlobalKeyboardProvider` registra
 * as duas dele (`show-shortcuts-help` e `open-command-palette`).
 */
const EXECUTORES = new Set([
  ...Object.keys(criarAcoesGlobais({ pathname: '/', navigate: vi.fn() })),
  'show-shortcuts-help',
  'open-command-palette',
]);

/** Atalhos do registry que hoje não têm nenhum dono. */
const SEM_EXECUTOR = DEFAULT_SHORTCUTS.map((s) => s.id).filter((id) => !EXECUTORES.has(id));

describe('atalhos sem executor ficam fora da tela de atalhos e da ajuda', () => {
  it('a lista de somente informativos é exatamente o conjunto sem executor', () => {
    expect([...SHORTCUTS_SOMENTE_INFORMATIVOS].sort()).toEqual([...SEM_EXECUTOR].sort());
  });

  it('nada que a tela mostra é editável sem efeito', () => {
    const editaveis = listarAtalhosEditaveis(DEFAULT_SHORTCUTS);
    expect(editaveis.map((s) => s.id).filter((id) => !EXECUTORES.has(id))).toEqual([]);
    // A tela ficou menor de verdade: sem isso, um filtro quebrado passaria.
    expect(editaveis.length).toBeLessThan(DEFAULT_SHORTCUTS.length);
  });

  it('os atalhos que o registry executa continuam editáveis', () => {
    const editaveis = listarAtalhosEditaveis(DEFAULT_SHORTCUTS).map((s) => s.id);
    const comExecutor = ['global-search', 'toggle-sidebar', 'open-tasks-tab', 'refresh-data', 'tasks-mode'];
    expect(comExecutor.filter((id) => !editaveis.includes(id))).toEqual([]);
  });
});

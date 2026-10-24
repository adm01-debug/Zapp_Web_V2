/**
 * Etapa 84 — os rótulos dos 7 atalhos de Tarefas saem do grafo de entrada.
 *
 * Contratos que sustentam o corte no budget `initial-js` (340 KB):
 *  1. `defaultShortcuts.ts` (eager) não carrega `name`/`description` dos atalhos
 *     de Tarefas — é isso que tira os textos do chunk de entrada;
 *  2. `taskShortcutLabels.ts` (chunk sob demanda) cobre exatamente esses 7 ids,
 *     com os textos originais;
 *  3. `aplicarRotulos` funde os rótulos sem tocar nos atalhos globais.
 *
 * O outro lado (o painel de ajuda realmente exibindo estes rótulos) é provado em
 * `src/components/keyboard/__tests__/KeyboardShortcutsDialog.test.tsx`.
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_SHORTCUTS, TASKS_VIEWS } from '@/hooks/shortcuts/defaultShortcuts';
import { aplicarRotulos, type ShortcutLabel } from '@/hooks/shortcuts/shortcutLabels';
import { TASK_SHORTCUT_LABELS } from '@/hooks/shortcuts/taskShortcutLabels';

const IDS_TAREFAS = [
  'tasks-focus-quickadd', 'tasks-mode', 'tasks-search', 'tasks-open-sheet',
  'tasks-complete', 'tasks-cancel', 'tasks-help',
];

const atalhosDoModulo = () => DEFAULT_SHORTCUTS.filter(s => s.scope === TASKS_VIEWS);
const porId = <T extends { id: string }>(lista: T[], id: string) => lista.find(s => s.id === id);

describe('etapa 84 — rótulos de Tarefas fora do chunk de entrada', () => {
  it('o arquivo eager não carrega name/description dos 7 atalhos de Tarefas', () => {
    const doModulo = atalhosDoModulo();
    expect(doModulo).toHaveLength(7);
    for (const atalho of doModulo) {
      expect(atalho.name).toBeUndefined();
      expect(atalho.description).toBeUndefined();
    }
    // o que o registry precisa para casar tecla continua eager
    expect(porId(doModulo, 'tasks-search')?.defaultKey).toBe('/');
    expect(porId(doModulo, 'tasks-mode')?.alternateKeys).toEqual(['2', '3']);
    expect(porId(doModulo, 'tasks-help')?.defaultModifiers).toEqual({ shiftKey: true });
  });

  it('os atalhos globais continuam com nome e descrição inline', () => {
    const globais = DEFAULT_SHORTCUTS.filter(s => !s.scope);
    expect(globais.length).toBeGreaterThan(20);
    expect(globais.every(s => !!s.name && !!s.description)).toBe(true);
  });

  it('o chunk sob demanda cobre exatamente os 7 ids, com os textos originais', () => {
    expect(Object.keys(TASK_SHORTCUT_LABELS).sort()).toEqual([...IDS_TAREFAS].sort());
    expect(TASK_SHORTCUT_LABELS['tasks-focus-quickadd']).toEqual({
      name: 'Nova tarefa',
      description: 'Foca o campo de nova tarefa',
    });
    expect(TASK_SHORTCUT_LABELS['tasks-mode'].description).toBe('Troca o modo: Lista (1), Quadro (2), Agenda (3)');
    expect(TASK_SHORTCUT_LABELS['tasks-help'].name).toBe('Ajuda de atalhos');
    expect(Object.values(TASK_SHORTCUT_LABELS).every(l => !!l.name && !!l.description)).toBe(true);
  });
});

describe('etapa 84 — aplicarRotulos', () => {
  const rotulos: Record<string, ShortcutLabel> = {
    'tasks-mode': { name: 'Modo das Tarefas', description: 'Troca o modo' },
  };

  it('devolve o próprio array quando os rótulos ainda não chegaram', () => {
    const entrada = atalhosDoModulo();
    expect(aplicarRotulos(entrada, null)).toBe(entrada);
  });

  it('funde nome/descrição nos atalhos sem rótulo, preservando o binding', () => {
    const [rotulado] = aplicarRotulos(
      DEFAULT_SHORTCUTS.filter(s => s.id === 'tasks-mode'),
      rotulos,
    );
    expect(rotulado.name).toBe('Modo das Tarefas');
    expect(rotulado.description).toBe('Troca o modo');
    expect(rotulado.defaultKey).toBe('1');
    expect(rotulado.scope).toEqual(TASKS_VIEWS);
  });

  it('não sobrescreve atalho que já tem nome, nem inventa rótulo para id desconhecido', () => {
    const resultado = aplicarRotulos(DEFAULT_SHORTCUTS, rotulos);
    expect(porId(resultado, 'send-message')?.name).toBe('Enviar mensagem');
    expect(porId(resultado, 'tasks-complete')?.name).toBeUndefined();
    expect(porId(resultado, 'tasks-complete')?.description).toBeUndefined();
    // e o rótulo aplicado não vaza para outros atalhos
    expect(resultado.filter(s => s.name === 'Modo das Tarefas')).toHaveLength(1);
  });

  it('com TASK_SHORTCUT_LABELS todos os 7 atalhos de Tarefas ganham rótulo', () => {
    const rotulados = aplicarRotulos(DEFAULT_SHORTCUTS, TASK_SHORTCUT_LABELS);
    for (const id of IDS_TAREFAS) {
      const atalho = porId(rotulados, id);
      expect(atalho?.name, `rótulo ausente em ${id}`).toBeTruthy();
      expect(atalho?.description, `descrição ausente em ${id}`).toBeTruthy();
    }
    expect(rotulados).toHaveLength(DEFAULT_SHORTCUTS.length);
  });
});

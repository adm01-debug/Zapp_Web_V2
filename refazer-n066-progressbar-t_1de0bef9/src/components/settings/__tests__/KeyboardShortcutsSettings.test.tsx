/**
 * Etapa 84 — a tela de atalhos (Configurações) exibe os rótulos dos 7 atalhos
 * de Tarefas que saíram do chunk de entrada.
 *
 * Esta tela é uma rota lazy (`SettingsView`), então `taskShortcutLabels` chega
 * junto com ela — nunca no `initial-js`. Aqui se prova que nome e descrição
 * continuam aparecendo para o usuário final.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

/** O que `useCustomShortcuts()` devolve de verdade. */
type HookValue = ReturnType<typeof import('@/hooks/ui/useCustomShortcuts').useCustomShortcuts>;

/**
 * N-150 — o mock do hook serve SÓ ao `describe` de acessibilidade.
 *
 * Enquanto `hookFalso.valor` é `null`, quem responde é o hook REAL
 * (`real.useCustomShortcuts()`), então o `describe` da etapa 84 abaixo continua
 * provando o comportamento de verdade da tela. O mock existe apenas para levar
 * uma linha até o estado de gravação/personalizado, que sem interação de
 * teclado não é alcançável.
 */
const hookFalso = vi.hoisted(() => ({ valor: null as (() => HookValue) | null }));

vi.mock('@/hooks/ui/useCustomShortcuts', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/hooks/ui/useCustomShortcuts')>();
  return {
    ...real,
    useCustomShortcuts: () => (hookFalso.valor ? hookFalso.valor() : real.useCustomShortcuts()),
  };
});

import type { ShortcutBinding } from '@/hooks/ui/useCustomShortcuts';
import { KeyboardShortcutsSettings } from '@/components/settings/KeyboardShortcutsSettings';

const CASOS: Array<{ nome: string; descricao: string }> = [
  { nome: 'Nova tarefa', descricao: 'Foca o campo de nova tarefa' },
  { nome: 'Modo das Tarefas', descricao: 'Troca o modo: Lista (1), Quadro (2), Agenda (3)' },
  { nome: 'Buscar tarefa', descricao: 'Foca o campo de busca das Tarefas' },
  { nome: 'Abrir tarefa focada', descricao: 'Abre o painel da tarefa em foco' },
  { nome: 'Concluir tarefa focada', descricao: 'Conclui — ou reabre — a tarefa em foco' },
  { nome: 'Cancelar tarefa focada', descricao: 'Cancela a tarefa em foco, com desfazer' },
];

describe('etapa 84 — tela de atalhos exibe nome e descrição das Tarefas', () => {
  // Garante o hook REAL neste describe, independente da ordem de execução.
  beforeEach(() => {
    hookFalso.valor = null;
  });

  it('lista os atalhos de Tarefas com o rótulo carregado sob demanda', () => {
    render(<KeyboardShortcutsSettings />);

    for (const { nome, descricao } of CASOS) {
      expect(screen.getByText(nome)).toBeInTheDocument();
      expect(screen.getByText(descricao)).toBeInTheDocument();
    }
    // `tasks-help` divide o nome "Ajuda de atalhos" com o atalho global.
    expect(screen.getAllByText('Ajuda de atalhos')).toHaveLength(2);
    expect(screen.getByText('Mostra o painel de atalhos')).toBeInTheDocument();
  });

  it('mantém os atalhos globais intactos', () => {
    render(<KeyboardShortcutsSettings />);

    expect(screen.getByText('Enviar mensagem')).toBeInTheDocument();
    expect(screen.getByText('Envia a mensagem atual')).toBeInTheDocument();
    expect(screen.getByText('Busca global')).toBeInTheDocument();
  });
});

/** Atalho global (nome inline) + dois de Tarefas (nome vem do rótulo sob demanda). */
const BASE: ShortcutBinding[] = [
  { id: 'send-message', name: 'Enviar mensagem', description: 'Envia a mensagem atual', defaultKey: 'Enter', defaultModifiers: { ctrlKey: true }, category: 'chat' },
  { id: 'tasks-focus-quickadd', defaultKey: 'n', defaultModifiers: {}, category: 'actions', scope: ['tasks'] },
  { id: 'tasks-mode', defaultKey: '1', alternateKeys: ['2', '3'], defaultModifiers: {}, category: 'navigation', scope: ['tasks'] },
];

/** Os dois atalhos de Tarefas com tecla personalizada. */
const CUSTOMIZADOS: ShortcutBinding[] = BASE.map((s) =>
  s.id === 'tasks-focus-quickadd' || s.id === 'tasks-mode'
    ? { ...s, customKey: 'k', customModifiers: { ctrlKey: true } }
    : s,
);

function mockHook(shortcuts: ShortcutBinding[], isRecording: string | null = null): HookValue {
  return {
    shortcuts,
    isRecording,
    pendingShortcut: null,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    cancelRecording: vi.fn(),
    resetShortcut: vi.fn(),
    checkConflict: vi.fn(() => undefined),
    formatShortcut: vi.fn((s: ShortcutBinding) => {
      const parts: string[] = [];
      if (s.defaultModifiers?.ctrlKey) parts.push('Ctrl');
      if (s.defaultModifiers?.shiftKey) parts.push('Shift');
      if (s.defaultModifiers?.altKey) parts.push('Alt');
      parts.push(s.defaultKey === ' ' ? 'Space' : s.defaultKey);
      return parts;
    }),
    getActiveBinding: vi.fn((s: ShortcutBinding) => ({ key: s.defaultKey, modifiers: s.defaultModifiers })),
    getShortcutById: vi.fn((id: string) => shortcuts.find((x) => x.id === id)),
    updateShortcut: vi.fn(),
    resetAllShortcuts: vi.fn(),
  };
}

describe('N-150 — os botões de ação da linha dizem a ação E o atalho', () => {
  afterEach(() => {
    hookFalso.valor = null;
  });

  it('nomeia confirmar e cancelar com o atalho da linha em gravação', () => {
    const hook = mockHook(CUSTOMIZADOS, 'tasks-focus-quickadd');
    hookFalso.valor = () => hook;

    render(<KeyboardShortcutsSettings />);

    // `tasks-focus-quickadd` não traz `name` no binding: o texto exibido vem de
    // `TASK_SHORTCUT_LABELS` por `aplicarRotulos`. O rótulo do botão usa o MESMO
    // valor que a linha exibe.
    expect(screen.getByText('Nova tarefa')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar atalho Nova tarefa' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Cancelar gravação do atalho Nova tarefa' }),
    ).toBeInTheDocument();
  });

  it('distingue os botões de restaurar de linhas diferentes', () => {
    const hook = mockHook(CUSTOMIZADOS, null);
    hookFalso.valor = () => hook;

    render(<KeyboardShortcutsSettings />);

    expect(
      screen.getByRole('button', { name: 'Restaurar atalho Nova tarefa ao padrão' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Restaurar atalho Modo das Tarefas ao padrão' }),
    ).toBeInTheDocument();
    // Duas linhas personalizadas, dois nomes distintos: o rótulo genérico
    // antigo ("Restaurar atalho") não existe mais.
    expect(screen.getAllByRole('button', { name: /^Restaurar atalho / })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Restaurar atalho' })).not.toBeInTheDocument();
  });

  it('o axe não acusa violação nenhuma na tela', async () => {
    const hook = mockHook(CUSTOMIZADOS, 'tasks-focus-quickadd');
    hookFalso.valor = () => hook;

    const { container } = render(<KeyboardShortcutsSettings />);

    // jsdom não tem layout: contraste fica fora (declarado), como nos outros
    // arquivos `.a11y.test.tsx` do repo. Todas as demais regras valem e nada é
    // filtrado depois: qualquer violação reprova.
    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});

/**
 * Etapa 84 — a tela de atalhos (Configurações) exibe os rótulos dos 7 atalhos
 * de Tarefas que saíram do chunk de entrada.
 *
 * Esta tela é uma rota lazy (`SettingsView`), então `taskShortcutLabels` chega
 * junto com ela — nunca no `initial-js`. Aqui se prova que nome e descrição
 * continuam aparecendo para o usuário final.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

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

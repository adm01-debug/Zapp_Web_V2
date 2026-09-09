import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Activity } from 'lucide-react';
import { KpiStrip } from '../KpiStrip';
import { SectionCard } from '../SectionCard';
import { TaskCard } from '../TaskCard';
import type { ConversationTask } from '@/hooks/chat/useConversationTasks';

describe('componentes compartilhados das abas', () => {
  it('KpiStrip usa semântica de lista descritiva e grid baseado no container', () => {
    render(<KpiStrip cells={[{ icon: Activity, label: 'Total', value: 42 }]} />);

    const strip = screen.getByTestId('kpi-strip');
    expect(strip.tagName).toBe('DL');
    expect(strip).toHaveStyle({ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 11rem), 1fr))' });
    expect(screen.getByText('Total').tagName).toBe('DT');
    expect(screen.getByText('42').tagName).toBe('DD');
  });

  it('SectionCard mantém a ação nomeada e operável', () => {
    const onClick = vi.fn();
    render(<SectionCard icon={Activity} title="Indicadores" action={{ label: 'Ver tudo', onClick }}><p>Dados</p></SectionCard>);
    fireEvent.click(screen.getByRole('button', { name: 'Ver tudo' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('TaskCard fornece nomes específicos aos controles e aceita conteúdo longo', () => {
    const onToggle = vi.fn();
    const onDelete = vi.fn();
    const task = {
      id: 'task-1',
      title: 'Retornar ao cliente sobre a proposta detalhada',
      description: 'Descrição extensa sem perda de informação',
      priority: 'high',
      status: 'pending',
      due_date: null,
    } as ConversationTask;

    render(<TaskCard task={task} onToggle={onToggle} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('checkbox', { name: `Concluir ${task.title}` }));
    fireEvent.click(screen.getByRole('button', { name: `Excluir tarefa ${task.title}` }));

    expect(onToggle).toHaveBeenCalledWith(task);
    expect(onDelete).toHaveBeenCalledWith(task.id);
    expect(screen.getByText(task.title)).toHaveClass('break-words');
  });
});

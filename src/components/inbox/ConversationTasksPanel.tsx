import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Calendar, Trash2, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';

interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  due_date: string | null;
  assigned_to: string | null;
  completed_at: string | null;
  created_at: string;
}

interface ConversationTasksPanelProps {
  contactId: string;
  profileId?: string | null;
}

const priorityConfig: Record<string, { label: string; color: string; icon: typeof AlertTriangle }> = {
  high: { label: 'Alta', color: 'bg-destructive/10 text-destructive', icon: AlertTriangle },
  medium: { label: 'Média', color: 'bg-warning/10 text-warning', icon: Clock },
  low: { label: 'Baixa', color: 'bg-success/10 text-success', icon: CheckCircle2 },
};

export function ConversationTasksPanel({ contactId, profileId }: ConversationTasksPanelProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState('medium');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadTasks();
  }, [contactId]);

  const loadTasks = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('conversation_tasks')
      .select('*')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false });
    if (data) setTasks(data);
    setLoading(false);
  };

  const addTask = async () => {
    if (!newTitle.trim()) return;
    setAdding(true);
    const { error } = await supabase
      .from('conversation_tasks')
      .insert({
        contact_id: contactId,
        title: newTitle.trim(),
        priority: newPriority,
        created_by: profileId,
        assigned_to: profileId,
      });
    if (!error) {
      setNewTitle('');
      toast.success('Tarefa criada');
      loadTasks();
    } else {
      toast.error('Erro ao criar tarefa');
    }
    setAdding(false);
  };

  const toggleTask = async (task: Task) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    await supabase
      .from('conversation_tasks')
      .update({
        status: newStatus,
        completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
      })
      .eq('id', task.id);
    loadTasks();
  };

  const deleteTask = async (taskId: string) => {
    await supabase.from('conversation_tasks').delete().eq('id', taskId);
    toast.success('Tarefa removida');
    loadTasks();
  };

  const pendingTasks = tasks.filter(t => t.status !== 'completed');
  const completedTasks = tasks.filter(t => t.status === 'completed');

  return (
    <div className="space-y-3">
      {/* Add task */}
      <div className="flex gap-2">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Nova tarefa..."
          className="h-8 text-sm"
          onKeyDown={(e) => e.key === 'Enter' && addTask()}
        />
        <Select value={newPriority} onValueChange={setNewPriority}>
          <SelectTrigger className="w-24 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="high">Alta</SelectItem>
            <SelectItem value="medium">Média</SelectItem>
            <SelectItem value="low">Baixa</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" className="h-8 px-2" onClick={addTask} disabled={adding || !newTitle.trim()} aria-label="Adicionar tarefa">
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {/* Task list */}
      {loading ? (
        <div className="space-y-2">
          {[1,2].map(i => (
            <div key={i} className="h-10 bg-muted/30 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <AnimatePresence mode="popLayout">
          {pendingTasks.length === 0 && completedTasks.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-3">Nenhuma tarefa</p>
          )}
          {pendingTasks.map((task) => {
            const cfg = priorityConfig[task.priority] || priorityConfig.medium;
            return (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-2 p-2 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors group"
              >
                <Checkbox
                  checked={false}
                  onCheckedChange={() => toggleTask(task)}
                  className="shrink-0"
                />
                <span className="text-sm flex-1 truncate">{task.title}</span>
                <Badge variant="outline" className={`text-[10px] ${cfg.color}`}>
                  {cfg.label}
                </Badge>
                {task.due_date && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {format(new Date(task.due_date), 'dd/MM', { locale: ptBR })}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => deleteTask(task.id)}
                >
                  <Trash2 className="w-3 h-3 text-destructive" />
                </Button>
              </motion.div>
            );
          })}
          {completedTasks.length > 0 && (
            <div className="pt-2 border-t border-border/30">
              <p className="text-xs text-muted-foreground mb-1">Concluídas ({completedTasks.length})</p>
              {completedTasks.slice(0, 3).map((task) => (
                <div key={task.id} className="flex items-center gap-2 p-1.5 opacity-60">
                  <Checkbox checked onCheckedChange={() => toggleTask(task)} className="shrink-0" />
                  <span className="text-xs line-through flex-1 truncate">{task.title}</span>
                </div>
              ))}
            </div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}

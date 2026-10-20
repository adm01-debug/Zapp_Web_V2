import { useState, useRef, forwardRef } from 'react';
import { Plus, Calendar, Bell, AlarmClock } from 'lucide-react';
import type { WorkItemInput } from '@/hooks/tasks/useMyWorkItems';
import type { WorkItemStatus } from '@/hooks/tasks/workItem.types';

interface Props {
  onAdd: (input: WorkItemInput) => Promise<void>;
  defaultStatus?: WorkItemStatus;
  defaultContactId?: string | null;
  /** Etapa 57: já nasce com o prazo do dia escolhido (a Agenda passa o dia selecionado). */
  defaultDueDate?: string | null;
  placeholder?: string;
  compact?: boolean;
}

export const QuickAdd = forwardRef<HTMLInputElement, Props>(function QuickAdd(
  { onAdd, defaultStatus = 'backlog', defaultContactId, defaultDueDate = null, placeholder, compact = false },
  ref
) {
  const [title, setTitle]       = useState('');
  const [dueDate, setDueDate]   = useState<string | null>(defaultDueDate);
  const [remindAt, setRemindAt] = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Fase F2 (auditoria): trocar de dia na Agenda reaplica o prazo SEM remontar o
  // campo — o rascunho digitado sobrevive à troca (antes o `key` do pai descartava
  // o texto). Ajuste durante o render, o padrão do React quando "o dado de fora
  // mudou"; sem efeito de sincronização e sem dívida de lint.
  const [diaAplicado, setDiaAplicado] = useState<string | null>(defaultDueDate);
  if (defaultDueDate !== diaAplicado) {
    setDiaAplicado(defaultDueDate);
    setDueDate(defaultDueDate);
  }

  const setToday = () => {
    const d = new Date(); d.setHours(23, 59, 0, 0);
    setDueDate(d.toISOString());
  };
  const setTomorrow = () => {
    const d = new Date(Date.now() + 86_400_000); d.setHours(23, 59, 0, 0);
    setDueDate(d.toISOString());
  };
  const setNextWeek = () => {
    const d = new Date(Date.now() + 7 * 86_400_000); d.setHours(23, 59, 0, 0);
    setDueDate(d.toISOString());
  };
  const setRemindTomorrow9 = () => {
    const d = new Date(Date.now() + 86_400_000); d.setHours(9, 0, 0, 0);
    setRemindAt(d.toISOString());
  };

  const handleSubmit = async () => {
    const t = title.trim();
    if (!t || loading) return;
    setLoading(true);
    try {
      await onAdd({ title: t, status: defaultStatus, contactId: defaultContactId, dueDate, remindAt });
      // Fase F2 (auditoria): volta ao prazo PADRÃO do campo, não a `null`. Na
      // Agenda o padrão é o dia selecionado — sem isso o 2º create seguido do
      // mesmo dia nascia sem prazo e sumia da Agenda (o DoD da etapa 57 só valia
      // para o 1º envio).
      setTitle(''); setDueDate(defaultDueDate ?? null); setRemindAt(null);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); void handleSubmit(); }
    if (e.key === 'Escape') { setTitle(''); setDueDate(defaultDueDate ?? null); setRemindAt(null); }
  };

  return (
    <div className="flex flex-col gap-1.5" data-testid="quick-add">
      <div className="flex items-center gap-2 h-11 rounded-xl bg-input border border-border px-4">
        <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          ref={(el) => {
            inputRef.current = el;
            if (typeof ref === 'function') ref(el);
            else if (ref) ref.current = el;
          }}
          data-testid="quick-add-input"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? 'Adicionar tarefa… (Enter para criar)'}
          className="flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground/60 outline-none"
          disabled={loading}
        />
        {title && (
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={loading}
            className="shrink-0 h-7 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
          >
            {loading ? '…' : 'Criar'}
          </button>
        )}
      </div>
      {!compact && title && (
        <div className="flex items-center gap-1.5 px-1 flex-wrap">
          <button type="button" data-testid="quick-add-chip-today"    onClick={setToday}           className="chip-btn">Hoje <Calendar className="h-3 w-3" /></button>
          <button type="button" data-testid="quick-add-chip-tomorrow" onClick={setTomorrow}        className="chip-btn">Amanhã <Calendar className="h-3 w-3" /></button>
          <button type="button" data-testid="quick-add-chip-nextweek" onClick={setNextWeek}        className="chip-btn">Próx. semana <Calendar className="h-3 w-3" /></button>
          <button type="button" data-testid="quick-add-chip-remind"   onClick={setRemindTomorrow9} className="chip-btn">Lembrar amanhã 9h <Bell className="h-3 w-3" /></button>
          {dueDate   && <span data-testid="quick-add-due" className="chip-active">Prazo: {new Date(dueDate).toLocaleDateString('pt-BR')}</span>}
          {remindAt  && <span className="chip-active">Alerta: {new Date(remindAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span>}
        </div>
      )}
    </div>
  );
});

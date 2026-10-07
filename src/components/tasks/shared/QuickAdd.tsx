import { useRef, useState, forwardRef } from 'react';
import { Plus, Calendar, Bell, Clock, Flag, MoreHorizontal } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { WorkItemInput } from '@/hooks/tasks/useMyWorkItems';
import type { Priority, WorkItemStatus } from '@/hooks/tasks/workItem.types';
import { PRIORITY_LABELS } from '@/hooks/tasks/workItemLabels';
import { ContactCombobox } from './ContactCombobox';

interface Props {
  onAdd: (input: WorkItemInput) => Promise<void>;
  defaultStatus?: WorkItemStatus;
  defaultContactId?: string | null;
  /** Etapa 57: já nasce com o prazo do dia escolhido (a Agenda passa o dia selecionado). */
  defaultDueDate?: string | null;
  placeholder?: string;
  compact?: boolean;
}

/** `yyyy-MM-dd`/`HH:mm` locais de um ISO (mesma convenção do WorkItemSheet). */
function diaLocal(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function horaLocal(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
/** `dia` + `hora` locais → ISO; sem hora, o prazo vale o dia inteiro (23:59). */
function compor(dia: string, hora: string): string {
  const [y, m, d] = dia.split('-').map(Number);
  const [h, min] = (hora || '23:59').split(':').map(Number);
  return new Date(y, m - 1, d, h, min, 0, 0).toISOString();
}
/** Rótulo curto do prazo no chip Data: "Sex 03/10" (etapa 37). */
function rotuloDia(iso: string): string {
  const d = new Date(iso);
  const wd = format(d, 'EEE', { locale: ptBR }).replace('.', '');
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${format(d, 'dd/MM', { locale: ptBR })}`;
}

const PRIORIDADES: Priority[] = ['low', 'medium', 'high', 'urgent'];

export const QuickAdd = forwardRef<HTMLInputElement, Props>(function QuickAdd(
  { onAdd, defaultStatus = 'backlog', defaultContactId, defaultDueDate = null, placeholder, compact = false },
  ref
) {
  const [title, setTitle]       = useState('');
  const [dueDate, setDueDate]   = useState<string | null>(defaultDueDate);
  const [remindAt, setRemindAt] = useState<string | null>(null);
  const [priority, setPriority] = useState<Priority>('medium');
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);

  const [abertoData, setAbertoData]         = useState(false);
  const [abertoLembrar, setAbertoLembrar]   = useState(false);
  const [abertoPrioridade, setAbertoPrior]  = useState(false);
  const [abertoMais, setAbertoMais]         = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);

  // O contato do chat é fixo; fora do chat, o chip @ escolhe o contato.
  const contactId = defaultContactId ?? escolhido;

  // Fase F2 (auditoria): trocar de dia na Agenda reaplica o prazo SEM remontar o
  // campo — o rascunho digitado sobrevive à troca (antes o `key` do pai descartava
  // o texto). Ajuste durante o render, o padrão do React quando "o dado de fora
  // mudou"; sem efeito de sincronização e sem dívida de lint.
  const [diaAplicado, setDiaAplicado] = useState<string | null>(defaultDueDate);
  if (defaultDueDate !== diaAplicado) {
    setDiaAplicado(defaultDueDate);
    setDueDate(defaultDueDate);
  }

  // Etapa 38: alarme no passado bloqueia a criação e pinta a borda de destructive.
  const remindInPast = remindAt !== null && new Date(remindAt).getTime() <= Date.now();
  const podeCriar = title.trim().length > 0 && !loading && !remindInPast;

  const setHoje = () => {
    const d = new Date(); d.setHours(23, 59, 0, 0);
    setDueDate(d.toISOString());
  };
  const setAmanha = () => {
    const d = new Date(Date.now() + 86_400_000); d.setHours(23, 59, 0, 0);
    setDueDate(d.toISOString());
  };
  const setProximaSemana = () => {
    const d = new Date(Date.now() + 7 * 86_400_000); d.setHours(23, 59, 0, 0);
    setDueDate(d.toISOString());
  };

  // Etapa 38 — presets do chip Lembrar: Em 1 h · Amanhã 9h · Próx. seg 9h.
  const lembrarEm1h = () => setRemindAt(new Date(Date.now() + 3_600_000).toISOString());
  const lembrarAmanha9 = () => {
    const d = new Date(Date.now() + 86_400_000); d.setHours(9, 0, 0, 0);
    setRemindAt(d.toISOString());
  };
  const lembrarProximaSeg9 = () => {
    const d = new Date();
    const delta = (8 - d.getDay()) % 7 || 7; // sempre a PRÓXIMA segunda
    d.setDate(d.getDate() + delta); d.setHours(9, 0, 0, 0);
    setRemindAt(d.toISOString());
  };

  // Etapa 41 — Ctrl+@ abre o chip de contato: foca e aciona o gatilho do combobox.
  const abrirContato = () => {
    if (compact) setAbertoMais(true);
    const acionar = () => {
      const el = document.querySelector<HTMLElement>('[data-testid="quick-add-chip-contact"]');
      if (!el) return;
      el.focus();
      // O gatilho é um <button> (aria-expanded); abre de fato, não só foca.
      if (el instanceof HTMLButtonElement && el.getAttribute('aria-expanded') !== 'true') el.click();
    };
    acionar();
    // No compact o chip só monta depois que o menu ⋯ abre.
    if (compact) window.setTimeout(acionar, 0);
  };

  const limpar = () => {
    setTitle('');
    setDueDate(defaultDueDate ?? null);
    // #424: a criação pode resolver DEPOIS de o dia ser trocado, e este closure
    // guarda o padrão do dia A. Marcar `diaAplicado` com ele faz o ajuste de
    // render abaixo reaplicar — já no dia B — o padrão vigente, em vez de
    // devolver o prazo do dia anterior.
    setDiaAplicado(defaultDueDate);
    setRemindAt(null);
    setPriority('medium');
    setEscolhido(null);
  };

  const handleSubmit = async () => {
    const t = title.trim();
    if (!t || !podeCriar) return;
    setLoading(true);
    try {
      await onAdd({
        title: t, status: defaultStatus, contactId, dueDate, remindAt, priority,
      });
      // Fase F2 (auditoria): volta ao prazo PADRÃO do campo, não a `null`. Na
      // Agenda o padrão é o dia selecionado — sem isso o 2º create seguido do
      // mesmo dia nascia sem prazo e sumia da Agenda (o DoD da etapa 57 só valia
      // para o 1º envio).
      limpar();
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Etapa 41 — atalhos dentro do campo (parser leve, sem NLP; G-5 mantido).
    if (e.ctrlKey && e.key === '@') { e.preventDefault(); abrirContato(); return; }
    if (e.ctrlKey && !e.altKey && !e.metaKey) {
      if (e.key === '1') { e.preventDefault(); setHoje(); return; }
      if (e.key === '2') { e.preventDefault(); setAmanha(); return; }
      if (e.key === '3') { e.preventDefault(); setProximaSemana(); return; }
      if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        // No compact o chip Lembrar vive dentro do ⋯: sem abri-lo, o popover
        // não tem gatilho montado e o atalho não faz nada (etapa 41).
        if (compact) setAbertoMais(true);
        setAbertoLembrar(true);
        return;
      }
    }
    if (e.key === 'Enter') { e.preventDefault(); void handleSubmit(); }
    if (e.key === 'Escape') { limpar(); }
  };

  const chips = (
    <>
      <button type="button" data-testid="quick-add-chip-today"    onClick={setHoje}           className="chip-btn">Hoje <Calendar className="h-3 w-3" /></button>
      <button type="button" data-testid="quick-add-chip-tomorrow" onClick={setAmanha}         className="chip-btn">Amanhã <Calendar className="h-3 w-3" /></button>
      <button type="button" data-testid="quick-add-chip-nextweek" onClick={setProximaSemana}  className="chip-btn">Próx. semana <Calendar className="h-3 w-3" /></button>

      {/* Etapa 37 — chip Data: popover com Calendar (ptBR) + hora opcional. */}
      <Popover open={abertoData} onOpenChange={setAbertoData}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid="quick-add-chip-date"
            aria-label="Data"
            className={dueDate ? 'chip-active' : 'chip-btn'}
          >
            <Calendar className="h-3 w-3" /> {dueDate ? rotuloDia(dueDate) : 'Data'}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <CalendarPicker
            mode="single"
            locale={ptBR}
            selected={dueDate ? new Date(dueDate) : undefined}
            onSelect={(d) => setDueDate(
              d ? compor(diaLocal(d.toISOString()), dueDate ? horaLocal(dueDate) : '23:59') : null
            )}
          />
          <div className="flex items-center gap-2 border-t border-border/50 p-2">
            <Input
              type="time"
              data-testid="quick-add-date-time"
              aria-label="Hora do prazo"
              value={dueDate ? horaLocal(dueDate) : ''}
              onChange={(e) => {
                const dia = dueDate ? diaLocal(dueDate) : diaLocal(new Date().toISOString());
                setDueDate(compor(dia, e.target.value));
              }}
              className="h-8 w-[100px] bg-input"
            />
            <button type="button" onClick={() => setDueDate(null)} className="text-sm text-muted-foreground hover:text-foreground">Limpar</button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Etapa 38 — chip Lembrar: presets + data/hora livre; passado bloqueia. */}
      <Popover open={abertoLembrar} onOpenChange={setAbertoLembrar}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid="quick-add-chip-remind"
            aria-label="Lembrar"
            className={`${remindAt ? 'chip-active' : 'chip-btn'} ${remindInPast ? 'text-destructive' : ''}`}
          >
            <Bell className="h-3 w-3" /> {remindAt ? `${format(new Date(remindAt), 'dd/MM', { locale: ptBR })} ${horaLocal(remindAt)}` : 'Lembrar'}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="start">
          <div className="flex flex-col gap-1">
            <button type="button" onClick={lembrarEm1h}         className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"><Clock className="mr-2 h-3.5 w-3.5" /> Em 1 h</button>
            <button type="button" onClick={lembrarAmanha9}      className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"><Clock className="mr-2 h-3.5 w-3.5" /> Amanhã 9h</button>
            <button type="button" onClick={lembrarProximaSeg9}  className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"><Clock className="mr-2 h-3.5 w-3.5" /> Próx. seg 9h</button>
          </div>
          <div className="mt-2 flex items-center gap-2 border-t border-border/50 pt-2">
            <Input
              type="date"
              data-testid="quick-add-remind-date"
              aria-label="Dia do alarme"
              value={remindAt ? diaLocal(remindAt) : ''}
              onChange={(e) => setRemindAt(e.target.value
                ? compor(e.target.value, remindAt ? horaLocal(remindAt) : '09:00')
                : null)}
              className="h-8 flex-1 bg-input"
            />
            <Input
              type="time"
              data-testid="quick-add-remind-time"
              aria-label="Hora do alarme"
              value={remindAt ? horaLocal(remindAt) : ''}
              onChange={(e) => {
                const dia = remindAt ? diaLocal(remindAt) : diaLocal(new Date().toISOString());
                setRemindAt(compor(dia, e.target.value));
              }}
              className="h-8 w-[100px] bg-input"
            />
          </div>
          {remindAt && (
            <button type="button" onClick={() => setRemindAt(null)} className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-sm text-destructive hover:bg-accent">Remover</button>
          )}
        </PopoverContent>
      </Popover>

      {/* Etapa 39 — chip @ Contato (oculto quando o contato é fixo do chat). */}
      {!defaultContactId && (
        <ContactCombobox
          value={escolhido}
          onChange={setEscolhido}
          placeholder="Buscar contato (min. 2 letras)"
          testId="quick-add-chip-contact"
        />
      )}

      {/* Etapa 40 — chip ! Prioridade (4 opções; padrão Média). */}
      <Popover open={abertoPrioridade} onOpenChange={setAbertoPrior}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid="quick-add-chip-priority"
            aria-label="Prioridade"
            className={priority !== 'medium' ? 'chip-active' : 'chip-btn'}
          >
            <Flag className="h-3 w-3" /> {PRIORITY_LABELS[priority]}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-40 p-1" align="start">
          {PRIORIDADES.map((p) => (
            <button
              key={p}
              type="button"
              data-testid={`quick-add-priority-${p}`}
              onClick={() => { setPriority(p); setAbertoPrior(false); }}
              className={`flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent ${p === priority ? 'text-primary' : ''}`}
            >
              {PRIORITY_LABELS[p]}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </>
  );

  return (
    <div className="flex flex-col gap-1.5" data-testid="quick-add">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className={`flex items-center gap-2 h-11 rounded-xl bg-input border px-4 flex-1 ${remindInPast ? 'border-destructive' : 'border-border'}`}>
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
            title="Atalhos: Ctrl+1 Hoje · Ctrl+2 Amanhã · Ctrl+3 Próx. semana · Ctrl+L Lembrar · Ctrl+@ Contato"
            aria-label="Adicionar tarefa"
            className="flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground outline-none"
            disabled={loading}
          />
          {title && (
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!podeCriar}
              className="shrink-0 h-7 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '…' : 'Criar'}
            </button>
          )}
        </div>

        {compact ? (
          <Popover open={abertoMais} onOpenChange={setAbertoMais}>
            <PopoverTrigger asChild>
              <button type="button" data-testid="quick-add-more" aria-label="Mais opções" className="chip-btn shrink-0 self-start md:self-auto">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-2">
              <div className="flex items-center gap-1.5 flex-wrap">{chips}</div>
            </PopoverContent>
          </Popover>
        ) : (
          <div className="flex items-center gap-1.5 flex-wrap">{chips}</div>
        )}
      </div>

      {remindInPast && (
        <p data-testid="quick-add-remind-error" className="px-1 text-xs text-destructive">
          O alarme precisa ser no futuro
        </p>
      )}
    </div>
  );
});

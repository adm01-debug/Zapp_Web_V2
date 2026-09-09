import { useId, useState, type ReactNode } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Sparkles, FileText, Lightbulb, XCircle, Handshake, Clock, BarChart3, Pencil, Trash2, type LucideIcon,
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useContactNotes, type ContactNote, type ContactNoteCategory } from '@/hooks/crm/useContactNotes';
import { useConversationTasks } from '@/hooks/chat/useConversationTasks';
import { useContactSummaryNote } from '@/hooks/crm/useContactSummaryNote';

interface NotesTabProps {
  contactId: string;
}

type NoteTone = 'primary' | 'info' | 'warning' | 'success';

const NOTE_TONE: Record<NoteTone, string> = {
  primary: 'bg-primary/15 text-primary',
  info: 'bg-info/15 text-info',
  warning: 'bg-warning/15 text-warning',
  success: 'bg-success/15 text-success',
};

function AddInline({ label, placeholder, initialValue = '', withDueDate, onSave, onCancel }: {
  label: string;
  placeholder: string;
  initialValue?: string;
  withDueDate?: boolean;
  onSave: (content: string, dueDate?: string | null) => unknown | Promise<unknown>;
  onCancel: () => void;
}) {
  const fieldId = useId();
  const dateId = useId();
  const [value, setValue] = useState(initialValue);
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!value.trim() || saving) return;
    setSaving(true);
    try {
      await onSave(value.trim(), withDueDate && dueDate ? new Date(`${dueDate}T12:00:00`).toISOString() : null);
      setValue('');
      setDueDate('');
    } catch {
      // A mutation apresenta o erro; conservar os campos permite tentar novamente.
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-2.5" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <label htmlFor={fieldId} className="sr-only">{label}</label>
      <Textarea
        id={fieldId}
        autoFocus
        value={value}
        placeholder={placeholder}
        rows={2}
        className="text-sm resize-none bg-background"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
          if ((e.key === 'Enter' && e.ctrlKey) || (e.key === 'Enter' && !e.shiftKey && !withDueDate)) { e.preventDefault(); void submit(); }
        }}
      />
      {withDueDate && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={dateId} className="text-xs text-muted-foreground">Prazo</label>
          <input id={dateId} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-9 min-w-40 rounded-md border border-border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" className="h-9 text-xs" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" size="sm" className="h-9 text-xs" disabled={!value.trim() || saving}>Salvar</Button>
      </div>
    </form>
  );
}

interface NoteCategoryCardProps {
  icon: LucideIcon;
  title: string;
  notes: ContactNote[];
  category: ContactNoteCategory;
  tone: NoteTone;
  placeholder: string;
  withDueDate?: boolean;
  currentProfileId?: string;
  onAdd: (content: string, category: ContactNoteCategory, dueDate?: string | null) => unknown | Promise<unknown>;
  onUpdate: (id: string, content: string) => unknown | Promise<unknown>;
  onDelete: (id: string) => unknown | Promise<unknown>;
  renderItem?: (note: ContactNote) => ReactNode;
}

function NoteCategoryCard({ icon: Icon, title, notes, category, tone, placeholder, withDueDate, currentProfileId, onAdd, onUpdate, onDelete, renderItem }: NoteCategoryCardProps) {
  const headingId = useId();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <section aria-labelledby={headingId} className="rounded-xl border border-border bg-card p-4 flex min-w-0 flex-col gap-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', NOTE_TONE[tone])}>
            <Icon className="w-4 h-4" aria-hidden="true" />
          </span>
          <h3 id={headingId} className="text-sm font-semibold truncate">{title}</h3>
          {notes.length > 0 && <span className="text-xs text-muted-foreground shrink-0" aria-label={`${notes.length} registros`}>({notes.length})</span>}
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="h-9 px-3 rounded-lg bg-primary/15 text-primary text-xs font-semibold hover:bg-primary/25 shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            + Adicionar
          </button>
        )}
      </header>

      {adding && (
        <AddInline
          label={`Adicionar em ${title}`}
          placeholder={placeholder}
          withDueDate={withDueDate}
          onCancel={() => setAdding(false)}
          onSave={async (content, dueDate) => { await onAdd(content, category, dueDate); setAdding(false); }}
        />
      )}

      <ul className="space-y-2 max-h-[240px] overflow-y-auto scrollbar-thin">
        {notes.length === 0 && !adding && <li className="text-sm text-muted-foreground py-2">Nenhum registro ainda</li>}
        {notes.map((note) => (
          <li key={note.id} data-testid="note-card" className="group rounded-lg border border-border bg-muted/20 p-2.5">
            {editingId === note.id ? (
              <AddInline
                label={`Editar ${title}`}
                placeholder={placeholder}
                initialValue={note.content}
                onCancel={() => setEditingId(null)}
                onSave={async (content) => { await onUpdate(note.id, content); setEditingId(null); }}
              />
            ) : (
              <>
                {renderItem ? renderItem(note) : <p className="text-sm text-foreground break-words">{note.content}</p>}
                <div className="flex flex-wrap items-center justify-between gap-2 mt-1.5">
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(note.created_at), "dd MMM yyyy · HH:mm", { locale: ptBR })} · Por: {note.author?.name ?? 'Você'}
                  </p>
                  {note.author_id === currentProfileId && (
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => setEditingId(note.id)} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground opacity-70 outline-none hover:bg-muted hover:text-foreground hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Editar registro: ${note.content}`}>
                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button type="button" onClick={() => onDelete(note.id)} className="flex h-8 w-8 items-center justify-center rounded-md text-destructive opacity-70 outline-none hover:bg-destructive/10 hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Excluir registro: ${note.content}`}>
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ObjectionItem({ note }: { note: ContactNote }) {
  const match = note.content.match(/^\[(.+?)\]\s*(.*)$/);
  const tag = match?.[1];
  const text = match ? match[2] : note.content;
  return (
    <>
      <div className="flex items-center gap-2">
        {tag && <span className="h-5 px-2 rounded-full bg-warning/15 text-warning border border-warning/30 text-[11px] font-semibold shrink-0">{tag}</span>}
        <p className="text-sm text-foreground italic break-words">&ldquo;{text}&rdquo;</p>
      </div>
    </>
  );
}

function PromiseItem({ note, onToggle }: { note: ContactNote; onToggle: (note: ContactNote) => unknown | Promise<unknown> }) {
  return (
    <div className="flex items-start gap-2">
      <input type="checkbox" checked={note.is_done} onChange={() => onToggle(note)} className="mt-0.5 h-6 w-6 shrink-0 accent-primary" aria-label={`${note.is_done ? 'Reabrir' : 'Concluir'} promessa: ${note.content}`} />
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm text-foreground break-words', note.is_done && 'line-through text-muted-foreground')}>{note.content}</p>
        <div className="flex items-center mt-1">
          {note.due_date ? (
            <p className="text-xs text-muted-foreground">{format(new Date(note.due_date), 'dd/MM/yyyy', { locale: ptBR })}</p>
          ) : <span />}
        </div>
      </div>
    </div>
  );
}

function isTaskDueSoon(dueDate: string) {
  const d = new Date(dueDate);
  const now = new Date();
  return d.getTime() < now.getTime() || (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate());
}

/** Aba Notas (2.8) — 6 cards de CRUD por categoria + pendências (tarefas) + resumo comercial (contacts.notes). */
export function NotesTab({ contactId }: NotesTabProps) {
  const { allNotes, addNote, updateNote, deleteNote, toggleNoteDone, currentProfileId, isLoading, error, refetch } = useContactNotes(contactId);
  const { open: openTasks, createTask, isLoading: tasksLoading } = useConversationTasks(contactId);
  const summaryNote = useContactSummaryNote(contactId);
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState('');
  const [addingTask, setAddingTask] = useState(false);

  const byCategory = (category: ContactNoteCategory) => allNotes.filter((n) => n.category === category);

  return (
    <div className="flex flex-col gap-4" data-testid="notes-tab">
      <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 flex items-center gap-3">
        <span className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Suas notas, mais resultados</p>
          <p className="text-[13px] text-muted-foreground">Registre informações, compromissos e aprendizados para um atendimento cada vez melhor.</p>
        </div>
      </div>

      {isLoading || tasksLoading ? (
        <div role="status" aria-live="polite" className="grid min-h-40 place-items-center rounded-xl border border-border bg-card/40">
          <span className="text-sm text-muted-foreground">Carregando notas…</span>
        </div>
      ) : error ? (
        <div role="alert" className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-center">
          <p className="text-sm text-foreground">Não foi possível carregar as notas.</p>
          <Button type="button" size="sm" variant="outline" onClick={() => void refetch()}>Tentar novamente</Button>
        </div>
      ) : (
      <div data-testid="notes-grid" className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr))]">
        <NoteCategoryCard
          icon={FileText} title="Notas privadas" category="note" tone="primary" placeholder="Escreva uma nota privada..."
          notes={byCategory('note')} currentProfileId={currentProfileId}
          onAdd={(content, category) => addNote(content, category)} onUpdate={(id, content) => updateNote(id, { content })} onDelete={deleteNote}
        />

        <NoteCategoryCard
          icon={Lightbulb} title="Fatos relevantes" category="fact" tone="info" placeholder="Ex.: Cliente prefere contato por WhatsApp após 18h"
          notes={byCategory('fact')} currentProfileId={currentProfileId}
          onAdd={(content, category) => addNote(content, category)} onUpdate={(id, content) => updateNote(id, { content })} onDelete={deleteNote}
        />

        <NoteCategoryCard
          icon={XCircle} title="Objeções" category="objection" tone="warning" placeholder="Ex.: [Preço] Acha o valor alto"
          notes={byCategory('objection')} currentProfileId={currentProfileId}
          onAdd={(content, category) => addNote(content, category)} onUpdate={(id, content) => updateNote(id, { content })} onDelete={deleteNote}
          renderItem={(note) => <ObjectionItem note={note} />}
        />

        <NoteCategoryCard
          icon={Handshake} title="Promessas feitas" category="promise" tone="success" placeholder="Ex.: Enviar catálogo atualizado" withDueDate
          notes={byCategory('promise')} currentProfileId={currentProfileId}
          onAdd={(content, category, dueDate) => addNote(content, category, dueDate)} onUpdate={(id, content) => updateNote(id, { content })} onDelete={deleteNote}
          renderItem={(note) => <PromiseItem note={note} onToggle={toggleNoteDone} />}
        />

        <section aria-labelledby="notes-pending-heading" className="rounded-xl border border-border bg-card p-4 flex min-w-0 flex-col gap-3">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-7 h-7 rounded-lg bg-warning/15 text-warning flex items-center justify-center shrink-0"><Clock className="w-4 h-4" aria-hidden="true" /></span>
              <h3 id="notes-pending-heading" className="text-sm font-semibold truncate">Pendências</h3>
              {openTasks.length > 0 && <span className="text-xs text-muted-foreground shrink-0" aria-label={`${openTasks.length} pendências`}>({openTasks.length})</span>}
            </div>
            {!addingTask && (
              <button type="button" onClick={() => setAddingTask(true)} className="h-9 px-3 rounded-lg bg-primary/15 text-primary text-xs font-semibold hover:bg-primary/25 shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring">+ Adicionar</button>
            )}
          </header>
          {addingTask && (
            <AddInline label="Nova pendência" placeholder="Nova pendência..." onCancel={() => setAddingTask(false)} onSave={async (content) => { await createTask({ title: content }); setAddingTask(false); }} />
          )}
          <ul className="space-y-2 max-h-[240px] overflow-y-auto scrollbar-thin">
            {openTasks.length === 0 && !addingTask && <li className="text-sm text-muted-foreground py-2">Nenhuma pendência</li>}
            {openTasks.map((task) => (
              <li key={task.id} data-testid="note-card" className="rounded-lg border border-border bg-muted/20 p-2.5 flex items-center justify-between gap-2">
                <p className="text-sm text-foreground break-words">{task.title}</p>
                {task.due_date && (
                  <span className={cn('text-xs shrink-0', isTaskDueSoon(task.due_date) ? 'text-destructive' : 'text-muted-foreground')}>
                    {format(new Date(task.due_date), 'dd/MM/yyyy', { locale: ptBR })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="notes-summary-heading" className="rounded-xl border border-border bg-card p-4 flex min-w-0 flex-col gap-3">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-7 h-7 rounded-lg bg-info/15 text-info flex items-center justify-center shrink-0"><BarChart3 className="w-4 h-4" aria-hidden="true" /></span>
              <h3 id="notes-summary-heading" className="text-sm font-semibold truncate">Resumo comercial</h3>
            </div>
            {!editingSummary && (
              <button type="button" onClick={() => { setSummaryDraft(summaryNote.summary); setEditingSummary(true); }} className="h-9 rounded-md px-2 text-xs font-medium text-primary hover:underline shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring">Editar</button>
            )}
          </header>
          {summaryNote.isLoading ? (
            <p role="status" className="text-sm text-muted-foreground">Carregando resumo…</p>
          ) : editingSummary ? (
            <div className="flex flex-col gap-2">
              <label htmlFor="contact-commercial-summary" className="sr-only">Resumo comercial</label>
              <Textarea id="contact-commercial-summary" value={summaryDraft} onChange={(e) => setSummaryDraft(e.target.value)} rows={4} className="text-sm resize-none" autoFocus />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditingSummary(false)}>Cancelar</Button>
                <Button size="sm" className="h-9 text-xs" disabled={summaryNote.isSaving} onClick={async () => { try { await summaryNote.save(summaryDraft); setEditingSummary(false); } catch { /* O hook consumidor mantém o rascunho para nova tentativa. */ } }}>Salvar</Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{summaryNote.summary || 'Nenhum resumo comercial registrado.'}</p>
          )}
        </section>
      </div>
      )}

      <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 flex items-center gap-3">
        <span className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center shrink-0"><Sparkles className="w-4 h-4" aria-hidden="true" /></span>
        <p className="text-[13px] text-muted-foreground">Transforme conversas em resultados — Mantenha suas notas sempre atualizadas e tenha todo o contexto na hora de falar com o cliente.</p>
      </div>
    </div>
  );
}

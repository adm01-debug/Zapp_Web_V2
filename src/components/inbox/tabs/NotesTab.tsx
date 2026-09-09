import { useState, type ReactNode } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Sparkles, FileText, Lightbulb, XCircle, Handshake, Clock, BarChart3, Trash2, type LucideIcon,
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useContactNotes, type ContactNote, type ContactNoteCategory } from '@/hooks/crm/useContactNotes';
import { useConversationTasks } from '@/hooks/chat/useConversationTasks';
import { useContactSummaryNote } from '@/hooks/crm/useContactSummaryNote';
import { SectionCard } from './SectionCard';
import type { KpiTone } from './KpiStrip';

interface NotesTabProps {
  contactId: string;
}

function AddInline({ placeholder, withDueDate, onSave, onCancel }: {
  placeholder: string;
  withDueDate?: boolean;
  onSave: (content: string, dueDate?: string | null) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');
  const [dueDate, setDueDate] = useState('');

  const submit = () => {
    if (!value.trim()) return;
    onSave(value.trim(), withDueDate && dueDate ? new Date(dueDate).toISOString() : null);
    setValue('');
    setDueDate('');
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-2.5">
      <Textarea
        autoFocus
        value={value}
        placeholder={placeholder}
        rows={2}
        className="text-sm resize-none bg-background"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
          if ((e.key === 'Enter' && e.ctrlKey) || (e.key === 'Enter' && !e.shiftKey && !withDueDate)) { e.preventDefault(); submit(); }
        }}
      />
      {withDueDate && (
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-8 w-40 rounded-md border border-border bg-background px-2 text-xs" />
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>Cancelar</Button>
        <Button size="sm" className="h-7 text-xs" disabled={!value.trim()} onClick={submit}>Salvar</Button>
      </div>
    </div>
  );
}

interface NoteCategoryCardProps {
  icon: LucideIcon;
  title: string;
  tone: KpiTone;
  notes: ContactNote[];
  category: ContactNoteCategory;
  placeholder: string;
  withDueDate?: boolean;
  currentProfileId?: string;
  onAdd: (content: string, category: ContactNoteCategory, dueDate?: string | null) => void;
  onDelete: (id: string) => void;
  renderItem?: (note: ContactNote) => ReactNode;
}

function NoteCategoryCard({ icon, title, tone, notes, category, placeholder, withDueDate, currentProfileId, onAdd, onDelete, renderItem }: NoteCategoryCardProps) {
  const [adding, setAdding] = useState(false);

  return (
    <SectionCard
      icon={icon} title={title} tone={tone} count={notes.length}
      action={!adding ? { label: '+ Adicionar', onClick: () => setAdding(true), variant: 'pill' } : undefined}
    >
      {adding && (
        <AddInline
          placeholder={placeholder}
          withDueDate={withDueDate}
          onCancel={() => setAdding(false)}
          onSave={(content, dueDate) => { onAdd(content, category, dueDate); setAdding(false); }}
        />
      )}

      <ul className="space-y-2 max-h-[240px] overflow-y-auto scrollbar-thin">
        {notes.length === 0 && !adding && <p className="text-sm text-muted-foreground py-2">Nenhum registro ainda</p>}
        {notes.map((note) => (
          <li key={note.id} data-testid="note-card" className="group rounded-lg border border-border bg-muted/20 p-2.5">
            {renderItem ? renderItem(note) : (
              <>
                <p className="text-sm text-foreground">{note.content}</p>
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(note.created_at), "dd MMM yyyy · HH:mm", { locale: ptBR })} · Por: {note.author?.name ?? 'Você'}
                  </p>
                  {note.author_id === currentProfileId && (
                    <button type="button" onClick={() => onDelete(note.id)} className="opacity-0 group-hover:opacity-100 text-destructive shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function ObjectionItem({ note, onDelete, canDelete }: { note: ContactNote; onDelete: (id: string) => void; canDelete: boolean }) {
  const match = note.content.match(/^\[(.+?)\]\s*(.*)$/);
  const tag = match?.[1];
  const text = match ? match[2] : note.content;
  return (
    <>
      <div className="flex items-center gap-2">
        {tag && <span className="h-5 px-2 rounded-full bg-warning/15 text-warning border border-warning/30 text-[11px] font-semibold shrink-0">{tag}</span>}
        <p className="text-sm text-foreground italic">&ldquo;{text}&rdquo;</p>
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <p className="text-xs text-muted-foreground">{format(new Date(note.created_at), "dd MMM yyyy · HH:mm", { locale: ptBR })}</p>
        {canDelete && (
          <button type="button" onClick={() => onDelete(note.id)} className="opacity-0 group-hover:opacity-100 text-destructive shrink-0">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </>
  );
}

function PromiseItem({ note, onToggle, onDelete, canDelete }: { note: ContactNote; onToggle: (note: ContactNote) => void; onDelete: (id: string) => void; canDelete: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <input type="checkbox" checked={note.is_done} onChange={() => onToggle(note)} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm text-foreground', note.is_done && 'line-through text-muted-foreground')}>{note.content}</p>
        <div className="flex items-center justify-between mt-1">
          {note.due_date ? (
            <p className="text-xs text-muted-foreground">{format(new Date(note.due_date), 'dd/MM/yyyy', { locale: ptBR })}</p>
          ) : <span />}
          {canDelete && (
            <button type="button" onClick={() => onDelete(note.id)} className="opacity-0 group-hover:opacity-100 text-destructive shrink-0">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
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
  const { allNotes, addNote, deleteNote, toggleNoteDone, currentProfileId } = useContactNotes(contactId);
  const { open: openTasks, createTask } = useConversationTasks(contactId);
  const summaryNote = useContactSummaryNote(contactId);
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState('');
  const [addingTask, setAddingTask] = useState(false);

  const byCategory = (category: ContactNoteCategory) => allNotes.filter((n) => n.category === category);

  return (
    <div className="flex flex-col gap-4" data-testid="notes-tab">
      <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 flex items-center gap-3">
        <span className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Suas notas, mais resultados</p>
          <p className="text-[13px] text-muted-foreground">Registre informações, compromissos e aprendizados para um atendimento cada vez melhor.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <NoteCategoryCard
          icon={FileText} title="Notas privadas" tone="blue" category="note" placeholder="Escreva uma nota privada..."
          notes={byCategory('note')} currentProfileId={currentProfileId}
          onAdd={(content, category) => addNote(content, category)} onDelete={deleteNote}
        />

        <NoteCategoryCard
          icon={Lightbulb} title="Fatos relevantes" tone="yellow" category="fact" placeholder="Ex.: Cliente prefere contato por WhatsApp após 18h"
          notes={byCategory('fact')} currentProfileId={currentProfileId}
          onAdd={(content, category) => addNote(content, category)} onDelete={deleteNote}
        />

        <NoteCategoryCard
          icon={XCircle} title="Objeções" tone="red" category="objection" placeholder="Ex.: [Preço] Acha o valor alto"
          notes={byCategory('objection')} currentProfileId={currentProfileId}
          onAdd={(content, category) => addNote(content, category)} onDelete={deleteNote}
          renderItem={(note) => <ObjectionItem note={note} onDelete={deleteNote} canDelete={note.author_id === currentProfileId} />}
        />

        <NoteCategoryCard
          icon={Handshake} title="Promessas feitas" tone="green" category="promise" placeholder="Ex.: Enviar catálogo atualizado" withDueDate
          notes={byCategory('promise')} currentProfileId={currentProfileId}
          onAdd={(content, category, dueDate) => addNote(content, category, dueDate)} onDelete={deleteNote}
          renderItem={(note) => <PromiseItem note={note} onToggle={toggleNoteDone} onDelete={deleteNote} canDelete={note.author_id === currentProfileId} />}
        />

        <SectionCard
          icon={Clock} title="Pendências" tone="blue" count={openTasks.length}
          action={!addingTask ? { label: '+ Adicionar', onClick: () => setAddingTask(true), variant: 'pill' } : undefined}
        >
          {addingTask && (
            <AddInline placeholder="Nova pendência..." onCancel={() => setAddingTask(false)} onSave={(content) => { createTask({ title: content }); setAddingTask(false); }} />
          )}
          <ul className="space-y-2 max-h-[240px] overflow-y-auto scrollbar-thin">
            {openTasks.length === 0 && !addingTask && <p className="text-sm text-muted-foreground py-2">Nenhuma pendência</p>}
            {openTasks.map((task) => (
              <li key={task.id} data-testid="note-card" className="rounded-lg border border-border bg-muted/20 p-2.5 flex items-center justify-between gap-2">
                <p className="text-sm text-foreground truncate">{task.title}</p>
                {task.due_date && (
                  <span className={cn('text-xs shrink-0', isTaskDueSoon(task.due_date) ? 'text-destructive' : 'text-muted-foreground')}>
                    {format(new Date(task.due_date), 'dd/MM/yyyy', { locale: ptBR })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard
          icon={BarChart3} title="Resumo comercial" tone="blue"
          action={!editingSummary ? { label: 'Editar', onClick: () => { setSummaryDraft(summaryNote.summary); setEditingSummary(true); } } : undefined}
        >
          {editingSummary ? (
            <div className="flex flex-col gap-2">
              <Textarea value={summaryDraft} onChange={(e) => setSummaryDraft(e.target.value)} rows={4} className="text-sm resize-none" autoFocus />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditingSummary(false)}>Cancelar</Button>
                <Button size="sm" className="h-7 text-xs" disabled={summaryNote.isSaving} onClick={async () => { await summaryNote.save(summaryDraft); setEditingSummary(false); }}>Salvar</Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{summaryNote.summary || 'Nenhum resumo comercial registrado.'}</p>
          )}
        </SectionCard>
      </div>

      <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 flex items-center gap-3">
        <span className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center shrink-0"><Sparkles className="w-4 h-4" /></span>
        <p className="text-[13px] text-muted-foreground">Transforme conversas em resultados — Mantenha suas notas sempre atualizadas e tenha todo o contexto na hora de falar com o cliente.</p>
      </div>
    </div>
  );
}

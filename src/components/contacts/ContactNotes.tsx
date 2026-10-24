import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  StickyNote, Plus, Send, Trash2, Loader2, Pencil, Pin, PinOff, Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getAvatarColor, getInitials } from '@/lib/avatar-colors';
import { useAuth } from '@/hooks/auth/useAuth';
import { useContactNotes, contactNotesKey, type ContactNote } from '@/hooks/crm/useContactNotes';

interface Note {
  id: string;
  content: string;
  created_at: string;
  author_id: string;
  author_name?: string;
  /**
   * Nota fixada (aparece no topo da lista). Opcional de propósito: notas antigas
   * lidas antes da coluna existir chegam sem a marca e contam como NÃO fixadas.
   * `is_pinned === true` é a única leitura que fixa — `undefined` não fixa.
   */
  is_pinned?: boolean;
}

interface ContactNotesProps {
  contactId: string;
  className?: string;
}

export function ContactNotes({ contactId, className }: ContactNotesProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { notes: rawNotes, isLoading, refetch, currentProfileId, editNote, togglePin } = useContactNotes(contactId);
  const [newNote, setNewNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [pinBusyId, setPinBusyId] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const editAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const editBtnRefs = useRef(new Map<string, HTMLButtonElement>());
  /** Id da nota cujo botão "Editar nota" recebe o foco ao remontar: o editor
   * desmonta ao salvar/cancelar/descartar e, sem isso, o foco caía no body. */
  const pendingEditFocusRef = useRef<string | null>(null);
  /** A confirmação de descarte acabou de abrir: o botão "Continuar editando"
   * assume o foco ao montar. */
  const confirmAbertaRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Mesma fonte de dados da aba Notas (`useContactNotes` → `contactNotesKey`): a nota
  // criada no popover de colaboração invalida essa chave e aparece aqui sem recarregar.
  const notes: Note[] = useMemo(
    () => rawNotes.map((n) => ({
      id: n.id,
      content: n.content,
      created_at: n.created_at,
      author_id: n.author_id,
      author_name: n.author?.name || 'Agente',
      is_pinned: n.is_pinned === true,
    })),
    [rawNotes],
  );

  const handleAdd = async () => {
    if (!newNote.trim()) return;
    setAdding(true);
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id || '')
        .single();

      if (!profile) throw new Error('Perfil não encontrado');

      const { error } = await supabase
        .from('contact_notes')
        .insert({
          contact_id: contactId,
          author_id: profile.id,
          content: newNote.trim(),
        });

      if (error) throw error;
      if (isMountedRef.current) {
        setNewNote('');
        setShowInput(false);
      }
      toast.success('Nota adicionada');
      void queryClient.invalidateQueries({ queryKey: contactNotesKey(contactId, user?.id) });
    } catch {
      toast.error('Erro ao adicionar nota');
    } finally {
      if (isMountedRef.current) setAdding(false);
    }
  };

  const handleDelete = async (noteId: string) => {
    // A policy `contact_notes_delete_policy` (migration
    // 20260909200000_harden_inbox_contact_authorization.sql) só apaga a nota cujo
    // author_id é o perfil do usuário logado. Para nota de colega o RLS filtra a
    // linha: o DELETE volta SEM erro e SEM representação — por isso o pedido de
    // volta (`select('id')`) e a confirmação antes de mexer na tela.
    const { data, error } = await supabase
      .from('contact_notes')
      .delete()
      .eq('id', noteId)
      .select('id');

    if (error) {
      toast.error('Erro ao excluir nota');
      return;
    }

    if (!isMountedRef.current) return;

    if (!data || data.length === 0) {
      // Zero linhas = nada foi apagado (nota de outro autor ou já removida):
      // recusa explícita, sem tirar da lista o que o banco preservou.
      toast.error('Não foi possível excluir a nota', {
        description: 'A nota é de outro autor ou já não existe. A lista foi atualizada.',
      });
      void refetch();
      return;
    }

    queryClient.setQueryData<ContactNote[]>(
      contactNotesKey(contactId, user?.id),
      (prev) => (prev ?? []).filter((n) => n.id !== noteId),
    );
    toast.success('Nota excluída');
  };

  const iniciarEdicao = (note: Note) => {
    setEditingId(note.id);
    setEditDraft(note.content);
    setConfirmDiscard(false);
  };

  /** Ref do botão "Editar nota" de cada cartão: guarda no mapa e, quando o
   * editor acabou de fechar para esta nota, devolve o foco a ele. */
  const refBotaoEditar = (noteId: string) => (el: HTMLButtonElement | null) => {
    if (el) {
      editBtnRefs.current.set(noteId, el);
      if (pendingEditFocusRef.current === noteId) {
        pendingEditFocusRef.current = null;
        el.focus();
      }
    } else {
      editBtnRefs.current.delete(noteId);
    }
  };

  /** Fecha o editor devolvendo o foco ao "Editar nota" da mesma nota. */
  const fecharEdicaoComFoco = (noteId: string) => {
    pendingEditFocusRef.current = noteId;
    setConfirmDiscard(false);
    setEditingId(null);
  };

  /** Só pede confirmação quando há alteração não salva de verdade. */
  const pedirDescartar = (note: Note) => {
    if (editDraft.trim() !== note.content.trim()) {
      confirmAbertaRef.current = true;
      setConfirmDiscard(true);
      return;
    }
    fecharEdicaoComFoco(note.id);
  };

  /** Ref do "Continuar editando": ao abrir a confirmação ele assume o foco. */
  const refContinuarEditando = (el: HTMLButtonElement | null) => {
    if (el && confirmAbertaRef.current) {
      confirmAbertaRef.current = false;
      el.focus();
    }
  };

  /** "Continuar editando": fecha a confirmação e volta o foco à textarea. */
  const continuarEditando = () => {
    setConfirmDiscard(false);
    editAreaRef.current?.focus();
  };

  const salvarEdicao = async (note: Note) => {
    const content = editDraft.trim();
    if (!content || savingEdit) return;
    setSavingEdit(true);
    try {
      await editNote(note.id, content);
      if (!isMountedRef.current) return;
      fecharEdicaoComFoco(note.id);
      toast.success('Nota atualizada');
    } catch {
      // O toast de erro vem do hook (`useContactNotes` → "Erro ao atualizar nota"); aqui só
      // mantém o editor aberto com o rascunho para o autor tentar de novo e recarrega a lista.
      if (!isMountedRef.current) return;
      void refetch();
    } finally {
      if (isMountedRef.current) setSavingEdit(false);
    }
  };

  const alternarFixar = async (note: Note) => {
    if (pinBusyId) return;
    const fixar = !(note.is_pinned === true);
    setPinBusyId(note.id);
    try {
      await togglePin(note.id);
      if (!isMountedRef.current) return;
      toast.success(fixar ? 'Nota fixada' : 'Nota desafixada');
    } catch {
      // Toast de erro do hook; recarrega para a tela voltar ao que o banco tem.
      if (!isMountedRef.current) return;
      void refetch();
    } finally {
      if (isMountedRef.current) setPinBusyId(null);
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <StickyNote className="w-3 h-3" />
          Notas
        </h3>
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary" className="text-3xs">{notes.length}</Badge>
          <Button
            variant="ghost" size="icon"
            className="w-6 h-6"
            aria-label={showInput ? 'Fechar nova nota' : 'Nova nota'}
            title={showInput ? 'Fechar nova nota' : 'Nova nota'}
            onClick={() => setShowInput(!showInput)}
          >
            <Plus className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Add note input */}
      <AnimatePresence>
        {showInput && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-2">
              <Textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Escreva uma nota..."
                aria-label="Nova nota"
                className="text-xs min-h-[60px] resize-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void handleAdd();
                }}
              />
              <div className="flex justify-end gap-1.5">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setShowInput(false); setNewNote(''); }}>
                  Cancelar
                </Button>
                <Button size="sm" className="h-7 text-xs gap-1" onClick={handleAdd} disabled={adding || !newNote.trim()}>
                  {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                  Salvar
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notes list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map(i => (
            <div key={i} className="p-3 rounded-lg bg-muted/20 animate-pulse space-y-2">
              <div className="h-3 w-20 bg-muted rounded" />
              <div className="h-2.5 w-full bg-muted/60 rounded" />
            </div>
          ))}
        </div>
      ) : notes.length === 0 ? (
        <p className="text-xs text-muted-foreground/50 text-center py-3">
          Nenhuma nota ainda
        </p>
      ) : (
        <div className="space-y-2">
          {notes.map((note, i) => {
            const colors = getAvatarColor(note.author_name || '');
            const minha = note.author_id === currentProfileId;
            const editando = editingId === note.id;
            const fixada = note.is_pinned === true;
            return (
              <motion.div
                key={note.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                data-pinned={fixada ? 'true' : undefined}
                className={cn(
                  'p-3 rounded-lg border group relative',
                  fixada ? 'bg-primary/5 border-primary/30' : 'bg-muted/20 border-border/20',
                )}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Avatar className="w-5 h-5">
                    <AvatarFallback className={cn(colors.bg, colors.text, 'text-3xs font-bold')}>
                      {getInitials(note.author_name || '')}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs font-medium text-foreground">{note.author_name}</span>
                  {fixada && (
                    <span className="inline-flex items-center gap-0.5 text-2xs font-medium text-primary" title="Nota fixada">
                      <Pin className="w-2.5 h-2.5" aria-hidden="true" />
                      Fixada
                    </span>
                  )}
                  <span className="text-caption ml-auto">
                    {formatDistanceToNow(new Date(note.created_at), { addSuffix: true, locale: ptBR })}
                  </span>
                </div>

                {editando ? (
                  <div className="space-y-1.5">
                    <Textarea
                      autoFocus
                      ref={editAreaRef}
                      value={editDraft}
                      aria-label="Editar nota"
                      className="text-xs min-h-[60px] resize-none"
                      onChange={(e) => setEditDraft(e.target.value)}
                      onKeyDown={(e) => {
                        // `tecla` (e não `key`): é a tecla do teclado, não credencial — o nome
                        // `key` dispara o falso positivo de `local/no-secret-compare`.
                        const tecla = e.key;
                        if (tecla === 'Escape') { e.preventDefault(); pedirDescartar(note); }
                        if (tecla === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void salvarEdicao(note); }
                      }}
                    />
                    {confirmDiscard ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5">
                        <span className="text-2xs text-foreground">Descartar as alterações não salvas?</span>
                        <div className="flex gap-1.5">
                          <Button ref={refContinuarEditando} variant="ghost" size="sm" className="h-6 text-2xs" onClick={continuarEditando}>
                            Continuar editando
                          </Button>
                          <Button variant="destructive" size="sm" className="h-6 text-2xs" onClick={() => fecharEdicaoComFoco(note.id)}>
                            Descartar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1.5">
                        <Button variant="ghost" size="sm" className="h-6 text-2xs" onClick={() => pedirDescartar(note)}>
                          Cancelar
                        </Button>
                        <Button
                          size="sm"
                          className="h-6 text-2xs gap-1"
                          disabled={savingEdit || !editDraft.trim()}
                          onClick={() => void salvarEdicao(note)}
                        >
                          {savingEdit ? <Loader2 className="w-3 h-3 motion-safe:animate-spin" /> : <Check className="w-3 h-3" />}
                          Salvar
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">{note.content}</p>
                )}

                {/* Editar/fixar/excluir só na própria nota: a policy de UPDATE/DELETE
                    só alcança a nota do autor, e o dado real (author_id) é a mesma
                    regra da tela. Sem perfil carregado, nenhuma ação é oferecida. */}
                {minha && !editando && (
                  <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <Button
                      variant="ghost" size="icon"
                      aria-label="Editar nota"
                      title="Editar nota"
                      className="w-6 h-6"
                      ref={refBotaoEditar(note.id)}
                      onClick={() => iniciarEdicao(note)}
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      aria-label={fixada ? 'Desafixar nota' : 'Fixar nota'}
                      aria-pressed={fixada}
                      title={fixada ? 'Desafixar nota' : 'Fixar nota'}
                      className={cn('w-6 h-6', fixada && 'text-primary')}
                      disabled={pinBusyId === note.id}
                      onClick={() => void alternarFixar(note)}
                    >
                      {pinBusyId === note.id
                        ? <Loader2 className="w-3 h-3 motion-safe:animate-spin" />
                        : fixada ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      aria-label="Excluir nota"
                      title="Excluir nota"
                      className="w-6 h-6 text-destructive/60 hover:text-destructive"
                      onClick={() => handleDelete(note.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

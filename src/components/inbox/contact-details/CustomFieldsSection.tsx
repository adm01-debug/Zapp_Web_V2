import { useState } from 'react';
import { Check, ListChecks, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useContactCustomFields, type CustomField } from '@/hooks/crm/useContactCustomFields';

/**
 * Erro de permissão da RLS do Supabase (PostgREST usa o código `42501`).
 * A tela não replica a regra de permissão: ela apenas espelha o que o servidor
 * respondeu, para não virar uma segunda cópia (que sai de sincronia com a RLS).
 */
function isPermissionError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const { code, message } = err as { code?: string; message?: string };
  if (code === '42501') return true;
  return /row-level security|permission denied/i.test(message ?? '');
}

interface CustomFieldsSectionProps {
  contactId: string;
}

function CustomFieldsBody({ contactId }: CustomFieldsSectionProps) {
  const { fields, isLoading, addField, updateField, removeField } = useContactCustomFields(contactId);

  // Vira `true` quando o servidor recusa uma escrita por permissão (RLS). Nesse
  // caso a seção passa a mostrar só leitura, sem oferecer ação que o banco negaria.
  const [readOnly, setReadOnly] = useState(false);

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');
  const [savingAdd, setSavingAdd] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<CustomField | null>(null);
  const [deleting, setDeleting] = useState(false);

  const startEdit = (field: CustomField) => {
    setEditingId(field.id);
    setEditValue(field.field_value ?? '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const handleAdd = async () => {
    const name = newName.trim();
    const value = newValue.trim();
    if (!name || !value || savingAdd) return;
    setSavingAdd(true);
    try {
      await addField(name, value);
      toast.success('Campo personalizado adicionado');
      setNewName('');
      setNewValue('');
      setAdding(false);
    } catch (err) {
      if (isPermissionError(err)) setReadOnly(true);
      toast.error('Não foi possível salvar o campo');
    } finally {
      setSavingAdd(false);
    }
  };

  const handleEditSave = async (field: CustomField) => {
    const value = editValue.trim();
    if (!value || savingEdit) return;
    setSavingEdit(true);
    try {
      await updateField(field.id, value);
      toast.success('Campo atualizado');
      cancelEdit();
    } catch (err) {
      if (isPermissionError(err)) setReadOnly(true);
      toast.error('Não foi possível atualizar o campo');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      await removeField(pendingDelete.id);
      toast.success('Campo removido');
      setPendingDelete(null);
    } catch (err) {
      if (isPermissionError(err)) setReadOnly(true);
      toast.error('Não foi possível remover o campo');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-2" data-testid="custom-fields-body">
      {readOnly && (
        <p data-testid="custom-fields-readonly" className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Somente leitura — você não tem permissão para editar os campos deste contato.
        </p>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-4 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-label="Carregando campos" />
        </div>
      ) : fields.length === 0 ? (
        <p className="px-1 py-2 text-xs text-muted-foreground">
          Nenhum campo personalizado neste contato.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {fields.map((field) => (
            <li
              key={field.id}
              className="group flex items-center justify-between gap-2 rounded-lg bg-background/40 p-2.5 transition-colors hover:bg-muted/30"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-3xs font-medium uppercase tracking-wider text-muted-foreground">
                  {field.field_name}
                </p>
                {editingId === field.id ? (
                  <div className="mt-1 flex items-center gap-1.5">
                    <Input
                      inputSize="sm"
                      value={editValue}
                      autoFocus
                      disabled={savingEdit}
                      aria-label={`Editar valor de ${field.field_name}`}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void handleEditSave(field);
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          cancelEdit();
                        }
                      }}
                      className="h-7 flex-1 text-sm"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Salvar ${field.field_name}`}
                      disabled={savingEdit || !editValue.trim()}
                      onClick={() => void handleEditSave(field)}
                      className="h-6 w-6 text-success"
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Cancelar edição de ${field.field_name}`}
                      disabled={savingEdit}
                      onClick={cancelEdit}
                      className="h-6 w-6 text-muted-foreground"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <p className="truncate text-sm text-foreground">{field.field_value}</p>
                )}
              </div>

              {!readOnly && editingId !== field.id && (
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Editar ${field.field_name}`}
                    onClick={() => startEdit(field)}
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover ${field.field_name}`}
                    onClick={() => setPendingDelete(field)}
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && !adding && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setAdding(true)}
          className="w-full justify-start gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar campo
        </Button>
      )}

      {!readOnly && adding && (
        <div className="space-y-2 rounded-lg border border-border bg-background/40 p-2.5">
          <Input
            inputSize="sm"
            value={newName}
            autoFocus
            disabled={savingAdd}
            aria-label="Nome do campo"
            placeholder="Nome (ex.: CPF)"
            onChange={(e) => setNewName(e.target.value)}
            className="text-sm"
          />
          <Input
            inputSize="sm"
            value={newValue}
            disabled={savingAdd}
            aria-label="Valor do campo"
            placeholder="Valor"
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleAdd();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setAdding(false);
                setNewName('');
                setNewValue('');
              }
            }}
            className="text-sm"
          />
          <div className="flex justify-end gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={savingAdd}
              onClick={() => {
                setAdding(false);
                setNewName('');
                setNewValue('');
              }}
              className="h-7 text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={savingAdd || !newName.trim() || !newValue.trim()}
              onClick={() => void handleAdd()}
              className="h-7 text-xs"
            >
              {savingAdd ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Salvar'}
            </Button>
          </div>
        </div>
      )}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover campo personalizado?</AlertDialogTitle>
            <AlertDialogDescription>
              O campo “{pendingDelete?.field_name}” e seu valor serão apagados deste contato.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                // Segura o diálogo aberto até o servidor responder; some só no sucesso.
                e.preventDefault();
                void handleDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Remover'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * Seção “Campos personalizados” do painel do contato. O corpo só monta quando a
 * seção está aberta (Radix desmonta o `AccordionContent` fechado), então o contato
 * não ganha uma consulta extra a cada conversa aberta.
 */
export function CustomFieldsSection({ contactId }: CustomFieldsSectionProps) {
  return (
    <AccordionItem
      value="customFields"
      data-testid="sidebar-section-customFields"
      className="mx-4 mb-3 rounded-xl border border-border bg-muted/20 overflow-hidden"
    >
      <AccordionTrigger className="px-3 py-3 hover:no-underline hover:bg-transparent [&>svg]:w-3.5 [&>svg]:h-3.5 [&>svg]:text-muted-foreground">
        <div className="flex items-center gap-2.5 text-left min-w-0">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-kpi-blue text-kpi-blue-fg [&>svg]:w-4 [&>svg]:h-4">
            <ListChecks />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground leading-tight">Campos personalizados</div>
            <div data-testid="sidebar-section-subtitle" className="text-xs text-muted-foreground truncate">
              Informações extras usadas no atendimento
            </div>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-3 pb-3">
        <CustomFieldsBody contactId={contactId} />
      </AccordionContent>
    </AccordionItem>
  );
}

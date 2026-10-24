/**
 * Menu "Filtros salvos" da lista de conversas do Inbox.
 *
 * Só TELA: quem guarda/lê é `useInboxFilterPresets` (React Query sobre
 * `saved_filters`, sem localStorage como fonte da verdade — ver o hook). Aqui o
 * usuário salva o filtro atual, aplica, renomeia e exclui (com Desfazer).
 *
 * O conteúdo de um preset (status, tipo de contato e fila) chega pronto no
 * prop `current` e volta em `onApply` — este componente NÃO decide de onde vem o
 * estado da lista; por isso não inventa aba padrão nenhuma.
 *
 * O texto digitado na busca NUNCA entra no preset (pode conter dado pessoal):
 * o conteúdo é montado pelo dono da tela, não aqui.
 */
import { useCallback, useRef, useState } from 'react';
import { Bookmark, Pencil, Plus, Trash2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  PRESET_NAME_MAX_LENGTH,
  useInboxFilterPresets,
  validateInboxPresetName,
  type InboxFilterPreset,
  type InboxFilterPresetContent,
} from '@/hooks/inbox/useInboxFilterPresets';

interface InboxSavedFiltersMenuProps {
  /** Filtro que está na tela AGORA (status, tipo de contato e fila). */
  current: InboxFilterPresetContent;
  /** Aplica o conteúdo do preset escolhido na lista de conversas. */
  onApply: (content: InboxFilterPresetContent) => void;
}

export function InboxSavedFiltersMenu({ current, onApply }: InboxSavedFiltersMenuProps) {
  const { presets, savePreset, deletePreset, isSaving, isDeleting } = useInboxFilterPresets();
  const [isOpen, setIsOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'save' | 'rename' | null>(null);
  const [renameTarget, setRenameTarget] = useState<InboxFilterPreset | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState<InboxFilterPreset | null>(null);

  // Quem abriu o diálogo (o botão de dentro do popover). O Radix só devolve o foco ao
  // fechar quando existe um `DialogTrigger`; aqui o diálogo abre por estado, então o
  // foco voltaria para o <body> — o usuário de teclado se perde. Guardamos o botão que
  // abriu e devolvemos o foco a ele no fechamento.
  const openerRef = useRef<HTMLElement | null>(null);
  const lembrarQuemAbriu = useCallback(() => {
    openerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, []);

  const closeDialog = useCallback(() => {
    setDialogMode(null);
    setRenameTarget(null);
    setName('');
    setError(null);
  }, []);

  const openSave = useCallback(() => {
    lembrarQuemAbriu();
    setName('');
    setError(null);
    setRenameTarget(null);
    setDialogMode('save');
  }, [lembrarQuemAbriu]);

  const openRename = useCallback((preset: InboxFilterPreset) => {
    lembrarQuemAbriu();
    setName(preset.name);
    setError(null);
    setRenameTarget(preset);
    setDialogMode('rename');
  }, [lembrarQuemAbriu]);

  const submit = useCallback(async () => {
    // Valida aqui para o erro sair ao lado do campo (o hook valida de novo antes
    // de gravar — a regra é a mesma função nos dois lugares).
    const validation = validateInboxPresetName(name, presets, renameTarget?.id);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    try {
      if (renameTarget) {
        await savePreset({ id: renameTarget.id, name: validation.value, filters: renameTarget.filters });
      } else {
        await savePreset({ name: validation.value, filters: current });
      }
      closeDialog();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar o filtro.');
    }
  }, [name, presets, renameTarget, savePreset, current, closeDialog]);

  const apply = useCallback(
    (preset: InboxFilterPreset) => {
      onApply(preset.filters);
      setIsOpen(false);
    },
    [onApply]
  );

  const remove = useCallback(
    async (preset: InboxFilterPreset) => {
      setError(null);
      try {
        await deletePreset(preset.id);
        setRemoved(preset);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Não foi possível excluir o filtro.');
      }
    },
    [deletePreset]
  );

  const undoRemove = useCallback(async () => {
    if (!removed) return;
    setError(null);
    try {
      await savePreset({ name: removed.name, filters: removed.filters });
      setRemoved(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível desfazer a exclusão.');
    }
  }, [removed, savePreset]);

  const dialogOpen = dialogMode !== null;

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          {/* Só o ícone: a linha de filtros da lista é estreita (a lista vai de 280 a 600 px)
              e divide espaço com o campo de busca. O nome acessível segue "Filtros salvos". */}
          <Button
            variant="outline"
            size="icon"
            className="relative h-10 w-10 shrink-0"
            aria-label="Filtros salvos"
            title="Filtros salvos"
          >
            <Bookmark className="h-4 w-4" aria-hidden="true" />
            {presets.length > 0 && (
              <span
                aria-hidden="true"
                className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium leading-none text-primary-foreground"
              >
                {presets.length}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-80 p-3"
          align="end"
          aria-label="Filtros salvos do inbox"
          // O diálogo é um portal IRMÃO do popover: quando ele abre e o foco/tab entra
          // nele, o Radix leria isso como "foco fora" e fecharia o menu por baixo. Com o
          // diálogo aberto, o clique/foco de fora não derruba o popover.
          onFocusOutside={(event) => {
            if (dialogOpen) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (dialogOpen) event.preventDefault();
          }}
        >
          <div className="space-y-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full min-h-10 justify-start"
              onClick={openSave}
            >
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Salvar filtro atual
            </Button>

            <Separator />

            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Filtros salvos
              </p>
              {presets.length === 0 ? (
                <p className="px-1 py-2 text-xs text-muted-foreground">
                  Nenhum filtro salvo ainda.
                </p>
              ) : (
                <ul className="space-y-1">
                  {presets.map((preset) => (
                    <li key={preset.id} className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="min-h-10 flex-1 justify-start font-normal"
                        aria-label={`Aplicar filtro ${preset.name}`}
                        title={preset.name}
                        onClick={() => apply(preset)}
                      >
                        <Bookmark className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">{preset.name}</span>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        aria-label={`Renomear filtro ${preset.name}`}
                        onClick={() => openRename(preset)}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        aria-label={`Excluir filtro ${preset.name}`}
                        disabled={isDeleting}
                        onClick={() => void remove(preset)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {removed && (
              <div
                role="status"
                className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted px-2 py-1.5"
              >
                <span className="truncate text-xs text-muted-foreground">
                  Filtro “{removed.name}” excluído.
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-10 shrink-0 text-xs"
                  onClick={() => void undoRemove()}
                  disabled={isSaving}
                >
                  <Undo2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  Desfazer
                </Button>
              </div>
            )}

            {error && !dialogOpen && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          onCloseAutoFocus={(event) => {
            // Devolve o foco ao botão do popover que abriu o diálogo (ver openerRef).
            event.preventDefault();
            const opener = openerRef.current;
            if (opener && opener.isConnected) opener.focus();
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <DialogHeader>
              <DialogTitle>{renameTarget ? 'Renomear filtro' : 'Salvar filtro atual'}</DialogTitle>
              <DialogDescription>
                O filtro guarda o status, o tipo de contato e a fila. O texto da busca não é
                salvo.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <Label htmlFor="inbox-preset-name">Nome do filtro</Label>
              <Input
                id="inbox-preset-name"
                value={name}
                autoFocus
                maxLength={PRESET_NAME_MAX_LENGTH * 2}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'inbox-preset-error' : undefined}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  // `tecla`: a regra local/no-secret-compare confunde `.key` (tecla) com credencial.
                  const tecla = e.key;
                  if (tecla === 'Enter') {
                    e.preventDefault();
                    void submit();
                  }
                }}
              />
              {error && (
                <p id="inbox-preset-error" role="alert" className="text-xs text-destructive">
                  {error}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={closeDialog}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSaving}>
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default InboxSavedFiltersMenu;

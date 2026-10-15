import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, Building2, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { zappSubviewVariants } from '@/lib/motion';
import { TeamConversation } from '@/hooks/team-chat/teamChatTypes';
import { useActiveDepartments } from '@/hooks/team-chat/useActiveDepartments';
import { useTransferConversationDepartment } from '@/hooks/team-chat/useTeamChatMutations';

/**
 * Move a conversa de departamento (cartão seguinte ao hook PH-17).
 * O V2 tem o diálogo de PROPRIEDADE do grupo (`TransferConversationDialog`), que
 * é outra coisa — este muda o `department_id` pela RPC guardada, e só o destino
 * é escolhido aqui. O estado de erro e a seleção moram no diálogo para ele ficar
 * ABERTO quando o banco recusa (fechar no erro esconderia o motivo).
 */
const ERRO_AO_MOVER = 'Não foi possível mover a conversa de departamento. Tente novamente.';

interface MoveDepartmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: TeamConversation;
}

export function MoveDepartmentDialog({ open, onOpenChange, conversation }: MoveDepartmentDialogProps) {
  // O diálogo só é montado enquanto está aberto (o cabeçalho o desmonta ao
  // fechar), então seleção e erro começam limpos a cada abertura — e o hook da
  // RPC não roda em quem nunca abriu o menu.
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  const reduzirMovimento = useReducedMotion() ?? false;

  const departamentoAtualId = conversation.department_id ?? null;
  const { data: departamentos = [], isLoading } = useActiveDepartments(open);
  const moverMutation = useTransferConversationDepartment();

  // Foco: ao abrir, o teclado vai para o primeiro departamento que PODE ser
  // escolhido — o atual fica desabilitado e não recebe foco.
  const totalDepartamentos = departamentos.length;
  useEffect(() => {
    if (!open) return;
    const primeiro = listaRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])');
    (primeiro ?? listaRef.current)?.focus();
  }, [open, totalDepartamentos]);

  const idSelecionado = useMemo(
    () => (selectedDeptId && selectedDeptId !== departamentoAtualId ? selectedDeptId : null),
    [selectedDeptId, departamentoAtualId],
  );

  const handleMover = async () => {
    if (!idSelecionado) return;
    setErro(null);
    try {
      await moverMutation.mutateAsync({
        conversationId: conversation.id,
        toDepartmentId: idSelecionado,
      });
      onOpenChange(false);
    } catch {
      setErro(ERRO_AO_MOVER);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(valor) => {
        if (!valor && moverMutation.isPending) return;
        onOpenChange(valor);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-4 h-4" aria-hidden />
            Mover para outro departamento
          </DialogTitle>
          <DialogDescription>
            Escolha o departamento que passa a receber esta conversa.
          </DialogDescription>
        </DialogHeader>

        <div
          ref={listaRef}
          tabIndex={-1}
          role="listbox"
          aria-label="Departamentos de destino"
          className="max-h-60 overflow-auto space-y-0.5 border rounded-lg p-1 outline-none"
        >
          {isLoading ? (
            <div className="text-center py-4 text-muted-foreground text-sm">Carregando departamentos...</div>
          ) : departamentos.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground text-sm">
              Nenhum departamento disponível
            </div>
          ) : (
            departamentos.map((departamento) => {
              const atual = departamento.id === departamentoAtualId;
              const selecionado = idSelecionado === departamento.id;
              return (
                <button
                  key={departamento.id}
                  type="button"
                  role="option"
                  aria-selected={selecionado}
                  aria-disabled={atual}
                  aria-label={atual ? `${departamento.name} — departamento atual` : departamento.name}
                  disabled={atual}
                  onClick={() => setSelectedDeptId(departamento.id)}
                  className={cn(
                    'w-full flex items-center gap-3 p-2.5 rounded-md text-left transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                    selecionado && 'bg-primary/10',
                    atual && 'opacity-60 cursor-not-allowed',
                    !atual && 'hover:bg-accent/50',
                  )}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Building2 className="h-4 w-4 text-primary" aria-hidden />
                  </span>
                  <span className="flex-1 text-sm font-medium text-foreground truncate">
                    {departamento.name}
                  </span>
                  {atual ? (
                    <span className="text-xs text-muted-foreground shrink-0">Departamento atual</span>
                  ) : (
                    <span
                      aria-hidden
                      className={cn(
                        'h-4 w-4 shrink-0 rounded-full border-2',
                        selecionado ? 'bg-primary border-primary' : 'border-muted-foreground/30',
                      )}
                    />
                  )}
                </button>
              );
            })
          )}
        </div>

        <AnimatePresence>
          {erro && (
            <motion.p
              role="alert"
              variants={zappSubviewVariants}
              initial={reduzirMovimento ? false : 'hidden'}
              animate="visible"
              exit="exit"
              className="flex items-center gap-2 text-sm text-destructive"
            >
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
              {erro}
            </motion.p>
          )}
        </AnimatePresence>

        <DialogFooter className="gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={moverMutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-2"
            onClick={() => void handleMover()}
            disabled={!idSelecionado || moverMutation.isPending}
          >
            {moverMutation.isPending && (
              <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden />
            )}
            Mover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

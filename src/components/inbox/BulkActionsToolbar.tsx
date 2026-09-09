import { useState } from 'react';
import { X, Archive, Forward, CheckCheck, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { motion, AnimatePresence } from 'framer-motion';
import { TransferDialog } from './TransferDialog';

interface BulkActionsToolbarProps {
  selectedCount: number;
  onMarkAsRead: () => void;
  onTransfer: (type: 'agent' | 'queue', targetId: string, message?: string) => void;
  onArchive: () => void;
  onClearSelection: () => void;
  isLoading?: boolean;
}

export function BulkActionsToolbar({
  selectedCount,
  onMarkAsRead,
  onTransfer,
  onArchive,
  onClearSelection,
  isLoading = false,
}: BulkActionsToolbarProps) {
  const [showTransferDialog, setShowTransferDialog] = useState(false);

  if (selectedCount === 0) return null;

  const handleTransfer = (type: 'agent' | 'queue', targetId: string, message?: string) => {
    onTransfer(type, targetId, message);
    setShowTransferDialog(false);
  };

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="absolute top-0 left-0 right-0 z-20 h-10 bg-primary/95 backdrop-blur-sm border-b border-primary-foreground/20 px-3 flex items-center"
        >
          <div className="flex items-center justify-between gap-4 w-full">
            <div className="flex items-center gap-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClearSelection}
                    className="text-primary-foreground hover:bg-primary-foreground/20 w-8 h-8"
                    aria-label="Limpar seleção"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Limpar seleção (Esc)</TooltipContent>
              </Tooltip>
              <Badge variant="secondary" className="bg-primary-foreground/20 text-primary-foreground border-0">
                {selectedCount} selecionado{selectedCount > 1 ? 's' : ''}
              </Badge>
            </div>

            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onMarkAsRead}
                    disabled={isLoading}
                    className="text-primary-foreground hover:bg-primary-foreground/20 gap-2"
                    aria-label="Marcar como lido"
                  >
                    <CheckCheck className="w-4 h-4" />
                    <span className="hidden sm:inline">Marcar como lido</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Marcar como lido (R)</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowTransferDialog(true)}
                    disabled={isLoading}
                    className="text-primary-foreground hover:bg-primary-foreground/20 gap-2"
                    aria-label="Transferir"
                  >
                    <Forward className="w-4 h-4" />
                    <span className="hidden sm:inline">Transferir</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Transferir para agente ou fila</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onArchive}
                    disabled={isLoading}
                    className="text-primary-foreground hover:bg-primary-foreground/20 gap-2"
                    aria-label="Arquivar"
                  >
                    <Archive className="w-4 h-4" />
                    <span className="hidden sm:inline">Arquivar</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <div className="flex items-center gap-1.5">
                    Arquivar selecionados
                    <kbd className="text-[10px] px-1 py-0.5 bg-muted/50 rounded font-mono">Del</kbd>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Você pode desfazer em 5s</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      <TransferDialog
        open={showTransferDialog}
        onOpenChange={setShowTransferDialog}
        onTransfer={handleTransfer as (type: "agent" | "connection" | "queue", targetId: string, message?: string) => void}
      />
    </>
  );
}

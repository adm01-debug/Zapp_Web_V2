import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import type { TeamConversation } from '@/hooks/team-chat/teamChatTypes';
import { useTransferDepartment } from '@/hooks/team-chat/useTeamChatMutations';
import { useActiveDepartments } from '@/hooks/team-chat/useActiveDepartments';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conversation: TeamConversation;
  currentUserId: string;
}

export function TransferConversationDialog({ open, onOpenChange, conversation }: Props) {
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');
  const transferMutation = useTransferDepartment();
  const { data: departments = [], isLoading } = useActiveDepartments(open);

  const handleClose = () => {
    setSelectedDeptId('');
    onOpenChange(false);
  };

  const handleConfirm = () => {
    if (!selectedDeptId) return;
    transferMutation.mutate(
      { conversationId: conversation.id, toDepartmentId: selectedDeptId },
      { onSuccess: handleClose },
    );
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); else onOpenChange(true); }}>
      <DialogContent className="max-w-sm" data-testid="transfer-conversation-dialog">
        <DialogHeader>
          <DialogTitle>Transferir canal para departamento</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Selecione o departamento de destino. O canal será vinculado ao novo departamento.
        </p>

        {isLoading ? (
          <div className="flex items-center justify-center py-4 gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Carregando departamentos...
          </div>
        ) : departments.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            Nenhum departamento ativo disponível.
          </div>
        ) : (
          <Select
            value={selectedDeptId}
            onValueChange={setSelectedDeptId}
          >
            <SelectTrigger data-testid="transfer-department-select" className="w-full">
              <SelectValue placeholder="Selecionar departamento..." />
            </SelectTrigger>
            <SelectContent>
              {departments.map(dept => (
                <SelectItem
                  key={dept.id}
                  value={dept.id}
                  data-testid={`transfer-dept-option-${dept.id}`}
                >
                  {dept.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <DialogFooter className="gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClose}
            disabled={transferMutation.isPending}
            data-testid="transfer-cancel-btn"
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={!selectedDeptId || transferMutation.isPending}
            onClick={handleConfirm}
            data-testid="transfer-confirm-btn"
          >
            {transferMutation.isPending
              ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Transferindo...</>
              : 'Confirmar transferência'
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

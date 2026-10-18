import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
import { useAgentReassignment } from '@/hooks/crm/useAgentReassignment';
import { UserMinus, Scale, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Minutos de inatividade usados pela reatribuição de ausentes (padrão da RPC). */
const INACTIVE_MINUTES = 30;

type BulkAction = 'absent' | 'overloaded';

interface AgentReassignmentPanelProps {
  className?: string;
}

export function AgentReassignmentPanel({ className }: AgentReassignmentPanelProps) {
  const { reassignAbsent, reassignOverloaded, isLoading } = useAgentReassignment();
  const [confirming, setConfirming] = useState<BulkAction | null>(null);

  const isAbsent = confirming === 'absent';
  const title = isAbsent
    ? 'Reatribuir conversas de agentes ausentes?'
    : 'Balancear carga dos agentes?';
  const rule = isAbsent
    ? `Todas as conversas atribuídas a agentes inativos há mais de ${INACTIVE_MINUTES} minutos serão reatribuídas para agentes disponíveis, de uma vez.`
    : 'Todas as conversas de agentes que excedem o limite máximo de chats configurado serão redistribuídas, de uma vez.';

  const handleConfirm = () => {
    if (confirming === 'absent') reassignAbsent.mutate(INACTIVE_MINUTES);
    else if (confirming === 'overloaded') reassignOverloaded.mutate();
    setConfirming(null);
  };

  return (
    <Card className={cn('border-border/30', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Scale className="w-4 h-4 text-primary" />
          Balanceamento de Carga
        </CardTitle>
      </CardHeader>
      <CardContent className="flex gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs gap-1.5 whitespace-normal min-w-0"
              disabled={isLoading}
              onClick={() => setConfirming('absent')}
            >
              {reassignAbsent.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserMinus className="w-3 h-3" />}
              Reatribuir Ausentes
            </Button>
          </TooltipTrigger>
          <TooltipContent className="text-xs max-w-[220px]">
            Reatribui conversas de agentes inativos há mais de 30 minutos para agentes disponíveis
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs gap-1.5 whitespace-normal min-w-0"
              disabled={isLoading}
              onClick={() => setConfirming('overloaded')}
            >
              {reassignOverloaded.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Scale className="w-3 h-3" />}
              Balancear Carga
            </Button>
          </TooltipTrigger>
          <TooltipContent className="text-xs max-w-[220px]">
            Redistribui conversas de agentes que excedem o limite máximo de chats configurado
          </TooltipContent>
        </Tooltip>

        {/* Reatribuição em massa mexe em várias conversas de uma vez: exige
            confirmação explícita, com o alcance da regra na frente do usuário. */}
        <AlertDialog open={confirming !== null} onOpenChange={(open) => { if (!open) setConfirming(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{title}</AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <span className="block">
                  O número de conversas só é conhecido quando o servidor executa a
                  reatribuição — a tela confirma a regra antes de disparar.
                </span>
                <span className="block">{rule}</span>
                <span className="block">A ação não pode ser desfeita.</span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirm}>
                {isAbsent ? 'Confirmar reatribuição' : 'Confirmar balanceamento'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAgentReassignment } from '@/hooks/crm/useAgentReassignment';
import { UserMinus, Scale, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgentReassignmentPanelProps {
  className?: string;
}

export function AgentReassignmentPanel({ className }: AgentReassignmentPanelProps) {
  const { reassignAbsent, reassignOverloaded, isLoading } = useAgentReassignment();

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
              className="flex-1 text-xs gap-1.5"
              disabled={isLoading}
              onClick={() => reassignAbsent.mutate(30)}
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
              className="flex-1 text-xs gap-1.5"
              disabled={isLoading}
              onClick={() => reassignOverloaded.mutate()}
            >
              {reassignOverloaded.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Scale className="w-3 h-3" />}
              Balancear Carga
            </Button>
          </TooltipTrigger>
          <TooltipContent className="text-xs max-w-[220px]">
            Redistribui conversas de agentes que excedem o limite máximo de chats configurado
          </TooltipContent>
        </Tooltip>
      </CardContent>
    </Card>
  );
}

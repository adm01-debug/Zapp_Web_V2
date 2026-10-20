/**
 * ExportButton - BLOQUEADO por política de segurança.
 */

import { Button } from '@/components/ui/button';
import { ShieldAlert } from 'lucide-react';
import { toast } from '@/hooks/ui/use-toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ReportData } from '@/utils/exportReport';

interface ExportButtonProps {
  getData: () => Promise<ReportData> | ReportData;
  disabled?: boolean;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
}

export const ExportButton = ({ className }: ExportButtonProps) => {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="default"
          disabled
          className={`opacity-50 cursor-not-allowed ${className || ''}`}
          onClick={() => toast({ title: '🔒 Exportação Bloqueada', description: 'Proteção de dados ativa', variant: 'destructive' })}
        >
          <ShieldAlert className="h-4 w-4 mr-2 text-destructive" />
          Exportação Bloqueada
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Exportação desabilitada para proteção de dados de clientes</p>
      </TooltipContent>
    </Tooltip>
  );
};

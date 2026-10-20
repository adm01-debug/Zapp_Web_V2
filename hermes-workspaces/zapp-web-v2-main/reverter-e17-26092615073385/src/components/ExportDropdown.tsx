/**
 * ExportDropdown - Controlado por permissão de download do usuário.
 */

import { Button } from '@/components/ui/button';
import { Download, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDownloadPermission } from '@/hooks/system/useDownloadPermission';

interface ExportDropdownProps {
  onExport?: (format: string) => void;
  isExporting?: boolean;
  formats?: string[];
  disabled?: boolean;
  itemCount?: number;
}

export function ExportDropdown({ onExport, isExporting, disabled }: ExportDropdownProps) {
  const { canDownload } = useDownloadPermission();

  if (!canDownload) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 opacity-50 cursor-not-allowed"
            disabled
            onClick={() => toast.error('🔒 Exportação bloqueada por política de segurança')}
          >
            <ShieldAlert className="h-4 w-4 text-destructive" />
            <span className="hidden sm:inline">Exportação Bloqueada</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Exportação desabilitada — solicite permissão ao administrador</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-2"
      disabled={disabled || isExporting}
      onClick={() => onExport?.('csv')}
    >
      <Download className="h-4 w-4" />
      <span className="hidden sm:inline">Exportar</span>
    </Button>
  );
}

export default ExportDropdown;

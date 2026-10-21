import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { RefreshCw, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getLogger } from '@/lib/logger';

const log = getLogger('CRMAutoSync');

interface CRMAutoSyncProps {
  contactId: string;
  externalId?: string | null;
  onSyncComplete?: () => void;
}

interface SyncResult {
  synced: boolean;
  error?: string;
}

export function CRMAutoSync({ contactId, externalId, onSyncComplete }: CRMAutoSyncProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);

  const handleSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('crm-sync', {
        body: { contactId, externalId },
      });
      if (error) throw error;
      setLastResult({ synced: true });
      onSyncComplete?.();
      toast.success('Sincronizado com CRM externo');
      log.debug('CRM sync ok', data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      setLastResult({ synced: false, error: msg });
      toast.error('Erro ao sincronizar com CRM', { description: msg });
      log.error('CRM sync error', err);
    } finally {
      setIsSyncing(false);
    }
  }, [contactId, externalId, isSyncing, onSyncComplete]);

  useEffect(() => {
    if (lastResult) {
      const t = setTimeout(() => setLastResult(null), 3000);
      return () => clearTimeout(t);
    }
  }, [lastResult]);

  const tooltipText = isSyncing
    ? 'Sincronizando...'
    : lastResult?.synced
      ? 'Sincronizado!'
      : lastResult?.error
        ? `Erro: ${lastResult.error}`
        : 'Sincronizar com CRM externo';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          onClick={handleSync}
          disabled={isSyncing}
          aria-label={tooltipText}
          data-testid="crm-sync-button"
          className="w-9 h-9 border-border/30 hover:border-primary/50 hover:bg-primary/10"
        >
          {isSyncing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : lastResult?.synced ? (
            <CheckCircle2 className="w-4 h-4 text-success" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{tooltipText}</TooltipContent>
    </Tooltip>
  );
}

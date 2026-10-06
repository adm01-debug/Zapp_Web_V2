import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import { toast } from '@/hooks/ui/use-toast';
import { forwardLimitError } from '@/lib/forward-limits';
import type { ForwardResult } from './useForwardMedia';

interface Contact {
  id: string;
  name: string;
  phone: string;
  avatar_url?: string;
}

interface Group {
  id: string;
  name: string;
  avatar_url?: string;
  participant_count: number;
}

export interface ForwardTargetSummary {
  id: string;
  name: string;
  type: 'contact' | 'group';
}

/**
 * Callback de envio (etapa 37 / R2-INB-002). Sempre assíncrono e sempre devolve o
 * `ForwardResult` real do transporte — `void` NÃO significa sucesso. O `onProgress`
 * alimenta o contador "X/Y enviados" (etapa 38).
 */
export type ForwardCallback = (
  targetIds: string[],
  targetType: 'contact' | 'group',
  onProgress?: (done: number, total: number) => void,
) => Promise<ForwardResult>;

export interface UseForwardMessageOptions {
  open: boolean;
  /** Etapa 36: com `false`, a aba Grupos fica oculta e nao e buscada. */
  allowGroups?: boolean;
  /** Quantidade de arquivos da operacao — entra na conta dos limites da etapa 39. */
  itemCount?: number;
  /**
   * Etapa 39: limites de protecao SO valem para a aba Arquivos. O caminho legado do chat
   * passa `false` (default) e mantem o comportamento anterior, sem bloqueio nem confirmacao.
   */
  enforceLimits?: boolean;
  onForward: ForwardCallback;
  onOpenChange: (open: boolean) => void;
}

export interface ForwardProgress {
  done: number;
  total: number;
}

function combineResults(results: ForwardResult[]): ForwardResult {
  const pairOutcomes = results.flatMap((result) => result.pairOutcomes);
  const nonForwardable = results.flatMap((result) => result.nonForwardable);
  const sent = pairOutcomes.filter((outcome) => outcome.ok).length;
  return {
    pairOutcomes,
    nonForwardable,
    attempted: pairOutcomes.length,
    sent,
    failed: pairOutcomes.length - sent,
  };
}

/** Destinos distintos sem nenhum par falhando — o "N destinos" do toast de sucesso. */
function successfulTargetCount(result: ForwardResult): number {
  const failedTargets = new Set(result.pairOutcomes.filter((outcome) => !outcome.ok).map((outcome) => outcome.targetId));
  const successfulTargets = new Set(result.pairOutcomes.filter((outcome) => outcome.ok).map((outcome) => outcome.targetId));
  let count = 0;
  for (const targetId of Array.from(successfulTargets)) if (!failedTargets.has(targetId)) count += 1;
  return count;
}

export function useForwardMessage({
  open,
  allowGroups = true,
  itemCount = 1,
  enforceLimits = false,
  onForward,
  onOpenChange,
}: UseForwardMessageOptions) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [activeTab, setActiveTab] = useState<'contacts' | 'groups'>('contacts');
  const [progress, setProgress] = useState<ForwardProgress | null>(null);
  const [lastResult, setLastResult] = useState<ForwardResult | null>(null);

  const fetchContacts = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, name, phone, avatar_url')
        .order('name');
      if (error) throw error;
      setContacts((data || []) as Contact[]);
    } catch (error) {
      log.error('Error fetching contacts:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchGroups = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_groups')
        .select('id, name, avatar_url, participant_count')
        .order('name');
      if (error) throw error;
      setGroups((data || []) as Group[]);
    } catch (error) {
      log.error('Error fetching groups:', error);
    }
  }, []);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-open padrão, sem estado derivado de props para sincronizar.
      fetchContacts();
      if (allowGroups) fetchGroups();
    }
  }, [open, allowGroups, fetchContacts, fetchGroups]);

  const filteredContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.phone.includes(searchQuery)
  );

  const filteredGroups = groups.filter(g =>
    g.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleContact = (id: string) => {
    setSelectedContacts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleGroup = (id: string) => {
    setSelectedGroups(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const reset = useCallback(() => {
    setSelectedContacts([]);
    setSelectedGroups([]);
    setSearchQuery('');
    setProgress(null);
    setLastResult(null);
  }, []);

  const runForward = useCallback(
    async (targetIds: string[], targetType: 'contact' | 'group'): Promise<ForwardResult> => {
      const result = await onForward(targetIds, targetType, (done, total) => setProgress({ done, total }));
      // R2-INB-002: sem resultado do transporte não existe sucesso — melhor falhar do
      // que anunciar entregas que ninguém fez.
      if (!result || typeof result !== 'object') {
        throw new Error('O encaminhamento não devolveu o resultado do transporte.');
      }
      return result;
    },
    [onForward],
  );

  const applyResult = useCallback(
    (result: ForwardResult) => {
      setLastResult(result);
      if (result.failed === 0 && result.nonForwardable.length === 0) {
        const count = successfulTargetCount(result);
        toast({
          title: 'Encaminhado!',
          description: `Encaminhado para ${count} ${count === 1 ? 'destino' : 'destinos'}.`,
        });
        reset();
        onOpenChange(false);
        return;
      }
      const parts: string[] = [];
      if (result.failed > 0) parts.push(`${result.failed} ${result.failed === 1 ? 'envio falhou' : 'envios falharam'}`);
      if (result.nonForwardable.length > 0) {
        parts.push(`${result.nonForwardable.length} ${result.nonForwardable.length === 1 ? 'arquivo não pode ser encaminhado' : 'arquivos não podem ser encaminhados'}`);
      }
      toast({
        title: 'Encaminhamento parcial',
        description: parts.join(' · ') || 'Alguns destinos falharam.',
        variant: 'destructive',
      });
    },
    [onOpenChange, reset],
  );

  const handleForward = useCallback(async () => {
    if (isSending) return;
    const contactIds = [...selectedContacts];
    const groupIds = allowGroups ? [...selectedGroups] : [];
    const totalTargets = contactIds.length + groupIds.length;
    if (totalTargets === 0) {
      toast({ title: 'Selecione destinatários', description: 'Escolha pelo menos um contato ou grupo para encaminhar.', variant: 'destructive' });
      return;
    }

    const limit = forwardLimitError(itemCount, totalTargets);
    if (limit) {
      toast({ title: 'Limite excedido', description: limit, variant: 'destructive' });
      return;
    }

    setIsSending(true);
    setProgress(null);
    setLastResult(null);
    try {
      const collected: ForwardResult[] = [];
      if (contactIds.length > 0) collected.push(await runForward(contactIds, 'contact'));
      if (groupIds.length > 0) collected.push(await runForward(groupIds, 'group'));

      applyResult(combineResults(collected));
    } catch (error) {
      log.error('Error forwarding:', error);
      toast({ title: 'Erro ao encaminhar', description: 'Não foi possível encaminhar a mensagem.', variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  }, [isSending, selectedContacts, selectedGroups, allowGroups, itemCount, runForward, applyResult]);

  const failedTargets = useMemo<ForwardTargetSummary[]>(() => {
    if (!lastResult) return [];
    const seen = new Set<string>();
    const summaries: ForwardTargetSummary[] = [];
    for (const outcome of lastResult.pairOutcomes) {
      if (outcome.ok || seen.has(outcome.targetId)) continue;
      seen.add(outcome.targetId);
      const name = outcome.targetType === 'contact'
        ? contacts.find((contact) => contact.id === outcome.targetId)?.name ?? 'Contato'
        : groups.find((group) => group.id === outcome.targetId)?.name ?? 'Grupo';
      summaries.push({ id: outcome.targetId, name, type: outcome.targetType });
    }
    return summaries;
  }, [lastResult, contacts, groups]);

  const retryFailed = useCallback(async () => {
    if (isSending || failedTargets.length === 0) return;
    const contactIds = Array.from(new Set(failedTargets.filter((t) => t.type === 'contact').map((t) => t.id)));
    const groupIds = Array.from(new Set(failedTargets.filter((t) => t.type === 'group').map((t) => t.id)));

    setIsSending(true);
    setProgress(null);
    try {
      const collected: ForwardResult[] = [];
      if (contactIds.length > 0) collected.push(await runForward(contactIds, 'contact'));
      if (groupIds.length > 0) collected.push(await runForward(groupIds, 'group'));
      applyResult(combineResults(collected));
    } catch (error) {
      log.error('Error retrying forward:', error);
      toast({ title: 'Erro ao encaminhar', description: 'Não foi possível reenviar aos destinos que falharam.', variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  }, [isSending, failedTargets, runForward, applyResult]);

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const totalSelected = selectedContacts.length + (allowGroups ? selectedGroups.length : 0);

  return {
    searchQuery, setSearchQuery,
    selectedContacts, selectedGroups,
    filteredContacts, filteredGroups,
    isLoading, isSending,
    activeTab, setActiveTab,
    toggleContact, toggleGroup,
    handleForward, handleClose,
    totalSelected,
    progress,
    lastResult,
    failedTargets,
    retryFailed,
  };
}

export type { Contact, Group };

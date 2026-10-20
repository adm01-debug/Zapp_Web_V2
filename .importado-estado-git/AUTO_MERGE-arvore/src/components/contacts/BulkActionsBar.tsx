import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { Tag, Trash2, UserCheck, Star, X, CheckSquare, ChevronDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CONTACT_TYPES } from '@/utils/whatsappFileTypes';
import { isWhatsAppTag, filterCustomTags, getTagDisplayName } from '@/lib/tags';
import { applyContactFieldUpdate, applyContactTagChange, pendingIds } from '@/services/contact-bulk.service';

interface BulkActionsBarProps {
  selectedIds: string[];
  onClearSelection: () => void;
  onActionComplete: () => void;
  /**
   * Recusados pelo banco numa ação parcial: o chamador mantém esses IDs
   * selecionados (em vez de limpar tudo como em `onActionComplete`).
   */
  onPartialComplete?: (refusedIds: string[]) => void;
  /** Chamado após operações em lote que mudam a quantidade ou o tipo dos contatos. */
  onCountersChanged?: () => void;
  availableTags?: string[];
  availableAgents?: { id: string; name: string }[];
  /**
   * Se ao menos um dos contatos selecionados pode ser excluído (`can_delete` do
   * banco). Sem isso o botão Excluir aparecia mesmo quando o banco ia recusar
   * todos -- o lote devolve erro só quando NENHUM pôde ser excluído.
   */
  canDeleteSelection?: boolean;
  /**
   * Gate de papel do "Alterar tipo em massa": alterar tipo em massa é restrito a
   * admin/supervisor, e o dado vem do usuário logado (`useUserRole`). Quando o
   * resultado por contato (`canChangeTypeSelection`) é conhecido, ele tem
   * precedência — é o dado do banco, não uma segunda cópia da regra.
   */
  canChangeType?: boolean;
  /**
   * Se ao menos um dos contatos selecionados pode ter o tipo alterado. Mesmo
   * predicado do banco para UPDATE em `contacts` (`can_edit_contact`: admin/
   * supervisor OU responsável pelo contato), exposto por `contact.can_delete`
   * via `canChangeSelectedContactsType`. Sem o gate o dropdown "Tipo" aparecia
   * para qualquer um e a recusa só surgia no clique (RLS). `undefined` (RPC
   * ainda não respondeu) deixa a decisão com o gate de papel.
   */
  canChangeTypeSelection?: boolean;
}

export function BulkActionsBar({
  selectedIds,
  onClearSelection,
  onActionComplete,
  onPartialComplete,
  onCountersChanged,
  availableTags = [],
  availableAgents = [],
  canDeleteSelection = true,
  canChangeType = false,
  canChangeTypeSelection,
}: BulkActionsBarProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const count = selectedIds.length;

  /**
   * Gate único do "Alterar tipo em massa". Duas entradas convergem aqui:
   * - `canChangeType` (papel admin/supervisor) decide se o dropdown é oferecido;
   * - `canChangeTypeSelection` (permissão por contato, do banco) tem precedência
   *   quando conhecido: `true` libera, `false` mostra o botão desabilitado com o
   *   motivo, em vez de sumir sem explicação.
   */
  const typePermission =
    canChangeTypeSelection !== undefined ? canChangeTypeSelection : canChangeType;
  const showTypeAction = canChangeType || canChangeTypeSelection !== undefined;

  const handleBulkTag = useCallback(async (tag: string) => {
    if (isWhatsAppTag(tag)) return;
    setIsProcessing(true);
    try {
      // R2-AUTH-013: antes, `Promise.all` sobre SELECTs que devolvem `{error}` (nunca
      // rejeitam) escondia a falha de leitura, `tags=[]` era fabricado e o UPDATE
      // sobrescrevia as tags reais. Agora quem mudou/foi recusado/falhou é explícito.
      const outcome = await applyContactTagChange(selectedIds, { add: [tag] });
      const refused = pendingIds(outcome);

      if (outcome.succeeded.length === 0 && refused.length === 0) {
        toast.success(`Tag "${tag}" já estava nos ${count} contatos selecionados`);
        onActionComplete();
        return;
      }
      if (outcome.succeeded.length === 0) {
        toast.error('Erro ao adicionar tags. Nenhum contato foi alterado.');
        return;
      }
      if (refused.length > 0) {
        toast.warning(`${outcome.succeeded.length} de ${count} contatos receberam a tag "${tag}"`, {
          description: 'Os demais não puderam ser atualizados (sem permissão ou sem alteração).',
        });
        onPartialComplete?.(refused);
      } else {
        toast.success(`Tag "${tag}" adicionada a ${outcome.succeeded.length} contatos`);
        onActionComplete();
      }
    } catch {
      toast.error('Erro ao adicionar tags');
    } finally {
      setIsProcessing(false);
    }
  }, [selectedIds, count, onActionComplete, onPartialComplete]);

  const handleBulkAssign = useCallback(async (agentId: string, agentName: string) => {
    setIsProcessing(true);
    try {
      const outcome = await applyContactFieldUpdate(selectedIds, { assigned_to: agentId });
      const refused = pendingIds(outcome);

      if (outcome.succeeded.length === 0) {
        toast.error(
          outcome.refused.length > 0 && refused.length === outcome.refused.length
            ? 'Nenhum contato foi atribuído. Verifique se você tem permissão.'
            : 'Erro ao atribuir contatos. Nenhum contato foi alterado.',
        );
        return;
      }
      if (refused.length > 0) {
        toast.warning(`${outcome.succeeded.length} de ${count} contatos atribuídos a ${agentName}`, {
          description: 'Os demais não puderam ser atribuídos (sem permissão).',
        });
        onPartialComplete?.(refused);
      } else {
        toast.success(`${count} contatos atribuídos a ${agentName}`);
        onActionComplete();
      }
    } catch {
      toast.error('Erro ao atribuir contatos');
    } finally {
      setIsProcessing(false);
    }
  }, [selectedIds, count, onActionComplete, onPartialComplete]);

  const handleBulkType = useCallback(async (contactType: string) => {
    setIsProcessing(true);
    try {
      const outcome = await applyContactFieldUpdate(selectedIds, { contact_type: contactType });
      const refused = pendingIds(outcome);

      if (outcome.succeeded.length === 0) {
        toast.error(
          outcome.refused.length > 0 && refused.length === outcome.refused.length
            ? 'Nenhum contato foi atualizado. Verifique se você tem permissão.'
            : 'Erro ao atualizar tipo. Nenhum contato foi alterado.',
        );
        return;
      }
      if (refused.length > 0) {
        toast.warning(`${outcome.succeeded.length} de ${count} contatos atualizados para "${contactType}"`, {
          description: 'Os demais não puderam ser atualizados (sem permissão).',
        });
        onPartialComplete?.(refused);
      } else {
        toast.success(`${count} contatos atualizados para "${contactType}"`);
        onActionComplete();
      }
      onCountersChanged?.();
    } catch {
      toast.error('Erro ao atualizar tipo');
    } finally {
      setIsProcessing(false);
    }
  }, [selectedIds, count, onActionComplete, onPartialComplete, onCountersChanged]);

  const handleBulkDelete = useCallback(async () => {
    setIsProcessing(true);
    try {
      // Exclusao em massa pelo RPC auditado (soft-delete). `.delete().in('id', ...)` nao
      // tinha policy de DELETE em `contacts`: devolvia 0 linhas sem erro e o toast
      // anunciava "N contatos removidos" (auditoria de 29/09, §3.1).
      const { data, error } = await supabase.rpc('delete_contacts', { p_ids: selectedIds });

      if (error) throw error;
      if (typeof data !== 'number' || data <= 0) {
        throw new Error('Nenhum contato foi excluído. Verifique se você tem permissão.');
      }

      // O lote devolve quantos foram excluídos de fato. Quando é menos que o
      // selecionado, o resto foi recusado pelo banco e o aviso precisa dizer isso
      // -- antes o toast anunciava só o que saiu e parecia sucesso total.
      if (data < count) {
        toast.warning(`${data} de ${count} contatos removidos`, {
          description: 'Os demais nao puderam ser excluidos (sem permissao para esses contatos).',
        });
      } else {
        toast.success(`${data} contato${data > 1 ? 's' : ''} removido${data > 1 ? 's' : ''}`);
      }
      onClearSelection();
      onActionComplete();
      onCountersChanged?.();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'Erro ao remover contatos');
    } finally {
      setIsProcessing(false);
    }
  }, [selectedIds, count, onClearSelection, onActionComplete, onCountersChanged]);

  if (count === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-xl shadow-lg"
      >
        <CheckSquare className="w-4 h-4" />
        <span className="text-sm font-medium">{count} selecionado{count > 1 ? 's' : ''}</span>

        {/* Tag */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="secondary" disabled={isProcessing}>
              <Tag className="w-3.5 h-3.5 mr-1" />
              Tag
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {availableTags.length > 0 ? (
              filterCustomTags(availableTags).slice(0, 10).map(tag => (
                <DropdownMenuItem key={tag} onClick={() => handleBulkTag(tag)}>
                  {getTagDisplayName(tag)}
                </DropdownMenuItem>
              ))
            ) : (
              <DropdownMenuItem disabled>Sem tags disponíveis</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Assign */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="secondary" disabled={isProcessing}>
              <UserCheck className="w-3.5 h-3.5 mr-1" />
              Atribuir
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {availableAgents.length > 0 ? (
              availableAgents.map(agent => (
                <DropdownMenuItem key={agent.id} onClick={() => handleBulkAssign(agent.id, agent.name)}>
                  {agent.name}
                </DropdownMenuItem>
              ))
            ) : (
              <DropdownMenuItem disabled>Sem agentes</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Type */}
        {showTypeAction && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="secondary"
                disabled={isProcessing || !typePermission}
                title={typePermission ? undefined : 'Você não pode alterar o tipo destes contatos'}
              >
                <Star className="w-3.5 h-3.5 mr-1" />
                Tipo
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {CONTACT_TYPES.map(({ value, label }) => (
                <DropdownMenuItem key={value} onClick={() => handleBulkType(value)}>
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Delete */}
        <Button
          size="sm"
          variant="destructive"
          disabled={isProcessing || !canDeleteSelection}
          title={canDeleteSelection ? undefined : 'Nenhum dos contatos selecionados pode ser excluído por você'}
          onClick={handleBulkDelete}
        >
          <Trash2 className="w-3.5 h-3.5 mr-1" />
          Excluir
        </Button>

        {/* Close */}
        <Button size="icon" variant="ghost" className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/20" onClick={onClearSelection}>
          <X className="w-4 h-4" />
        </Button>
      </motion.div>
    </AnimatePresence>
  );
}

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

interface BulkActionsBarProps {
  selectedIds: string[];
  onClearSelection: () => void;
  onActionComplete: () => void;
  availableTags?: string[];
  availableAgents?: { id: string; name: string }[];
}

export function BulkActionsBar({
  selectedIds,
  onClearSelection,
  onActionComplete,
  availableTags = [],
  availableAgents = [],
}: BulkActionsBarProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const count = selectedIds.length;

  const handleBulkTag = useCallback(async (tag: string) => {
    setIsProcessing(true);
    try {
      // Add tag to each selected contact
      const updates = selectedIds.map(id =>
        supabase.from('contacts').select('tags').eq('id', id).single()
      );
      const results = await Promise.all(updates);
      
      const tagUpdates = results.map((r, i) => {
        const currentTags = (r.data?.tags as string[]) || [];
        if (!currentTags.includes(tag)) {
          return supabase
            .from('contacts')
            .update({ tags: [...currentTags, tag] })
            .eq('id', selectedIds[i]);
        }
        return null;
      }).filter(Boolean);

      await Promise.all(tagUpdates);
      toast.success(`Tag "${tag}" adicionada a ${count} contatos`);
      onActionComplete();
    } catch {
      toast.error('Erro ao adicionar tags');
    } finally {
      setIsProcessing(false);
    }
  }, [selectedIds, count, onActionComplete]);

  const handleBulkAssign = useCallback(async (agentId: string, agentName: string) => {
    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from('contacts')
        .update({ assigned_to: agentId })
        .in('id', selectedIds);

      if (error) throw error;
      toast.success(`${count} contatos atribuídos a ${agentName}`);
      onActionComplete();
    } catch {
      toast.error('Erro ao atribuir contatos');
    } finally {
      setIsProcessing(false);
    }
  }, [selectedIds, count, onActionComplete]);

  const handleBulkType = useCallback(async (contactType: string) => {
    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from('contacts')
        .update({ contact_type: contactType })
        .in('id', selectedIds);

      if (error) throw error;
      toast.success(`${count} contatos atualizados para "${contactType}"`);
      onActionComplete();
    } catch {
      toast.error('Erro ao atualizar tipo');
    } finally {
      setIsProcessing(false);
    }
  }, [selectedIds, count, onActionComplete]);

  const handleBulkDelete = useCallback(async () => {
    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from('contacts')
        .delete()
        .in('id', selectedIds);

      if (error) throw error;
      toast.success(`${count} contatos removidos`);
      onClearSelection();
      onActionComplete();
    } catch {
      toast.error('Erro ao remover contatos');
    } finally {
      setIsProcessing(false);
    }
  }, [selectedIds, count, onClearSelection, onActionComplete]);

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
              availableTags.slice(0, 10).map(tag => (
                <DropdownMenuItem key={tag} onClick={() => handleBulkTag(tag)}>
                  {tag}
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="secondary" disabled={isProcessing}>
              <Star className="w-3.5 h-3.5 mr-1" />
              Tipo
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {['cliente', 'lead', 'fornecedor', 'colaborador', 'parceiro'].map(type => (
              <DropdownMenuItem key={type} onClick={() => handleBulkType(type)}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Delete */}
        <Button size="sm" variant="destructive" disabled={isProcessing} onClick={handleBulkDelete}>
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

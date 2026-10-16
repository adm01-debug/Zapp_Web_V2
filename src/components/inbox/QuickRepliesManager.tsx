import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, Star, Plus, X, MessageSquare, Folder, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useQuickReplies, QuickReplyTemplate, CreateTemplateInput } from '@/hooks/chat/useQuickReplies';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { QuickReplyCardList } from './quick-replies/QuickReplyCardList';
import { QuickReplyDialog } from './quick-replies/QuickReplyDialog';

interface QuickRepliesManagerProps {
  onSelect?: (content: string) => void;
  compact?: boolean;
}

export function QuickRepliesManager({ onSelect, compact = false }: QuickRepliesManagerProps) {
  const {
    templates, filteredTemplates, favoriteTemplates, recentTemplates,
    searchQuery, setSearchQuery, isLoading,
    createTemplate, updateTemplate, deleteTemplate,
    toggleFavorite, isFavorite, incrementUseCount,
    isCreating, isUpdating,
  } = useQuickReplies();

  const [activeTab, setActiveTab] = useState('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<QuickReplyTemplate | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<QuickReplyTemplate | null>(null);

  const copyToClipboard = async (content: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(content);
      return true;
    } catch {
      return false;
    }
  };

  const handleSelect = async (template: QuickReplyTemplate) => {
    incrementUseCount(template.id);
    // Com Composer, o clique no corpo insere a resposta na mensagem.
    if (onSelect) {
      onSelect(template.content);
      toast.success('Resposta inserida no chat!');
      return;
    }
    // Sem Composer (ex.: Configurações → Mensagens) o corpo do card é a cópia:
    // anuncia só depois de a escrita voltar.
    const copied = await copyToClipboard(template.content);
    if (copied) toast.success('Resposta copiada!');
    else toast.error('Não foi possível copiar a resposta');
  };

  const handleCopy = async (content: string) => {
    const copied = await copyToClipboard(content);
    if (copied) toast.success('Copiado para a área de transferência!');
    else toast.error('Não foi possível copiar para a área de transferência');
  };

  const displayedTemplates = useMemo(() => {
    if (activeTab === 'favorites') return favoriteTemplates;
    if (activeTab === 'recent') return recentTemplates;
    return filteredTemplates;
  }, [activeTab, filteredTemplates, favoriteTemplates, recentTemplates]);

  const groupedByCategory = useMemo(() => {
    const grouped: Record<string, QuickReplyTemplate[]> = {};
    displayedTemplates.forEach(t => {
      const cat = t.category || 'geral';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(t);
    });
    return grouped;
  }, [displayedTemplates]);

  const closeDialog = () => { setShowCreateDialog(false); setEditingTemplate(null); };

  const confirmDelete = () => {
    if (pendingDelete) void deleteTemplate(pendingDelete.id);
    setPendingDelete(null);
  };

  const requestDelete = (id: string) => {
    const template = displayedTemplates.find((t) => t.id === id) ?? templates?.find((t) => t.id === id);
    if (template) setPendingDelete(template);
    else void deleteTemplate(id);
  };

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar respostas..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-9" />
        </div>
        <ScrollArea className="h-[200px]">
          <div className="space-y-1">
            {displayedTemplates.map((template) => (
              <div key={template.id} className="flex items-center gap-1 rounded-lg hover:bg-muted/50 transition-colors group">
                <motion.button type="button" whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} onClick={() => handleSelect(template)} className="flex-1 min-w-0 p-2 text-left rounded-lg">
                  <span className="font-medium text-sm truncate block">{template.title}</span>
                  <p className="text-xs text-muted-foreground truncate">{template.content}</p>
                </motion.button>
                <button
                  type="button"
                  aria-pressed={isFavorite(template.id)}
                  aria-label={isFavorite(template.id) ? `Remover ${template.title} dos favoritos` : `Favoritar ${template.title}`}
                  onClick={() => toggleFavorite(template.id)}
                  className="shrink-0 p-1.5 rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Star className={cn("w-3.5 h-3.5", isFavorite(template.id) && "fill-yellow-400 text-warning")} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Respostas Rápidas</h3>
          <Badge variant="secondary" className="text-xs">{templates?.length || 0}</Badge>
        </div>
        <Button size="sm" onClick={() => setShowCreateDialog(true)} className="gap-1"><Plus className="w-4 h-4" />Nova</Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar por título, conteúdo ou atalho..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
        {searchQuery && <Button variant="ghost" size="sm" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0" onClick={() => setSearchQuery('')}><X className="w-4 h-4" /></Button>}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full">
          <TabsTrigger value="all" className="flex-1 gap-1"><Folder className="w-3.5 h-3.5" />Todas</TabsTrigger>
          <TabsTrigger value="favorites" className="flex-1 gap-1"><Star className="w-3.5 h-3.5" />Favoritas</TabsTrigger>
          <TabsTrigger value="recent" className="flex-1 gap-1"><TrendingUp className="w-3.5 h-3.5" />Mais Usadas</TabsTrigger>
        </TabsList>
        <TabsContent value={activeTab} className="mt-4">
          <QuickReplyCardList templates={displayedTemplates} groupedByCategory={groupedByCategory} isLoading={isLoading} activeTab={activeTab} searchQuery={searchQuery}
            isFavorite={isFavorite} onSelect={handleSelect} onToggleFavorite={toggleFavorite} onCopy={handleCopy}
            onEdit={(t) => setEditingTemplate(t)} onDelete={requestDelete} onShowCreate={() => setShowCreateDialog(true)} />
        </TabsContent>
      </Tabs>

      <QuickReplyDialog
        open={showCreateDialog || !!editingTemplate}
        editingTemplate={editingTemplate}
        isSubmitting={isCreating || isUpdating}
        onClose={closeDialog}
        onCreate={async (data) => { await createTemplate(data); }}
        onUpdate={async (id, data) => { await updateTemplate({ id, ...data }); }}
      />

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir resposta rápida?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? `"${pendingDelete.title}" será excluída. Esta ação não pode ser desfeita.` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Star, Trash2, Edit2, Copy, Clock, TrendingUp, Sparkles,
} from 'lucide-react';
import { QuickReplyTemplate } from '@/hooks/chat/useQuickReplies';
import { cn } from '@/lib/utils';

interface QuickReplyCardListProps {
  templates: QuickReplyTemplate[];
  groupedByCategory: Record<string, QuickReplyTemplate[]>;
  isLoading: boolean;
  activeTab: string;
  searchQuery: string;
  isFavorite: (id: string) => boolean;
  onSelect: (template: QuickReplyTemplate) => void;
  onToggleFavorite: (id: string) => void;
  onCopy: (content: string) => void;
  onEdit: (template: QuickReplyTemplate) => void;
  onDelete: (id: string) => void;
  onShowCreate: () => void;
}

export function QuickReplyCardList({
  templates, groupedByCategory, isLoading, activeTab, searchQuery,
  isFavorite, onSelect, onToggleFavorite, onCopy, onEdit, onDelete, onShowCreate,
}: QuickReplyCardListProps) {
  if (isLoading) {
    return (
      <ScrollArea className="h-[400px] pr-4">
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted/50 rounded-lg animate-pulse" />
          ))}
        </div>
      </ScrollArea>
    );
  }

  if (templates.length === 0) {
    return (
      <ScrollArea className="h-[400px] pr-4">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Sparkles className="w-12 h-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">
            {activeTab === 'favorites' ? 'Nenhuma resposta favorita ainda' : searchQuery ? 'Nenhum resultado encontrado' : 'Nenhuma resposta criada'}
          </p>
          {activeTab !== 'favorites' && !searchQuery && (
            <Button variant="outline" size="sm" className="mt-4" onClick={onShowCreate}>Criar primeira resposta</Button>
          )}
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="h-[400px] pr-4">
      <div className="space-y-4">
        {Object.entries(groupedByCategory).map(([category, items]) => (
          <div key={category}>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="text-xs">{category}</Badge>
              <span className="text-xs text-muted-foreground">{items.length} {items.length === 1 ? 'item' : 'itens'}</span>
            </div>
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {items.map((template) => (
                  <motion.div
                    key={template.id} layout
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                    className={cn(
                      "p-3 rounded-xl border border-border/50 bg-card hover:border-primary/30 transition-all group cursor-pointer",
                      isFavorite(template.id) && "border-yellow-400/30 bg-warning/5"
                    )}
                    onClick={() => onSelect(template)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium truncate">{template.title}</span>
                          {template.shortcut && <kbd className="px-1.5 py-0.5 text-3xs bg-muted rounded">{template.shortcut}</kbd>}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">{template.content}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" />{template.use_count || 0} usos</span>
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(template.updated_at).toLocaleDateString('pt-BR')}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); onToggleFavorite(template.id); }}>
                          <Star className={cn("w-4 h-4", isFavorite(template.id) && "fill-yellow-400 text-warning")} />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); onCopy(template.content); }}>
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); onEdit(template); }}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(template.id); }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

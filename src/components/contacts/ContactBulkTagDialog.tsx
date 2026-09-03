import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tag, Plus, Minus, Loader2, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ContactBulkTagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactIds: string[];
  allTags: string[];
  onComplete: () => void;
}

export function ContactBulkTagDialog({
  open, onOpenChange, contactIds, allTags, onComplete,
}: ContactBulkTagDialogProps) {
  const [mode, setMode] = useState<'add' | 'remove'>('add');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [newTag, setNewTag] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const filteredTags = useMemo(() => {
    const all = [...new Set([...allTags, ...(newTag.trim() ? [newTag.trim()] : [])])];
    if (!search) return all;
    return all.filter(t => t.toLowerCase().includes(search.toLowerCase()));
  }, [allTags, newTag, search]);

  const toggleTag = (tag: string) => {
    const next = new Set(selectedTags);
    if (next.has(tag)) {
      next.delete(tag);
    } else {
      next.add(tag);
    }
    setSelectedTags(next);
  };

  const addNewTag = () => {
    if (!newTag.trim()) return;
    setSelectedTags(prev => new Set(prev).add(newTag.trim()));
    setNewTag('');
  };

  const handleApply = async () => {
    if (selectedTags.size === 0) return;
    setSaving(true);
    try {
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, tags')
        .in('id', contactIds);

      if (!contacts) throw new Error('Erro ao buscar contatos');

      for (const contact of contacts) {
        const current = new Set(contact.tags || []);
        if (mode === 'add') {
          selectedTags.forEach(t => current.add(t));
        } else {
          selectedTags.forEach(t => current.delete(t));
        }
        await supabase
          .from('contacts')
          .update({ tags: [...current] })
          .eq('id', contact.id);
      }

      toast.success(
        mode === 'add'
          ? `${selectedTags.size} tag(s) adicionada(s) a ${contactIds.length} contatos`
          : `${selectedTags.size} tag(s) removida(s) de ${contactIds.length} contatos`
      );
      onComplete();
      onOpenChange(false);
      setSelectedTags(new Set());
    } catch {
      toast.error('Erro ao atualizar tags');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-primary" />
            Tags em Lote
          </DialogTitle>
          <DialogDescription>
            {mode === 'add' ? 'Adicionar' : 'Remover'} tags de {contactIds.length} contato(s)
          </DialogDescription>
        </DialogHeader>

        {/* Mode Toggle */}
        <div className="flex gap-2">
          <Button
            variant={mode === 'add' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('add')}
            className="flex-1 gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Adicionar
          </Button>
          <Button
            variant={mode === 'remove' ? 'destructive' : 'outline'}
            size="sm"
            onClick={() => setMode('remove')}
            className="flex-1 gap-1.5"
          >
            <Minus className="w-3.5 h-3.5" />
            Remover
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar tags..."
            className="pl-9 h-8 text-xs"
          />
        </div>

        {/* Tag List */}
        <ScrollArea className="h-48">
          <div className="space-y-1">
            <AnimatePresence>
              {filteredTags.map(tag => (
                <motion.label
                  key={tag}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className={cn(
                    'flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors',
                    selectedTags.has(tag) ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted/50'
                  )}
                >
                  <Checkbox
                    checked={selectedTags.has(tag)}
                    onCheckedChange={() => toggleTag(tag)}
                    className="w-3.5 h-3.5"
                  />
                  <Badge variant="secondary" className="text-xs">{tag}</Badge>
                </motion.label>
              ))}
            </AnimatePresence>
          </div>
        </ScrollArea>

        {/* Add New Tag */}
        {mode === 'add' && (
          <div className="flex gap-2">
            <Input
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addNewTag()}
              placeholder="Nova tag..."
              className="h-8 text-xs flex-1"
            />
            <Button variant="outline" size="sm" onClick={addNewTag} disabled={!newTag.trim()}>
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}

        {/* Selected Summary */}
        {selectedTags.size > 0 && (
          <div className="flex flex-wrap gap-1">
            {[...selectedTags].map(t => (
              <Badge
                key={t}
                variant={mode === 'add' ? 'default' : 'destructive'}
                className="text-[10px] h-5 cursor-pointer"
                onClick={() => toggleTag(t)}
              >
                {t} ×
              </Badge>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={handleApply}
            disabled={saving || selectedTags.size === 0}
            className="gap-1.5"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === 'add' ? <Plus className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
            {mode === 'add' ? 'Adicionar' : 'Remover'} {selectedTags.size} Tag(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

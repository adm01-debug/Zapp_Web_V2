import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Tag, TagsIcon, X } from 'lucide-react';
import { sidebarSectionVariants } from './sidebar/sidebarSections';

interface ContactTagsSectionProps {
  index?: number;
  tags: string[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
}

/**
 * Seção "Tags" do painel de detalhes (restaurada no #241 — o PR #1654 tirou
 * junto com o accordion antigo). Os chips e a escrita vêm do hook
 * `useContactQuickActions` em `ContactDetails`: remover (X) e adicionar
 * (Enter no input) persistem em `contacts.tags`.
 */
export function ContactTagsSection({ index = 3, tags, onAddTag, onRemoveTag }: ContactTagsSectionProps) {
  const [draft, setDraft] = useState('');
  const reduceMotion = useReducedMotion();

  const submit = () => {
    const tag = draft.trim();
    if (!tag) return;
    setDraft('');
    onAddTag(tag);
  };

  return (
    <motion.div
      custom={index}
      initial={reduceMotion ? false : 'hidden'}
      animate="visible"
      variants={sidebarSectionVariants}
    >
      <AccordionItem
        value="tags"
        data-testid="sidebar-section-tags"
        className="mx-4 mb-3 rounded-xl border border-border bg-muted/20 overflow-hidden"
      >
        <AccordionTrigger className="px-3 py-3 hover:no-underline hover:bg-transparent [&>svg]:w-3.5 [&>svg]:h-3.5 [&>svg]:text-muted-foreground">
          <div className="flex items-center gap-2.5 text-left min-w-0">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-primary/15 text-primary [&>svg]:w-4 [&>svg]:h-4"><Tag /></div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground leading-tight">Tags</div>
              <div className="text-xs text-muted-foreground truncate">Marcadores locais do contato</div>
            </div>
            {tags.length > 0 && (
              <span className="text-3xs bg-primary/10 text-primary rounded-full px-1.5 py-0.5 font-semibold shrink-0">{tags.length}</span>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-3 pb-3">
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="flex items-center gap-1 bg-primary/10 border border-primary/20 text-foreground hover:bg-primary/20 transition-all cursor-default"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />{tag}
                <button
                  type="button"
                  aria-label={`Remover tag ${tag}`}
                  onClick={() => onRemoveTag(tag)}
                  className="ml-0.5 rounded-full hover:text-destructive transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
            {tags.length === 0 && (
              <div className="flex flex-col items-center gap-1.5 w-full py-4 text-center">
                <div className="w-10 h-10 rounded-full bg-muted/20 flex items-center justify-center"><TagsIcon className="w-5 h-5 text-muted-foreground/30" /></div>
                <p className="text-xs text-muted-foreground">Nenhuma tag adicionada</p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Nova tag"
              aria-label="Nova tag"
              className="h-7 text-xs"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Adicionar tag"
              onClick={submit}
              className="h-7 text-xs shrink-0 hover:bg-primary/10 hover:text-primary border border-dashed border-border/40 hover:border-primary/30"
            >
              <Plus className="w-3 h-3 mr-1" />Adicionar
            </Button>
          </div>
        </AccordionContent>
      </AccordionItem>
    </motion.div>
  );
}

import { useState, useMemo } from 'react';
import { log } from '@/lib/logger';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Edit2, Copy, Search, Folder, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { AVAILABLE_VARIABLES, replaceVariables } from './template-utils';
import { TemplateEditorDialog, VariableInserter, TemplatePreview } from './templates/TemplateEditorDialog';
import type { Template } from './templates/TemplateEditorDialog';

// Variable highlighter
function VariableHighlighter({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(\{\{[^}]+\}\})/g);
  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (part.match(/^\{\{[^}]+\}\}$/)) {
          return <Badge key={index} variant="secondary" className="mx-0.5 text-xs font-mono">{part.slice(2, -2)}</Badge>;
        }
        return <span key={index}>{part}</span>;
      })}
    </span>
  );
}

interface TemplateWithVariablesProps {
  templates: Template[];
  onUseTemplate: (content: string, variables: Record<string, string>) => void;
  contactData?: { name?: string; company?: string; job_title?: string };
}

export function TemplatesWithVariables({ templates, onUseTemplate, contactData }: TemplateWithVariablesProps) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

  const filteredTemplates = useMemo(() => {
    return templates.filter(t => {
      const matchesSearch = !search || t.title.toLowerCase().includes(search.toLowerCase()) || t.content.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === 'all' || t.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [templates, search, categoryFilter]);

  const categories = useMemo(() => ['all', ...Array.from(new Set(templates.map(t => t.category)))], [templates]);

  const handleUseTemplate = (template: Template) => {
    const processedContent = replaceVariables(template.content, contactData);
    onUseTemplate(processedContent, {});
    toast.success(`Template "${template.title}" aplicado!`);
  };

  const handleSave = async (data: Partial<Template>) => {
    log.debug('Saving template:', { ...editingTemplate, ...data });
    toast.success(editingTemplate ? 'Template atualizado!' : 'Template criado!');
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><FileText className="w-5 h-5" />Templates com Variáveis</CardTitle>
            <CardDescription>Mensagens dinâmicas com dados do contato</CardDescription>
          </div>
          <Button size="sm" onClick={() => { setEditingTemplate(null); setEditorOpen(true); }}><Plus className="w-4 h-4 mr-1" />Novo</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar templates..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-32"><Folder className="w-4 h-4 mr-2" /><SelectValue /></SelectTrigger>
            <SelectContent>{categories.map(cat => <SelectItem key={cat} value={cat}>{cat === 'all' ? 'Todas' : cat.charAt(0).toUpperCase() + cat.slice(1)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <ScrollArea className="h-64">
          <div className="space-y-2">
            <AnimatePresence>
              {filteredTemplates.map((template, index) => (
                <motion.div key={template.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ delay: index * 0.05 }}
                  className="p-3 rounded-lg border hover:border-primary/50 transition-colors group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-sm truncate">{template.title}</h4>
                        <Badge variant="secondary" className="text-xs">{template.category}</Badge>
                        {template.shortcut && <Badge variant="outline" className="text-xs font-mono">/{template.shortcut}</Badge>}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground line-clamp-2"><VariableHighlighter text={template.content} /></div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingTemplate(template); setEditorOpen(true); }}><Edit2 className="w-3 h-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleUseTemplate(template)}><Copy className="w-3 h-3" /></Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {filteredTemplates.length === 0 && (
              <div className="text-center py-8 text-muted-foreground"><FileText className="w-10 h-10 mx-auto mb-2 opacity-50" /><p>Nenhum template encontrado</p></div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
      <TemplateEditorDialog open={editorOpen} onOpenChange={setEditorOpen} template={editingTemplate} onSave={handleSave} />
    </Card>
  );
}

export { VariableHighlighter, TemplatePreview, VariableInserter, replaceVariables, AVAILABLE_VARIABLES };

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Sparkles, Loader2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { AVAILABLE_VARIABLES, replaceVariables, extractVariables } from '../template-utils';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface Template {
  id: string;
  title: string;
  content: string;
  category: string;
  shortcut: string | null;
  is_global: boolean;
  use_count: number;
  created_at: string;
  updated_at: string;
}

function VariableInserter({ onInsert, className }: { onInsert: (variable: string) => void; className?: string }) {
  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      <TooltipProvider>
        {AVAILABLE_VARIABLES.map((v) => {
          const Icon = v.icon;
          return (
            <Tooltip key={v.key}>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => onInsert(`{{${v.key}}}`)}>
                  <Icon className="w-3 h-3" />{v.label}
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>Exemplo: {v.example}</p></TooltipContent>
            </Tooltip>
          );
        })}
      </TooltipProvider>
    </div>
  );
}

function TemplatePreview({ content, contactData, className }: { content: string; contactData?: { name?: string; company?: string; job_title?: string }; className?: string }) {
  const previewContent = replaceVariables(content, contactData);
  return (
    <div className={cn('p-3 rounded-lg bg-muted/50 border text-sm', className)}>
      <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground"><Eye className="w-3 h-3" />Preview com dados do contato</div>
      <p className="whitespace-pre-wrap">{previewContent}</p>
    </div>
  );
}

interface TemplateEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: Template | null;
  onSave: (data: Partial<Template>) => Promise<void>;
}

export function TemplateEditorDialog({ open, onOpenChange, template, onSave }: TemplateEditorDialogProps) {
  const [title, setTitle] = useState(template?.title || '');
  const [content, setContent] = useState(template?.content || '');
  const [category, setCategory] = useState(template?.category || 'geral');
  const [shortcut, setShortcut] = useState(template?.shortcut || '');
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleInsertVariable = (variable: string) => {
    if (textareaRef.current) {
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      const newContent = content.slice(0, start) + variable + content.slice(end);
      setContent(newContent);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(start + variable.length, start + variable.length);
        }
      }, 0);
    } else {
      setContent(content + variable);
    }
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) { toast.error('Preencha título e conteúdo'); return; }
    setIsSaving(true);
    try {
      await onSave({ title, content, category, shortcut: shortcut || null });
      onOpenChange(false);
    } finally { setIsSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? 'Editar Template' : 'Novo Template'}</DialogTitle>
          <DialogDescription>Use variáveis dinâmicas para personalizar suas mensagens</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2"><Label>Título</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Boas-vindas Inicial" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="geral">Geral</SelectItem>
                  <SelectItem value="vendas">Vendas</SelectItem>
                  <SelectItem value="suporte">Suporte</SelectItem>
                  <SelectItem value="cobranca">Cobrança</SelectItem>
                  <SelectItem value="followup">Follow-up</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Atalho (opcional)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">/</span>
                <Input value={shortcut} onChange={(e) => setShortcut(e.target.value.replace(/[^a-z0-9]/gi, '').toLowerCase())} placeholder="boasvindas" className="pl-7" />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" />Variáveis Disponíveis</Label>
            <VariableInserter onInsert={handleInsertVariable} />
          </div>
          <div className="space-y-2">
            <Label>Conteúdo</Label>
            <Textarea ref={textareaRef} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Digite sua mensagem... Use {{variavel}} para inserir dados dinâmicos" rows={6} className="font-mono text-sm" />
            <p className="text-xs text-muted-foreground">Variáveis detectadas: {extractVariables(content).length > 0 ? extractVariables(content).map(v => `{{${v}}}`).join(', ') : 'Nenhuma'}</p>
          </div>
          {content && (
            <div className="space-y-2">
              <Label>Preview</Label>
              <TemplatePreview content={content} contactData={{ name: 'João Silva', company: 'Tech Corp', job_title: 'Gerente Comercial' }} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isSaving}>{isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { VariableInserter, TemplatePreview };
export type { Template };

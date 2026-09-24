import { useState } from 'react';
import { useContactCustomFields } from '@/hooks/crm/useContactCustomFields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, X, Pencil, Check, Loader2, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

interface CustomFieldsSectionProps {
  contactId: string;
}

export function CustomFieldsSection({ contactId }: CustomFieldsSectionProps) {
  const { fields, isLoading, addField, removeField } = useContactCustomFields(contactId);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!newName.trim() || !newValue.trim()) return;
    setSaving(true);
    try {
      await addField(newName.trim(), newValue.trim());
      setNewName('');
      setNewValue('');
      setIsAdding(false);
      toast.success('Campo adicionado');
    } catch {
      toast.error('Erro ao adicionar campo');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (fieldId: string) => {
    try {
      await removeField(fieldId);
      toast.success('Campo removido');
    } catch {
      toast.error('Erro ao remover campo');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Button
          variant="ghost"
          size="icon"
          className="w-6 h-6 hover:bg-primary/10 hover:text-primary"
          onClick={() => setIsAdding(!isAdding)}
        >
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2 overflow-hidden"
          >
            <Input
              placeholder="Nome do campo (ex: CPF)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-8 text-sm border-border/30"
            />
            <Input
              placeholder="Valor"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              className="h-8 text-sm border-border/30"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setIsAdding(false)} className="h-7 text-xs">
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={!newName.trim() || !newValue.trim() || saving}
                className="h-7 text-xs bg-primary hover:bg-primary/90"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 mr-1" />}
                Salvar
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="flex items-center justify-center py-3">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : fields.length === 0 && !isAdding ? (
        <p className="text-xs text-muted-foreground italic">Nenhum campo personalizado</p>
      ) : (
        <div className="space-y-2">
          {fields.map((field) => (
            <motion.div
              key={field.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center justify-between bg-muted/20 rounded-lg p-2.5 group hover:bg-muted/30 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <span className="text-3xs uppercase tracking-wider text-muted-foreground font-medium">
                  {field.field_name}
                </span>
                <p className="text-sm text-foreground truncate">{field.field_value}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive"
                onClick={() => handleRemove(field.id)}
              >
                <X className="w-3 h-3" />
              </Button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

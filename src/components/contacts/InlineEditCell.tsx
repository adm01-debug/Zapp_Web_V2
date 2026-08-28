import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Check, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface InlineEditCellProps {
  contactId: string;
  field: string;
  value: string;
  onUpdate: () => void;
}

export function InlineEditCell({ contactId, field, value, onUpdate }: InlineEditCellProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const save = async () => {
    if (editValue === value) { setEditing(false); return; }
    setSaving(true);
    const { error } = await supabase
      .from('contacts')
      .update({ [field]: editValue || null })
      .eq('id', contactId);

    if (error) {
      toast.error('Erro ao salvar');
    } else {
      toast.success('Atualizado!');
      onUpdate();
    }
    setSaving(false);
    setEditing(false);
  };

  const cancel = () => {
    setEditValue(value);
    setEditing(false);
  };

  if (!editing) {
    return (
      <span
        onDoubleClick={() => setEditing(true)}
        className="cursor-pointer hover:bg-primary/5 rounded px-1 -mx-1 transition-colors truncate block"
        title="Duplo clique para editar"
      >
        {value || <span className="text-muted-foreground/40 italic">—</span>}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        ref={inputRef}
        value={editValue}
        onChange={e => setEditValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
        className="h-7 text-xs px-2"
        disabled={saving}
      />
      <button onClick={save} disabled={saving} className="p-0.5 text-primary hover:text-primary/80">
        <Check className="w-3.5 h-3.5" />
      </button>
      <button onClick={cancel} className="p-0.5 text-muted-foreground hover:text-foreground">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

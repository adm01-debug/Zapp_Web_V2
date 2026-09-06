import { useState, useCallback } from 'react';
import { Phone, Mail, Calendar, Building, Briefcase, Pencil, Check, X, Plus, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { EnrichedContactData } from '@/hooks/crm/useContactEnrichedData';

interface ContactInfoSectionProps {
  contact: {
    id: string;
    phone: string;
    email?: string | null;
    createdAt?: Date;
  };
  enrichedData: EnrichedContactData | null | undefined;
}

interface EditableFieldProps {
  value: string;
  icon: React.ReactNode;
  onSave: (value: string) => Promise<void>;
  placeholder?: string;
  label: string;
}

function EditableField({ value, icon, onSave, placeholder, label }: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (draft.trim() === value) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(draft.trim());
      toast.success('Campo atualizado!');
      setEditing(false);
    } catch {
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }, [draft, value, onSave]);

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 bg-muted/30 rounded-lg p-1.5">
        <div className="pl-1 text-primary">{icon}</div>
        <Input
          variant="ghost"
          inputSize="sm"
          className="h-7 text-sm flex-1"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
          autoFocus
          disabled={saving}
          placeholder={placeholder}
        />
        <Button variant="ghost" size="icon" className="w-6 h-6 text-success hover:bg-success/10" onClick={handleSave} disabled={saving}>
          <Check className="w-3 h-3" />
        </Button>
        <Button variant="ghost" size="icon" className="w-6 h-6 text-destructive hover:bg-destructive/10" onClick={() => { setDraft(value); setEditing(false); }}>
          <X className="w-3 h-3" />
        </Button>
      </div>
    );
  }

  // Empty state — show as discrete add button
  if (!value) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-2 text-xs text-muted-foreground/60 hover:text-primary hover:bg-primary/5 rounded-lg p-2 w-full transition-all group"
      >
        <span className="text-muted-foreground/40 group-hover:text-primary transition-colors">{icon}</span>
        <Plus className="w-3 h-3" />
        <span>{placeholder || `Adicionar ${label}`}</span>
      </button>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 text-sm bg-muted/20 rounded-lg p-2.5 hover:bg-muted/30 transition-colors group cursor-pointer">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-primary shrink-0">{icon}</span>
        <span className="text-foreground truncate">{value}</span>
      </div>
      <Button variant="ghost" size="icon" className="w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={() => setEditing(true)}>
        <Pencil className="w-3 h-3 text-muted-foreground" />
      </Button>
    </div>
  );
}

export function ContactInfoSection({ contact, enrichedData }: ContactInfoSectionProps) {
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  const updateContact = useCallback(async (field: string, value: string) => {
    const { error } = await supabase.from('contacts').update({ [field]: value }).eq('id', contact.id);
    if (error) throw error;
  }, [contact.id]);

  return (
    <div className="space-y-1.5">
      {/* Phone — always visible, copyable */}
      <div
        className="flex items-center justify-between gap-2 text-sm bg-muted/20 rounded-lg p-2.5 hover:bg-muted/30 transition-colors group cursor-pointer"
        onClick={() => copyToClipboard(contact.phone, 'Telefone')}
      >
        <div className="flex items-center gap-2.5">
          <Phone className="w-4 h-4 text-primary" />
          <span className="text-foreground font-mono text-xs">{contact.phone}</span>
        </div>
        <Copy className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Email & Company in grid when both have values */}
      <div className="grid grid-cols-1 gap-1.5">
        <EditableField
          value={contact.email || ''}
          icon={<Mail className="w-4 h-4" />}
          onSave={(v) => updateContact('email', v)}
          placeholder="Adicionar email"
          label="email"
        />

        <div className="grid grid-cols-2 gap-1.5">
          <EditableField
            value={enrichedData?.company || ''}
            icon={<Building className="w-4 h-4" />}
            onSave={(v) => updateContact('company', v)}
            placeholder="Empresa"
            label="empresa"
          />
          <EditableField
            value={enrichedData?.job_title || ''}
            icon={<Briefcase className="w-4 h-4" />}
            onSave={(v) => updateContact('job_title', v)}
            placeholder="Cargo"
            label="cargo"
          />
        </div>
      </div>


      {/* Client since */}
      <div className="flex items-center gap-2.5 text-xs text-muted-foreground bg-muted/10 rounded-lg p-2">
        <Calendar className="w-3.5 h-3.5 text-primary" />
        <span>Cliente desde {contact.createdAt ? format(contact.createdAt, "MMM 'de' yyyy", { locale: ptBR }) : '—'}</span>
      </div>
    </div>
  );
}

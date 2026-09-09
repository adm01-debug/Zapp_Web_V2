import { useState, useCallback } from 'react';
import { Phone, Mail, Calendar, Building, Briefcase, Pencil, Check, X, Copy } from 'lucide-react';
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

  // Empty state — value vira link "Adicionar {campo}"
  if (!value) {
    return (
      <button onClick={() => setEditing(true)} className="flex items-center gap-2 min-h-[28px] w-full text-left group">
        <span className="flex items-center gap-1.5 w-[120px] shrink-0 text-[13px] text-muted-foreground">{icon}{label}</span>
        <span className="text-[13px] text-primary group-hover:underline">{placeholder || `Adicionar ${label}`}</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 min-h-[28px] group">
      <span className="flex items-center gap-1.5 w-[120px] shrink-0 text-[13px] text-muted-foreground">{icon}{label}</span>
      <span className="flex-1 text-[13px] text-foreground truncate">{value}</span>
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
    <div className="space-y-0.5">
      {/* Phone — always visible, copyable */}
      <div className="flex items-center gap-2 min-h-[28px] group cursor-pointer" onClick={() => copyToClipboard(contact.phone, 'Telefone')}>
        <span className="flex items-center gap-1.5 w-[120px] shrink-0 text-[13px] text-muted-foreground"><Phone className="w-3.5 h-3.5" />Telefone</span>
        <span className="flex-1 text-[13px] text-foreground font-mono truncate">{contact.phone}</span>
        <Copy className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </div>

      <EditableField
        value={contact.email || ''}
        icon={<Mail className="w-3.5 h-3.5" />}
        onSave={(v) => updateContact('email', v)}
        placeholder="Adicionar email"
        label="E-mail"
      />
      <EditableField
        value={enrichedData?.company || ''}
        icon={<Building className="w-3.5 h-3.5" />}
        onSave={(v) => updateContact('company', v)}
        placeholder="Adicionar empresa"
        label="Empresa"
      />
      <EditableField
        value={enrichedData?.job_title || ''}
        icon={<Briefcase className="w-3.5 h-3.5" />}
        onSave={(v) => updateContact('job_title', v)}
        placeholder="Adicionar cargo"
        label="Cargo"
      />

      {/* Client since */}
      <div className="flex items-center gap-2 min-h-[28px]">
        <span className="flex items-center gap-1.5 w-[120px] shrink-0 text-[13px] text-muted-foreground"><Calendar className="w-3.5 h-3.5" />Cliente desde</span>
        <span className="text-[13px] text-foreground">{contact.createdAt ? format(contact.createdAt, "MMM 'de' yyyy", { locale: ptBR }) : '—'}</span>
      </div>
    </div>
  );
}

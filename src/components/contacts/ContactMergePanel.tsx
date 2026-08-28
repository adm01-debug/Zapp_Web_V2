import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  GitMerge, ArrowRight, Check, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAvatarColor, getInitials } from '@/lib/avatar-colors';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Contact } from './types';

interface ContactMergePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: Contact[];
  onMergeComplete: () => void;
}

const MERGE_FIELDS = [
  { key: 'name', label: 'Nome' },
  { key: 'surname', label: 'Sobrenome' },
  { key: 'nickname', label: 'Apelido' },
  { key: 'phone', label: 'Telefone' },
  { key: 'email', label: 'Email' },
  { key: 'company', label: 'Empresa' },
  { key: 'job_title', label: 'Cargo' },
  { key: 'contact_type', label: 'Tipo' },
  { key: 'avatar_url', label: 'Avatar' },
] as const;

type FieldKey = typeof MERGE_FIELDS[number]['key'];

export function ContactMergePanel({ open, onOpenChange, contacts, onMergeComplete }: ContactMergePanelProps) {
  const [merging, setMerging] = useState(false);
  const [selections, setSelections] = useState<Record<FieldKey, number>>(() => {
    const defaults: Record<string, number> = {};
    MERGE_FIELDS.forEach(f => { defaults[f.key] = 0; });
    return defaults as Record<FieldKey, number>;
  });

  const [primary, secondary] = useMemo(() => {
    if (contacts.length < 2) return [null, null];
    return [contacts[0], contacts[1]];
  }, [contacts]);

  if (!primary || !secondary) return null;

  const getFieldValue = (contact: Contact, key: FieldKey): string | null => {
    const val = contact[key as keyof Contact];
    if (Array.isArray(val)) return val.join(', ');
    return val as string | null;
  };

  const handleMerge = async () => {
    setMerging(true);
    try {
      const mergedData: Record<string, any> = {};
      MERGE_FIELDS.forEach(f => {
        const sourceContact = selections[f.key] === 0 ? primary : secondary;
        const val = getFieldValue(sourceContact, f.key);
        if (val) mergedData[f.key] = val;
      });

      // Merge tags
      const allTags = [...new Set([...(primary.tags || []), ...(secondary.tags || [])])];
      mergedData.tags = allTags;

      // Update primary with merged data
      const { error: updateError } = await supabase
        .from('contacts')
        .update(mergedData)
        .eq('id', primary.id);

      if (updateError) throw updateError;

      // Move messages from secondary to primary
      await supabase
        .from('messages')
        .update({ contact_id: primary.id })
        .eq('contact_id', secondary.id);

      // Move notes
      await supabase
        .from('contact_notes')
        .update({ contact_id: primary.id })
        .eq('contact_id', secondary.id);

      // Delete secondary
      await supabase.from('contacts').delete().eq('id', secondary.id);

      toast.success('Contatos mesclados com sucesso!');
      onMergeComplete();
      onOpenChange(false);
    } catch (err) {
      toast.error('Erro ao mesclar contatos');
    } finally {
      setMerging(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="w-5 h-5 text-primary" />
            Mesclar Contatos
          </DialogTitle>
          <DialogDescription>
            Selecione qual valor manter para cada campo. O histórico será unificado.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[55vh]">
          <div className="space-y-1 pr-4">
            {/* Contact previews */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[primary, secondary].map((contact, idx) => {
                const colors = getAvatarColor(contact.name);
                return (
                  <Card key={contact.id} className={cn("border", idx === 0 ? "border-primary/30" : "border-border/50")}>
                    <CardContent className="flex items-center gap-3 p-3">
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={contact.avatar_url || undefined} />
                        <AvatarFallback className={cn(colors.bg, colors.text, 'text-sm font-bold')}>
                          {getInitials(contact.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{contact.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{contact.phone}</p>
                      </div>
                      {idx === 0 && <Badge variant="default" className="ml-auto text-[10px]">Principal</Badge>}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Separator className="my-3" />

            {/* Field-by-field selection */}
            {MERGE_FIELDS.map(field => {
              const val0 = getFieldValue(primary, field.key);
              const val1 = getFieldValue(secondary, field.key);
              if (!val0 && !val1) return null;

              return (
                <div key={field.key} className="py-2.5 border-b border-border/20 last:border-0">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {field.label}
                  </p>
                  <RadioGroup
                    value={String(selections[field.key])}
                    onValueChange={(v) => setSelections(prev => ({ ...prev, [field.key]: Number(v) }))}
                    className="grid grid-cols-2 gap-2"
                  >
                    {[val0, val1].map((val, idx) => (
                      <Label
                        key={idx}
                        htmlFor={`${field.key}-${idx}`}
                        className={cn(
                          "flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all text-sm",
                          selections[field.key] === idx
                            ? "border-primary bg-primary/5"
                            : "border-border/40 hover:border-border"
                        )}
                      >
                        <RadioGroupItem value={String(idx)} id={`${field.key}-${idx}`} />
                        <span className={cn("truncate", !val && "text-muted-foreground/40 italic")}>
                          {val || '(vazio)'}
                        </span>
                      </Label>
                    ))}
                  </RadioGroup>
                </div>
              );
            })}

            {/* Warning */}
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 mt-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-800 dark:text-amber-300">
                <p className="font-semibold">Atenção: esta ação é irreversível</p>
                <p className="mt-0.5 text-amber-700 dark:text-amber-400">
                  O contato secundário será excluído e seu histórico será migrado para o contato principal.
                </p>
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={merging}>
            Cancelar
          </Button>
          <Button onClick={handleMerge} disabled={merging} className="gap-2">
            {merging ? (
              <span className="animate-spin w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full" />
            ) : (
              <GitMerge className="w-4 h-4" />
            )}
            Mesclar Contatos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

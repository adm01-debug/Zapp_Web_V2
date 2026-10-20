import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Merge, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { mergeContactsAtomic } from '@/services/contact-merge.service';

interface Contact {
  id: string; name: string; surname?: string | null; phone: string;
  email?: string | null; company?: string | null; job_title?: string | null;
  contact_type?: string | null; tags?: string[] | null; created_at: string;
}

interface ContactMergeDialogProps {
  open: boolean; onOpenChange: (open: boolean) => void;
  contacts: Contact[]; onMergeComplete: () => void;
}

const FIELDS = [
  { key: 'name', label: 'Nome' }, { key: 'surname', label: 'Sobrenome' },
  { key: 'phone', label: 'Telefone' }, { key: 'email', label: 'Email' },
  { key: 'company', label: 'Empresa' }, { key: 'job_title', label: 'Cargo' },
  { key: 'contact_type', label: 'Tipo' },
] as const;

type FieldKey = typeof FIELDS[number]['key'];

/** Valor do campo como texto, ou '' quando vazio (null/undefined/em branco). */
function valueOf(contact: Contact, key: FieldKey): string {
  const raw = contact[key];
  return raw === null || raw === undefined ? '' : String(raw).trim();
}

/** Existe algum valor a preservar neste campo em qualquer contato? */
function fieldHasValue(contacts: Contact[], key: FieldKey): boolean {
  return contacts.some((c) => valueOf(c, key) !== '');
}

/**
 * Padrões de escolha para o contato principal dado (`primaryId`): mantém o valor
 * do principal quando ele tem valor; senão, o primeiro contato que tem; se
 * ninguém tem, cai no principal. Recalculado a cada troca de principal/contatos.
 */
function computeDefaults(contacts: Contact[], primaryId: string): Record<FieldKey, number> {
  const primaryIdx = contacts.findIndex((c) => c.id === primaryId);
  const init = {} as Record<FieldKey, number>;
  FIELDS.forEach((f) => {
    if (primaryIdx >= 0 && valueOf(contacts[primaryIdx], f.key) !== '') {
      init[f.key] = primaryIdx;
      return;
    }
    const idx = contacts.findIndex((c) => valueOf(c, f.key) !== '');
    init[f.key] = idx >= 0 ? idx : Math.max(primaryIdx, 0);
  });
  return init;
}

/**
 * CT-096 — o estado (contato principal + escolha de cada campo) vive no corpo do
 * diálogo e só é montado quando ele está aberto, com `key` pela assinatura dos
 * contatos. Assim os padrões nascem da lista REAL da mesclagem e nada sobra
 * para a próxima: o componente não fica mais montado com a lista vazia do
 * primeiro render.
 */
export function ContactMergeDialog({ open, onOpenChange, contacts, onMergeComplete }: ContactMergeDialogProps) {
  if (contacts.length < 2) return null;
  const signature = contacts.map((c) => c.id).join('|');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-lg">
        {open && (
          <MergeDialogBody
            key={signature}
            contacts={contacts}
            onOpenChange={onOpenChange}
            onMergeComplete={onMergeComplete}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface MergeDialogBodyProps {
  contacts: Contact[];
  onOpenChange: (open: boolean) => void;
  onMergeComplete: () => void;
}

function MergeDialogBody({ contacts, onOpenChange, onMergeComplete }: MergeDialogBodyProps) {
  const [primaryId, setPrimaryId] = useState(contacts[0].id);
  const [selections, setSelections] = useState<Record<FieldKey, number>>(
    () => computeDefaults(contacts, contacts[0].id),
  );
  const [merging, setMerging] = useState(false);

  const primary = contacts.find((c) => c.id === primaryId) ?? contacts[0];
  const visibleFields = FIELDS.filter((f) => fieldHasValue(contacts, f.key));

  const handlePrimaryChange = (id: string) => {
    setPrimaryId(id);
    setSelections(computeDefaults(contacts, id));
  };

  const handleMerge = async () => {
    setMerging(true);
    try {
      const merged: Record<string, string | string[]> = {};
      FIELDS.forEach((f) => {
        const val = valueOf(contacts[selections[f.key]], f.key);
        if (val !== '') merged[f.key] = val;
      });
      merged.tags = [...new Set(contacts.flatMap((c) => c.tags || []))];

      const secondaryIds = contacts.filter((c) => c.id !== primary.id).map((c) => c.id);
      await mergeContactsAtomic(primary.id, secondaryIds, merged);
      toast.success(`Contatos mesclados em "${merged.name}"`);
      onMergeComplete(); onOpenChange(false);
    } catch (err) {
      const conflict = err instanceof Error && err.message.includes('crm_contact_link_conflict');
      toast.error(conflict
        ? 'Há vínculos CRM conflitantes. Resolva-os antes de mesclar.'
        : 'Erro ao mesclar. Nenhuma alteração foi aplicada.');
    }
    finally { setMerging(false); }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Merge className="w-5 h-5 text-primary" />Mesclar Contatos</DialogTitle>
        <DialogDescription>Escolha o contato principal e qual valor manter para cada campo.</DialogDescription>
      </DialogHeader>

      <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
        <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
        <p className="text-xs text-destructive">Mensagens serão movidas para o contato principal. Ação irreversível.</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Contato principal (recebe as mensagens)</p>
        <RadioGroup value={primaryId} onValueChange={handlePrimaryChange} className="flex flex-col gap-1">
          {contacts.map((c) => (
            <Label key={c.id} htmlFor={`primary-${c.id}`}
              className={cn('flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors',
                primaryId === c.id ? 'border-primary/50 bg-primary/5' : 'border-transparent hover:bg-muted/50')}>
              <RadioGroupItem value={c.id} id={`primary-${c.id}`} />
              <span className="text-sm">{c.name}{c.phone ? ` · ${c.phone}` : ''}</span>
            </Label>
          ))}
        </RadioGroup>
      </div>

      <div className="space-y-3 max-h-[400px] overflow-y-auto">
        {visibleFields.map((field) => {
          const values = contacts
            .map((c, i) => ({ index: i, value: valueOf(c, field.key) }))
            .filter((v) => v.value !== '');
          return (
            <div key={field.key} className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">{field.label}</p>
              <RadioGroup value={String(selections[field.key])} onValueChange={v => setSelections(s => ({ ...s, [field.key]: Number.parseInt(v) }))} className="flex flex-col gap-1">
                {values.map(v => (
                  <Label key={v.index} htmlFor={`${field.key}-${v.index}`}
                    className={cn('flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors',
                      selections[field.key] === v.index ? 'border-primary/50 bg-primary/5' : 'border-transparent hover:bg-muted/50')}>
                    <RadioGroupItem value={String(v.index)} id={`${field.key}-${v.index}`} />
                    <span className="text-sm">{v.value}</span>
                    {contacts[v.index].id === primaryId && <Badge variant="secondary" className="text-3xs h-4">principal</Badge>}
                  </Label>
                ))}
              </RadioGroup>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Prévia do resultado</p>
        <ul className="space-y-0.5">
          {visibleFields.map(field => (
            <li key={field.key} className="text-sm">
              <span className="text-muted-foreground">{field.label}: </span>
              {valueOf(contacts[selections[field.key]], field.key)}
            </li>
          ))}
        </ul>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button onClick={handleMerge} disabled={merging} className="gap-2">
          {merging ? <Loader2 className="w-4 h-4 motion-safe:animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          Mesclar {contacts.length}
        </Button>
      </DialogFooter>
    </>
  );
}

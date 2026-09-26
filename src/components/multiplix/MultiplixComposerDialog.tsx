import React, { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { useMultiplixResolve } from '@/hooks/integrations/useMultiplixAudience';
import { useCreateMultiplixDispatch } from '@/hooks/integrations/useMultiplixDispatches';

const PLACEHOLDER_CHIPS = [
  { token: '{{empresa}}', label: 'Empresa' },
  { token: '{{saudacao}}', label: 'Saudação' },
];

interface MultiplixComposerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCompanyIds: string[];
  onCreated: (dispatchId: string) => void;
}

export function MultiplixComposerDialog({ open, onOpenChange, selectedCompanyIds, onCreated }: MultiplixComposerDialogProps) {
  const [name, setName] = useState('');
  const [messageTemplate, setMessageTemplate] = useState('');
  const [confirmStartOpen, setConfirmStartOpen] = useState(false);
  const resolve = useMultiplixResolve();
  const createDispatch = useCreateMultiplixDispatch();

  const busy = resolve.isPending || createDispatch.isPending;

  const reset = () => {
    setName('');
    setMessageTemplate('');
  };

  const submit = async (startNow: boolean) => {
    if (!name.trim() || !messageTemplate.trim() || selectedCompanyIds.length === 0) return;
    try {
      const resolved = await resolve.mutateAsync(selectedCompanyIds);
      const recipients = resolved.map((r) => ({
        company_id: r.company_id,
        company_name: r.company_name,
        destino_e164: r.destino_e164,
        destino_origem: r.destino_origem,
      }));
      const dispatchId = await createDispatch.mutateAsync({ name: name.trim(), messageTemplate: messageTemplate.trim(), recipients, startNow });
      toast.success(startNow ? 'Disparo criado e iniciado.' : 'Disparo salvo como rascunho.');
      reset();
      onOpenChange(false);
      onCreated(dispatchId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao criar disparo');
    }
  };

  const insertPlaceholder = (token: string) => setMessageTemplate((prev) => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}${token}`);

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo disparo Multiplix</DialogTitle>
            <DialogDescription>
              {selectedCompanyIds.length} empresa(s) selecionada(s) da busca.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Nome do disparo</span>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Convite feira 2026" />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Mensagem</span>
              <Textarea
                value={messageTemplate}
                onChange={(e) => setMessageTemplate(e.target.value)}
                placeholder="Olá {{empresa}}, {{saudacao}}!"
                rows={5}
              />
              <div className="flex gap-2 pt-1">
                {PLACEHOLDER_CHIPS.map((chip) => (
                  <Button key={chip.token} type="button" variant="outline" size="sm" onClick={() => insertPlaceholder(chip.token)}>
                    + {chip.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              disabled={busy || !name.trim() || !messageTemplate.trim()}
              onClick={() => submit(false)}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar rascunho
            </Button>
            <Button
              disabled={busy || !name.trim() || !messageTemplate.trim()}
              onClick={() => setConfirmStartOpen(true)}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar e iniciar agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmStartOpen} onOpenChange={setConfirmStartOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Iniciar disparo agora?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso envia mensagens reais no WhatsApp para {selectedCompanyIds.length} empresa(s) — sem volta. Confirma?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmStartOpen(false); submit(true); }}>
              Iniciar agora
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

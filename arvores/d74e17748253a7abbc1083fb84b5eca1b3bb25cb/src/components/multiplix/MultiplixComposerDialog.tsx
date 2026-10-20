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
import { MultiplixOverLimitError } from '@/hooks/integrations/useMultiplixAudience';
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
  const [overLimit, setOverLimit] = useState<{ count: number; limit: number | null; startNow: boolean } | null>(null);
  const createDispatch = useCreateMultiplixDispatch();

  const busy = createDispatch.isPending;

  const reset = () => {
    setName('');
    setMessageTemplate('');
  };

  // F08: o composer nao resolve o publico nem insere destinatarios — manda os
  // company_ids e a edge re-resolve com o escopo do JWT e cria na transacao.
  const submit = async (startNow: boolean, confirmOverLimit = false) => {
    if (!name.trim() || !messageTemplate.trim() || selectedCompanyIds.length === 0) return;
    try {
      const result = await createDispatch.mutateAsync({
        name: name.trim(),
        messageTemplate: messageTemplate.trim(),
        companyIds: selectedCompanyIds,
        startNow,
        confirmOverLimit,
      });
      toast.success(
        startNow
          ? `Disparo criado para ${result.recipientCount} contato(s). Envio iniciando…`
          : `Disparo salvo como rascunho (${result.recipientCount} contato(s)).`,
      );
      reset();
      onOpenChange(false);
      onCreated(result.id);
    } catch (e) {
      // F17: acima do teto de destinatarios o servidor recusa e devolve o
      // numero real; a confirmacao explicita reenvia com confirm_over_limit.
      if (e instanceof MultiplixOverLimitError) {
        setOverLimit({ count: e.count, limit: e.limit, startNow });
        return;
      }
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
            <AlertDialogAction onClick={() => { setConfirmStartOpen(false); void submit(true); }}>
              Iniciar agora
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={overLimit !== null} onOpenChange={(next) => { if (!next) setOverLimit(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disparo acima do teto de contatos</AlertDialogTitle>
            <AlertDialogDescription>
              A seleção gerou {overLimit?.count ?? 0} contato(s) elegível(is)
              {overLimit?.limit ? `, acima do teto de ${overLimit.limit}` : ''}. Confirma criar o disparo com todos?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const pending = overLimit;
                setOverLimit(null);
                if (pending) void submit(pending.startNow, true);
              }}
            >
              Confirmar e criar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

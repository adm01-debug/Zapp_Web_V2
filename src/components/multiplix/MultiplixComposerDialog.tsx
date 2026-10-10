import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { cn } from '@/lib/utils';
import { MultiplixOverLimitError } from '@/hooks/integrations/useMultiplixAudience';
import { useCreateMultiplixDispatch } from '@/hooks/integrations/useMultiplixDispatches';

const PLACEHOLDER_CHIPS = [
  { token: '{{empresa}}', label: 'Empresa' },
  { token: '{{saudacao}}', label: 'Saudação' },
];

// F76 (TL-008): o teto do servidor é capabilities().max_chars — hoje
// 65.536 caracteres. O contador exibe o progresso contra esse teto e
// bloqueia o envio quando o texto o excede.
const LIMITE_TEXTO = 65_536;

/** Autosize: altura máxima do bloco de texto antes de rolar. */
const ALTURA_MAX_TEXTO = 320;

const VARIAVEIS_CONHECIDAS = new Set(PLACEHOLDER_CHIPS.map((chip) => chip.token.slice(2, -2)));

function chavesDeVariaveis(texto: string): string[] {
  const encontradas = new Set<string>();
  let idx = texto.indexOf('{{');
  while (idx !== -1) {
    const fim = texto.indexOf('}}', idx + 2);
    if (fim === -1) break;
    encontradas.add(texto.slice(idx + 2, fim));
    idx = texto.indexOf('{{', fim + 2);
  }
  return [...encontradas];
}

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

  // F76 (TL-008): ref para o textarea do bloco de texto — usado pelo
  // autosize (useLayoutEffect) e pela inserção no cursor.
  const blocoTextoRef = useRef<HTMLTextAreaElement>(null);

  // F76 (TL-008): o contador exibe o progresso contra o teto do
  // servidor (capabilities().max_chars). Acima do limite o envio
  // fica bloqueado e o aviso fica visível.
  const excedeLimiteTexto = messageTemplate.length > LIMITE_TEXTO;

  // F76 (TL-008): variáveis desconhecidas são aquelas que não estão
  // no conjunto de chips de placeholder conhecidos. Aparecem como
  // aviso vermelho no bloco de texto.
  const variaveisDesconhecidas = useMemo(
    () => chavesDeVariaveis(messageTemplate).filter((chave) => !VARIAVEIS_CONHECIDAS.has(chave)),
    [messageTemplate],
  );

  // F78 (TL-010): a conta do disparo tem de ficar SEMPRE visivel —
  // "N contatos x M blocos = N x M mensagens". N e a selecao da tela (cada
  // empresa selecionada e um destino; o servidor devolve a contagem real de
  // destinatarios depois de resolver o publico). M e o numero de blocos da
  // composicao: hoje so existe o bloco de texto ABAIXO, e ele so conta quando
  // tem conteudo — bloco vazio nao vira mensagem. Os blocos de voz/arquivo
  // entram por F76/F77 e a conta acompanha sozinha.
  const contactCount = selectedCompanyIds.length;
  const blockCount = messageTemplate.trim() ? 1 : 0;
  const messageCount = contactCount * blockCount;
  // "mensagem" no plural troca o "m" final por "ns"; o singular fica igual.
  const messageCountLabel = messageCount === 1 ? '1 mensagem' : `${messageCount} mensagens`;

  // F78 (TL-010): titulo sugerido (publico + assunto), EDITAVEL e OPCIONAL —
  // sem nome digitado o disparo sai com a sugestao, entao da para enviar sem
  // nomear. O assunto e a primeira linha da mensagem; o publico, a selecao.
  const suggestedName = useMemo(() => {
    const assunto = messageTemplate.trim().split(/\r?\n/)[0]?.trim().slice(0, 60) ?? '';
    return ['Multiplix', `${contactCount} contato${contactCount === 1 ? '' : 's'}`, assunto]
      .filter(Boolean)
      .join(' · ');
  }, [contactCount, messageTemplate]);

  // F78 (TL-010): a exigencia de titulo NAO foi dispensada — ela continua de pe,
  // agora sobre o titulo EFETIVO (o digitado ou a sugestao). Sem digitacao o
  // disparo sai com a sugestao, entao "da para enviar sem nomear" sem furar o
  // contrato da edge (name = z.string().trim().min(1),
  // supabase/functions/multiplix-audience/index.ts:293).
  const tituloEfetivo = name.trim() || suggestedName;

  const reset = () => {
    setName('');
    setMessageTemplate('');
  };

  // F08: o composer nao resolve o publico nem insere destinatarios — manda os
  // company_ids e a edge re-resolve com o escopo do JWT e cria na transacao.
  const submit = async (startNow: boolean, confirmOverLimit = false) => {
    // O bloco de texto continua obrigatorio (unico bloco que existe) e o titulo
    // efetivo nunca e vazio — o contrato do composer nao afrouxou.
    if (!messageTemplate.trim() || !tituloEfetivo || selectedCompanyIds.length === 0) return;
    if (excedeLimiteTexto) return;
    try {
      const result = await createDispatch.mutateAsync({
        name: tituloEfetivo,
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

  // F76 (TL-008): insere a variável na posição atual do cursor,
  // sem espaço separador — "{{empresa}}{{saudacao}}", não "{{empresa}} {{saudacao}}".
  const inserirNoCursor = (token: string) => {
    const el = blocoTextoRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const before = messageTemplate.slice(0, start);
    const after = messageTemplate.slice(end);
    const inserted = before + token + after;
    setMessageTemplate(inserted);
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + token.length;
      el.focus();
    });
  };

  // F76 (TL-008): autosize — acompanha o conteúdo até ALTURA_MAX_TEXTO
  // e depois rola.
  const ajustarAlturaDoTexto = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, ALTURA_MAX_TEXTO)}px`;
  };

  useLayoutEffect(() => {
    const el = blocoTextoRef.current;
    if (el) ajustarAlturaDoTexto(el);
  }, [messageTemplate]);

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
            {/* F78 (TL-010): a conta do disparo fica SEMPRE visivel, com ou sem
                selecao/composicao — N contatos x M blocos = N x M mensagens. */}
            <p
              data-testid="multiplix-contagem-mensagens"
              aria-live="polite"
              className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground"
            >
              {`${contactCount} contato${contactCount === 1 ? '' : 's'} × ${blockCount} bloco${blockCount === 1 ? '' : 's'} = ${messageCountLabel}`}
            </p>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Nome do disparo (opcional)</span>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Convite feira 2026" />
              {/* F78 (TL-010): sem nome digitado o disparo sai com o titulo
                  sugerido (publico + assunto) — nao trava o envio. */}
              <p className="text-xs text-muted-foreground">
                Título sugerido: <span className="text-foreground">{suggestedName}</span>
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Mensagem</span>
              <Textarea
                ref={blocoTextoRef}
                value={messageTemplate}
                onChange={(e) => setMessageTemplate(e.target.value)}
                placeholder="Olá {{empresa}}, {{saudacao}}!"
                rows={5}
                aria-invalid={variaveisDesconhecidas.length > 0 || excedeLimiteTexto}
                className="resize-none"
              />
              <div className="flex gap-2 pt-1">
                {PLACEHOLDER_CHIPS.map((chip) => (
                  <Button key={chip.token} type="button" variant="outline" size="sm" onClick={() => inserirNoCursor(chip.token)}>
                    + {chip.label}
                  </Button>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    'shrink-0 text-2xs tabular-nums',
                    excedeLimiteTexto ? 'font-semibold text-dash-red' : 'text-muted-foreground',
                  )}
                >
                  {messageTemplate.length}/{LIMITE_TEXTO} caracteres
                </span>
                {variaveisDesconhecidas.length > 0 && (
                  <span role="alert" className="text-2xs text-dash-red">
                    Variáveis desconhecidas: {variaveisDesconhecidas.map((chave) => `{{${chave}}}`).join(', ')}
                  </span>
                )}
                {excedeLimiteTexto && (
                  <span role="alert" className="text-2xs text-dash-red">
                    Acima do limite de {LIMITE_TEXTO} caracteres — a revisão fica bloqueada até o texto caber no limite.
                  </span>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              disabled={busy || !tituloEfetivo || !messageTemplate.trim() || excedeLimiteTexto}
              onClick={() => submit(false)}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar rascunho
            </Button>
            <Button
              disabled={busy || !tituloEfetivo || !messageTemplate.trim() || excedeLimiteTexto}
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

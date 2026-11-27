/**
 * X050/X090 — janela de TESTE do template, uma só para o cartão, a lista e o
 * cabeçalho do editor (antes era um bloco privado do editor).
 *
 * O que a janela faz:
 *  - escolha da conexão que envia, entre as `connected` (o `talkx-send` recusa
 *    sem `connectionId` — "connectionId obrigatorio" — e confere o status);
 *  - número de destino digitado;
 *  - escolha da variação A/B/C quando o template tem variações
 *    (`talkx_template_variants`, X085) — o texto enviado é o da variação escolhida;
 *  - resultado na própria janela; 403 (sem papel) e 429 (excesso de testes) com
 *    frase própria.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Send, CheckCircle, XCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

import { TalkXDialogShell } from './kit/dialogs';

import { useConnectionOptions } from '@/hooks/connections/useConnectionOptions';
import { useTalkXTemplates, type TalkXTemplate, type TemplateVariant } from '@/hooks/integrations/useTalkXTemplates';

interface Props {
  template: TalkXTemplate;
  open: boolean;
  onClose: () => void;
  /**
   * No EDITOR o texto em edição pode ainda não estar salvo: os overrides entram
   * no lugar do conteúdo do template (e a escolha de variação não aparece, porque
   * o que vai ser enviado é o que está na tela).
   */
  contentOverride?: string;
  mediaUrlOverride?: string | null;
  mediaTypeOverride?: string | null;
  /**
   * Variáveis personalizadas do template. O EDITOR manda as da tela (podem
   * ainda não estar salvas); sem esta prop, valem as da linha
   * (`template.custom_variables`). Sem elas o `talkx-send` recebia o texto com
   * `{{variavel}}` sem valor.
   */
  customVariables?: string[];
}

export function TalkXTemplateTestDialog({ template, open, onClose, contentOverride, mediaUrlOverride, mediaTypeOverride, customVariables }: Props) {
  const { testTemplate, fetchVariants } = useTalkXTemplates();
  // Só conexões `connected`: o `talkx-send` recusa as demais com 400.
  const connections = useConnectionOptions(open, { onlyConnected: true });
  const connectionList = connections.data ?? [];

  // A janela é MONTADA a cada abertura (os dois chamadores só a renderizam com
  // `open` verdadeiro), então o estado inicial já nasce pronto — sem efeito só
  // para "resetar ao abrir", que causaria render em cascata.
  const [phone, setPhone] = useState('');
  const [connectionId, setConnectionId] = useState('');
  const connection = connectionId || (connectionList.length === 1 ? connectionList[0].id : '');
  const [variants, setVariants] = useState<TemplateVariant[]>([]);
  const [variantId, setVariantId] = useState('');
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Resposta de variações atrasada não pode cair em outra abertura da janela:
  // cada disparo ganha um número de ordem e só o último aplica estado.
  const requestSeq = useRef(0);

  /**
   * Override = o editor manda o texto que está na tela (ainda não salvo).
   * O que decide é a PROP ter sido fornecida, não o texto ter caracteres: o
   * editor sempre passa `contentOverride` (inclusive com o texto vazio), e
   * editor vazio tem de testar VAZIO (recusar com "Template vazio"), não cair
   * no conteúdo salvo do template.
   */
  const hasOverride = typeof contentOverride === 'string';

  // Variáveis personalizadas que vão junto do texto: as do editor (override) ou
  // as da própria linha do template. O `talkx-send` precisa delas para trocar
  // `{{variavel}}` pelo valor antes de enviar.
  const customVars = useMemo(
    () => customVariables ?? template.custom_variables ?? [],
    [customVariables, template.custom_variables],
  );

  useEffect(() => {
    if (!open || hasOverride) return;
    const seq = ++requestSeq.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingVariants(true);
    setVariants([]);
    fetchVariants(template.id)
      .then((rows) => { if (requestSeq.current === seq) setVariants(rows); })
      .catch(() => { if (requestSeq.current === seq) setVariants([]); })
      // O `finally` só mexe no estado da requisição ainda válida: uma resposta
      // descartada (outra abertura no meio) não prende o "Carregando…".
      .finally(() => { if (requestSeq.current === seq) setLoadingVariants(false); });
    return () => { requestSeq.current += 1; };
    // `fetchVariants` é recriada a cada render pelo hook de dados: usá-la como
    // dependência reiniciaria a busca em TODO render (loop). A origem da busca é
    // (open, template.id) e a ordem das respostas é resolvida por `requestSeq`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hasOverride, template.id]);

  const selectedVariant = variants.find((v) => v.id === variantId) ?? null;
  const content = hasOverride ? contentOverride : (selectedVariant?.content ?? template.content);
  const mediaUrl = hasOverride ? (mediaUrlOverride ?? null) : (selectedVariant ? selectedVariant.media_url : template.media_url);
  const mediaType = hasOverride ? (mediaTypeOverride ?? null) : (selectedVariant ? selectedVariant.media_type : template.media_type);
  const showVariants = !hasOverride && variants.length > 0;

  const handleTest = useCallback(async () => {
    const clean = phone.replace(/\D/g, '');
    if (!connection) { setResult({ ok: false, msg: 'Escolha a conexão que vai enviar' }); return; }
    if (clean.length < 10) { setResult({ ok: false, msg: 'Número inválido' }); return; }
    if (!content.trim()) { setResult({ ok: false, msg: 'Template vazio' }); return; }
    setTesting(true);
    setResult(null);
    try {
      await testTemplate({ templateContent: content, mediaUrl, mediaType, phone: clean, connectionId: connection, customVariables: customVars });
      setResult({ ok: true, msg: `Mensagem enviada para ${clean}` });
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : 'Erro desconhecido' });
    } finally {
      setTesting(false);
    }
  }, [phone, content, mediaUrl, mediaType, testTemplate, customVars, connection]);

  return (
    <TalkXDialogShell
      open={open}
      onClose={onClose}
      title="Testar template"
      description="Envia a mensagem personalizada para um número via WhatsApp."
      className="max-w-sm"
      footer={<>
        <button type="button" onClick={onClose} className="flex-1 h-9 rounded-lg border border-border/70 bg-input/40 text-[13px] font-medium">Fechar</button>
        <button
          type="button"
          onClick={() => void handleTest()}
          disabled={testing || !phone.trim() || !connection}
          className="flex-1 h-9 rounded-lg bg-primary text-white text-[13px] font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {testing ? 'Enviando...' : (<><Send className="w-3.5 h-3.5" /> Enviar</>)}
        </button>
      </>}
    >
      {loadingVariants ? (
        <p className="text-2xs text-muted-foreground">Carregando variações…</p>
      ) : showVariants ? (
        <div>
          <Label className="text-xs text-foreground-secondary">Texto a enviar</Label>
          <Select value={variantId || 'base'} onValueChange={(v) => setVariantId(v === 'base' ? '' : v)}>
            <SelectTrigger className="mt-1.5 h-10 bg-input/40 border-border/70"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="base">Texto-base</SelectItem>
              {variants.map((v) => <SelectItem key={v.id} value={v.id}>Variante {v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div>
        <Label className="text-xs text-foreground-secondary">Conexão que envia</Label>
        {connections.isLoading ? (
          <p className="text-2xs text-muted-foreground mt-1.5">Carregando conexões…</p>
        ) : connectionList.length === 0 ? (
          <p className="text-2xs text-dash-red mt-1.5">Nenhuma conexão conectada. Conecte um WhatsApp para testar.</p>
        ) : (
          <Select value={connection} onValueChange={setConnectionId}>
            <SelectTrigger className="mt-1.5 h-10 bg-input/40 border-border/70"><SelectValue placeholder="Escolha a conexão" /></SelectTrigger>
            <SelectContent>
              {connectionList.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      <div>
        <Label htmlFor="talkx-template-test-phone" className="text-xs text-foreground-secondary">Número de destino</Label>
        <Input
          id="talkx-template-test-phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="5541999001234"
          className="mt-1.5 h-10 bg-input/40 border-border/70 font-mono"
        />
      </div>

      {result && (
        <div
          role="status"
          className={cn('flex items-center gap-2 text-xs', result.ok ? 'text-dash-green' : 'text-dash-red')}
        >
          {result.ok ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <XCircle className="w-4 h-4 flex-shrink-0" />}
          {result.msg}
        </div>
      )}
    </TalkXDialogShell>
  );
}

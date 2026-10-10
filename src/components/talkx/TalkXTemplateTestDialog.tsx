/**
 * X090 — janela de TESTE do template, uma só para o cartão, a lista e o
 * cabeçalho do editor (antes era um `Dialog` privado do editor, `EDT:649`).
 *
 * O que a janela faz:
 *  - número de destino já preenchido com `profiles.phone` de quem está logado;
 *  - escolha da variação A/B/C quando o template tem variações (`talkx_template_variants`
 *    de X085 já existe no banco) — o texto enviado é o da variação escolhida;
 *  - resultado na própria janela; 403 (sem papel) e 429 (excesso de testes) com
 *    frase própria.
 *
 * O que ela NÃO faz (depende de Edge, proibido neste cartão): escolher a
 * conexão. O `talkx-send` (`action=test`) usa a primeira conexão `connected`
 * (`supabase/functions/talkx-send/index.ts`), então a janela não pede uma
 * escolha que o servidor ignoraria.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Send, CheckCircle, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/auth/useAuth';
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
  const { profile } = useAuth();

  // A janela é MONTADA a cada abertura (os dois chamadores só a renderizam com
  // `open` verdadeiro), então o estado inicial já nasce pronto — sem efeito só
  // para "resetar ao abrir", que causaria render em cascata.
  const [phone, setPhone] = useState(profile?.phone ?? '');
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
    if (clean.length < 10) { setResult({ ok: false, msg: 'Número inválido' }); return; }
    if (!content.trim()) { setResult({ ok: false, msg: 'Template vazio' }); return; }
    setTesting(true);
    setResult(null);
    try {
      await testTemplate({ templateContent: content, mediaUrl, mediaType, phone: clean, customVariables: customVars });
      setResult({ ok: true, msg: `Mensagem enviada para ${clean}` });
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : 'Erro desconhecido' });
    } finally {
      setTesting(false);
    }
  }, [phone, content, mediaUrl, mediaType, testTemplate, customVars]);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Testar template</DialogTitle>
          <DialogDescription>
            Envia a mensagem para um número via WhatsApp. O teste só envia pela conexão conectada no momento.
          </DialogDescription>
        </DialogHeader>

        {loadingVariants && !showVariants ? (
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
          <Label className="text-xs text-foreground-secondary">Número de destino</Label>
          <Input
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

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 h-9 rounded-lg border border-border/70 bg-input/40 text-[13px] font-medium">Fechar</button>
          <button
            type="button"
            onClick={() => void handleTest()}
            disabled={testing || !phone.trim()}
            className="flex-1 h-9 rounded-lg bg-primary text-white text-[13px] font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {testing ? 'Enviando...' : (<><Send className="w-3.5 h-3.5" /> Enviar</>)}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import React, { useState } from 'react';
import { Send, CheckCircle, XCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PrimaryButton } from '@/components/dashboard/overview/DashboardCard';
import { RailCard } from '../talkxShared';
import { validTestPhone, testSendErrorMessage } from './talkxTestSend';

/** Assinatura do `sendTest` do `useTalkX` (edge `talkx-send`, `action: "test"`). */
export type TalkXSendTest = (
  connectionId: string,
  content: string,
  phone: string,
  mediaUrl?: string | null,
  mediaType?: string | null,
  idempotencyKey?: string | null,
) => Promise<{ success?: boolean; provider_message_id?: string }>;

interface Props {
  /** Conexão WhatsApp da campanha; sem ela a Edge recusa o teste. */
  connectionId?: string | null;
  /** Mensagem da campanha (a mesma que vai para o público). */
  message: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
  sendTest: TalkXSendTest;
}

/**
 * E47: envio de teste da campanha. Antes, o caminho `action: "test"` da edge
 * `talkx-send` só era alcançável pelos templates — a campanha era lançada sem
 * nenhum operador ter visto a mensagem real chegar no WhatsApp.
 */
export function TalkXTestSendCard({ connectionId, message, mediaUrl, mediaType, sendTest }: Props) {
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const cleanPhone = validTestPhone(phone);
  const hasMessage = message.trim().length > 0;
  const canSend = Boolean(connectionId) && hasMessage && Boolean(cleanPhone) && !sending;
  const blockedReason = !connectionId
    ? 'Selecione uma conexão de WhatsApp ativa para testar.'
    : !hasMessage
      ? 'Escreva a mensagem da campanha para poder testar.'
      : null;

  async function handleSend() {
    if (!connectionId || !cleanPhone) return;
    setSending(true);
    setResult(null);
    try {
      // IA-047: chave derivada uma vez por clique — repetir o mesmo pedido não
      // pode virar um segundo POST ao provedor.
      const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : null;
      const response = await sendTest(connectionId, message, cleanPhone, mediaUrl ?? null, mediaType ?? null, idempotencyKey);
      const providerId = typeof response?.provider_message_id === 'string' ? response.provider_message_id : null;
      setResult({ ok: true, text: providerId ? `Teste enviado para ${cleanPhone} · id ${providerId.slice(0, 8)}` : `Teste enviado para ${cleanPhone}` });
    } catch (e: unknown) {
      setResult({ ok: false, text: await testSendErrorMessage(e) });
    } finally {
      setSending(false);
    }
  }

  return (
    <RailCard
      icon={Send}
      color="violet"
      title="Testar antes de lançar"
      subtitle="Envia esta mensagem, com esta mídia, para um número de confiança."
    >
      <div className="space-y-2">
        <Label htmlFor="talkx-campaign-test-phone" className="text-xs text-foreground-secondary">
          Número do teste (com DDI e DDD)
        </Label>
        <div className="flex gap-2">
          <Input
            id="talkx-campaign-test-phone"
            data-testid="talkx-test-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && canSend) { void handleSend(); } }}
            placeholder="5541999001234"
            inputMode="tel"
            autoComplete="off"
            className="h-9 bg-input/40 border-border/70 font-mono text-[13px]"
          />
          <PrimaryButton
            testid="talkx-test-send"
            onClick={() => { void handleSend(); }}
            disabled={!canSend}
            size="sm"
          >
            {sending ? 'Enviando…' : 'Enviar teste'}
          </PrimaryButton>
        </div>

        {blockedReason && <p className="text-2xs text-muted-foreground">{blockedReason}</p>}
        {!blockedReason && !cleanPhone && phone.trim() !== '' && (
          <p className="text-2xs text-amber-500">Número inválido: informe DDI + DDD + número (10 a 15 dígitos).</p>
        )}

        {result && (
          <p
            role="status"
            aria-live="polite"
            data-testid="talkx-test-result"
            className={result.ok
              ? 'flex items-start gap-1.5 text-2xs text-emerald-500'
              : 'flex items-start gap-1.5 text-2xs text-red-500'}
          >
            {result.ok ? <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> : <XCircle className="w-3.5 h-3.5 shrink-0 mt-px" />}
            <span className="min-w-0 break-words">{result.text}</span>
          </p>
        )}

        <p className="text-2xs text-muted-foreground">
          O teste passa pelo mesmo provedor da campanha e é registrado em auditoria. Limite de 5 testes a cada 10 minutos.
        </p>
      </div>
    </RailCard>
  );
}
import { useMemo, useState, type FormEvent } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BellOff, CheckCircle2, MessagesSquare, RefreshCw, Save } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useGlobalSettings } from '@/hooks/system/useGlobalSettings';
import {
  useInboxSilence,
  type InboxSilenceConnection,
} from './hooks/useInboxSilence';

/**
 * Faixa e padrão de `global_settings.inbox_silence_minutes`, os MESMOS da
 * migration 20261013230009_admin_inbox_silence (CHECK 1..1440, padrão 10; a RPC
 * repete o clamp). O formulário abaixo recusa o que o banco recusaria.
 */
export const INBOX_SILENCE_SETTING_KEY = 'inbox_silence_minutes';
export const INBOX_SILENCE_MIN_MINUTES = 1;
export const INBOX_SILENCE_MAX_MINUTES = 1440;
export const INBOX_SILENCE_DEFAULT_MINUTES = 10;

/** Data relativa em pt-BR; `null` quando não há carimbo (nunca "há 0 minutos"). */
function relativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
}

function ConnectionRow({ row }: { row: InboxSilenceConnection }) {
  const lastIn = relativeTime(row.last_inbound_at);
  const lastOut = relativeTime(row.last_outbound_at);

  return (
    <li className="rounded-lg border border-border/20 bg-muted/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">
            {row.connection_name ?? 'Conexão sem nome'}
          </span>
          {row.connection_status && (
            <Badge variant="outline" className="text-3xs text-muted-foreground">
              {row.connection_status}
            </Badge>
          )}
        </div>
        {row.is_silent ? (
          <Badge variant="destructive" className="gap-1 text-3xs">
            <BellOff className="h-3 w-3" />
            {lastIn ? `Muda desde ${lastIn}` : 'Nunca recebeu mensagem'}
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 border-emerald-500/30 text-3xs text-emerald-500">
            <CheckCircle2 className="h-3 w-3" />
            Recebendo
          </Badge>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md bg-background/40 p-2">
          <dt className="text-3xs text-muted-foreground">Recebidas (5 min)</dt>
          <dd className="text-lg font-semibold tabular-nums">{row.received_5m}</dd>
        </div>
        <div className="rounded-md bg-background/40 p-2">
          <dt className="text-3xs text-muted-foreground">Recebidas (1 h)</dt>
          <dd className="text-lg font-semibold tabular-nums">{row.received_1h}</dd>
        </div>
        <div className="rounded-md bg-background/40 p-2">
          <dt className="text-3xs text-muted-foreground">Recebidas (24 h)</dt>
          <dd className="text-lg font-semibold tabular-nums">{row.received_24h}</dd>
        </div>
      </dl>

      <p className="mt-2 text-xs text-muted-foreground">
        Última recebida:{' '}
        {lastIn && row.last_inbound_at ? (
          <time dateTime={row.last_inbound_at}>{lastIn}</time>
        ) : (
          'nenhuma'
        )}
        {' · '}
        Última enviada:{' '}
        {lastOut && row.last_outbound_at ? (
          <time dateTime={row.last_outbound_at}>{lastOut}</time>
        ) : (
          'nenhuma'
        )}
      </p>

      <div className="mt-3">
        <p className="text-3xs font-medium text-muted-foreground">
          Contatos mais ativos (24 h)
        </p>
        {row.top_conversations.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhuma mensagem recebida de contato nas últimas 24 h.
          </p>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {row.top_conversations.map((conversation, index) => (
              <li
                key={conversation.contact_id || `contato-${index}`}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="truncate">{conversation.contact_name ?? 'Contato sem nome'}</span>
                <span className="tabular-nums text-muted-foreground">
                  {conversation.received}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

interface Props {
  /** Falso desliga a leitura (usado para não consultar com a aba fora de foco). */
  enabled?: boolean;
}

/**
 * Painel de silêncio da caixa de entrada: por conexão, quantas mensagens
 * RECEBIDAS chegaram em 5 min/1 h/24 h, o último recebido e o último enviado, os
 * contatos mais ativos e o aviso de conexão muda. O limiar
 * (`global_settings.inbox_silence_minutes`) vem da RPC e é editável aqui.
 */
export function MonitoringInboxSilence({ enabled = true }: Props) {
  const { connections, loading, error, silenceMinutes, refresh } = useInboxSilence(enabled);
  const { getSetting, updateSetting } = useGlobalSettings();

  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const configuredRaw = getSetting(INBOX_SILENCE_SETTING_KEY);
  const configuredNumber = configuredRaw !== null ? Number(configuredRaw) : NaN;
  const configuredMinutes = Number.isInteger(configuredNumber) ? configuredNumber : null;
  // O limiar efetivo é o que a RPC leu no servidor; a chave e o padrão só cobrem
  // a janela antes da primeira leitura (e o caso de nenhuma conexão cadastrada).
  const effectiveMinutes = silenceMinutes ?? configuredMinutes ?? INBOX_SILENCE_DEFAULT_MINUTES;

  const fieldValue = draft ?? String(effectiveMinutes);
  const parsed = Number(fieldValue);
  const valid =
    fieldValue.trim() !== '' &&
    Number.isInteger(parsed) &&
    parsed >= INBOX_SILENCE_MIN_MINUTES &&
    parsed <= INBOX_SILENCE_MAX_MINUTES;
  const dirty = valid && parsed !== effectiveMinutes;

  const silentCount = useMemo(
    () => connections.filter(connection => connection.is_silent).length,
    [connections],
  );

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaved(false);
    if (!valid) {
      setSaveError(
        `Informe um número inteiro de ${INBOX_SILENCE_MIN_MINUTES} a ${INBOX_SILENCE_MAX_MINUTES} minutos.`,
      );
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await updateSetting(INBOX_SILENCE_SETTING_KEY, String(parsed));
      setDraft(null);
      // Relê a RPC: com o limiar novo, `is_silent` e as contagens são recalculados.
      await refresh();
      setSaved(true);
    } catch {
      setSaveError('Não foi possível salvar o limiar.');
    } finally {
      setSaving(false);
    }
  };

  const hasSnapshot = connections.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellOff className="h-5 w-5 text-primary" />
          Caixa de entrada muda
          {!loading && (
            <Badge
              variant={silentCount > 0 ? 'destructive' : 'outline'}
              className="h-5 min-w-5 rounded-full px-1 text-3xs"
            >
              {silentCount}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Conexões sem mensagem <strong>recebida</strong> há mais que o limiar configurado. O painel
          olha a ausência de entradas — a entrega das saídas é o outro painel.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <form
          onSubmit={handleSave}
          className="flex flex-wrap items-end gap-2 rounded-lg border border-border/20 p-3"
        >
          <div className="space-y-1">
            <Label htmlFor="inbox-silence-minutes" className="text-xs font-medium">
              Limiar (minutos sem receber)
            </Label>
            <Input
              id="inbox-silence-minutes"
              type="number"
              inputMode="numeric"
              min={INBOX_SILENCE_MIN_MINUTES}
              max={INBOX_SILENCE_MAX_MINUTES}
              step={1}
              value={fieldValue}
              aria-invalid={!valid}
              aria-describedby="inbox-silence-hint"
              onChange={event => {
                setDraft(event.target.value);
                setSaved(false);
                setSaveError(null);
              }}
              className="h-9 w-28"
            />
          </div>
          <Button type="submit" size="sm" className="gap-1.5" disabled={!dirty || saving}>
            <Save className="h-4 w-4" />
            {saving ? 'Salvando…' : 'Salvar limiar'}
          </Button>
          <p id="inbox-silence-hint" className="basis-full text-2xs text-muted-foreground">
            Inteiro de {INBOX_SILENCE_MIN_MINUTES} a {INBOX_SILENCE_MAX_MINUTES} minutos — vale para
            todas as conexões. Em uso agora: {effectiveMinutes} min.
          </p>
          {saveError && (
            <p role="alert" className="basis-full text-2xs text-destructive">
              {saveError}
            </p>
          )}
          {saved && !saveError && (
            <p role="status" className="basis-full text-2xs text-emerald-500">
              Limiar salvo; as contagens foram relidas.
            </p>
          )}
        </form>

        {error && (
          <Alert variant="destructive">
            <RefreshCw className="h-4 w-4" />
            <AlertTitle>Falha na leitura</AlertTitle>
            <AlertDescription>
              <span>
                {error}
                {hasSnapshot && ' As contagens abaixo são da última leitura que deu certo.'}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 gap-1.5"
                onClick={() => void refresh()}
              >
                <RefreshCw className="h-4 w-4" />
                Tentar de novo
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {loading && !hasSnapshot ? (
          <div className="space-y-2" role="status" aria-live="polite">
            <span className="sr-only">Carregando o silêncio da caixa de entrada…</span>
            {[1, 2, 3].map(item => (
              <Skeleton key={item} className="h-20 w-full" />
            ))}
          </div>
        ) : !hasSnapshot ? (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <MessagesSquare className="h-4 w-4" />
            {error
              ? 'Sem leitura para mostrar. Use “Tentar de novo”.'
              : 'Nenhuma conexão de WhatsApp cadastrada para monitorar.'}
          </p>
        ) : (
          <ul className="space-y-3" aria-label="Silêncio por conexão">
            {connections.map(row => (
              <ConnectionRow key={row.connection_id} row={row} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

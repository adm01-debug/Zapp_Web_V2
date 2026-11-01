import { useState, type FormEvent } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCircle2, PauseCircle, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  PAUSE_NOTES_MAX_LENGTH,
  validateInvestigationNotes,
} from '@/services/instance-pauses.service';
import { useInstancePauses, type InstancePause } from './hooks/useInstancePauses';

function relativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
}

type PauseState = 'ativa' | 'vencida' | 'retomada';

function pauseState(pause: InstancePause, now: number): PauseState {
  if (pause.resumed_at) return 'retomada';
  return new Date(pause.paused_until).getTime() > now ? 'ativa' : 'vencida';
}

const STATE_LABEL: Record<PauseState, string> = {
  ativa: 'Pausada',
  vencida: 'Prazo vencido',
  retomada: 'Retomada',
};

interface RowProps {
  pause: InstancePause;
  /** Instante da leitura (ms): referência estável para "pausada" x "prazo vencido". */
  now: number;
  onMark: (pauseId: string, notes: string) => Promise<unknown>;
}

function PauseRow({ pause, now, onMark }: RowProps) {
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const state = pauseState(pause, now);
  const investigated = pause.investigated_at !== null;
  const notesId = `pause-notes-${pause.id}`;

  const open = () => {
    setNotes(pause.investigation_notes ?? '');
    setFormError(null);
    setEditing(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const invalid = validateInvestigationNotes(notes);
    if (invalid) {
      setFormError(invalid);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await onMark(pause.id, notes);
      toast.success(`Pausa de ${pause.instance} marcada como investigada.`);
      setEditing(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Não foi possível marcar a pausa.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="space-y-2 rounded-lg border border-border/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium break-all">{pause.instance}</span>
        <Badge variant={state === 'ativa' ? 'destructive' : 'outline'} className="text-3xs">
          {STATE_LABEL[state]}
        </Badge>
        {pause.auto && (
          <Badge variant="outline" className="text-3xs">
            Automática
          </Badge>
        )}
        {investigated && (
          <Badge variant="outline" className="gap-1 text-3xs">
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            Investigada {relativeTime(pause.investigated_at)}
          </Badge>
        )}
      </div>
      <p className="text-2xs text-muted-foreground break-words">
        Motivo: {pause.reason || 'não informado'} · criada {relativeTime(pause.created_at)}
        {state === 'retomada' && pause.resumed_at && ` · retomada ${relativeTime(pause.resumed_at)}`}
      </p>
      {pause.investigation_notes && !editing && (
        <p className="text-2xs break-words">Notas: {pause.investigation_notes}</p>
      )}

      {editing ? (
        <form onSubmit={handleSubmit} className="space-y-2">
          <Label htmlFor={notesId} className="text-xs font-medium">
            Notas da investigação (opcional)
          </Label>
          <Textarea
            id={notesId}
            value={notes}
            rows={3}
            maxLength={PAUSE_NOTES_MAX_LENGTH + 200}
            aria-invalid={formError !== null}
            aria-describedby={`${notesId}-hint`}
            onChange={event => {
              setNotes(event.target.value);
              setFormError(null);
            }}
          />
          <p id={`${notesId}-hint`} className="text-3xs text-muted-foreground tabular-nums">
            {notes.trim().length}/{PAUSE_NOTES_MAX_LENGTH} · sem os caracteres &lt; e &gt;
          </p>
          {formError && (
            <p role="alert" className="text-2xs text-destructive">
              {formError}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? 'Salvando…' : 'Confirmar'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={saving}
              onClick={() => setEditing(false)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={open}>
          <Search className="h-4 w-4" />
          {investigated ? 'Atualizar notas' : 'Marcar investigada'}
        </Button>
      )}
    </li>
  );
}

/**
 * Histórico de pausas de instância (IP1) com a ação admin/supervisor "Marcar investigada"
 * (IP2, RPC `mark_pause_investigated`). A leitura é protegida por RLS (só staff enxerga
 * linhas) e a RPC recusa quem não é staff; aqui só traduzimos o erro para o usuário.
 */
export function MonitoringInstancePauses({ enabled = true }: { enabled?: boolean }) {
  const { pauses, loadedAt, loading, error, refresh, markInvestigated } = useInstancePauses(enabled);
  const hasData = pauses.length > 0;
  const pendingCount = pauses.filter(p => p.investigated_at === null).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PauseCircle className="h-5 w-5 text-primary" />
          Pausas de instância
          {!loading && hasData && (
            <Badge
              variant={pendingCount > 0 ? 'destructive' : 'outline'}
              className="h-5 min-w-5 rounded-full px-1 text-3xs"
              aria-label={`${pendingCount} pausas sem investigação`}
            >
              {pendingCount}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Últimas pausas de envio por instância. Marque como investigada depois de conferir a causa;
          a primeira marcação congela quem investigou e quando.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <RefreshCw className="h-4 w-4" />
            <AlertTitle>Falha na leitura</AlertTitle>
            <AlertDescription>
              <span>{error}</span>
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

        {loading && !hasData ? (
          <div className="space-y-2" role="status" aria-live="polite">
            <span className="sr-only">Carregando as pausas de instância…</span>
            {[1, 2, 3].map(item => (
              <Skeleton key={item} className="h-20 w-full" />
            ))}
          </div>
        ) : !hasData ? (
          <p role="status" className="text-sm text-muted-foreground">
            {error ? 'Sem leitura para mostrar. Use “Tentar de novo”.' : 'Nenhuma pausa de instância registrada.'}
          </p>
        ) : (
          <ul className="space-y-3" aria-label="Pausas de instância">
            {pauses.map(pause => (
              <PauseRow key={pause.id} pause={pause} now={loadedAt} onMark={markInvestigated} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

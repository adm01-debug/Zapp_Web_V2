/**
 * ContactDeliveryPanel
 *
 * Seção "Entrega de mensagens" do painel do contato (16/10/2026): mostra
 * enviadas / entregues / lidas das últimas 24 h, por hora, com os totais e o
 * horário do último evento.
 *
 * Os números vêm SOMADOS do banco (RPC public.delivery_stats): o front não
 * baixa mensagem para calcular no navegador (ver src/hooks/inbox/useContactDeliveryStats.ts).
 *
 * Sem modo simulação e sem dado inventado: sem número, estado vazio explicativo.
 * O recorte "por participante" de grupo não é fingido — a V2 não guarda o autor
 * da mensagem de grupo, então a seção diz isso em vez de mostrar lista vazia.
 */
import { memo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, CheckCheck, Send, Users } from 'lucide-react';
import {
  useContactDeliveryStats,
  type DeliveryHourPoint,
  type DeliveryStats,
} from '@/hooks/inbox/useContactDeliveryStats';

interface ContactDeliveryPanelProps {
  contactId: string;
}

/** Hora cheia (ISO, UTC na RPC) no fuso de quem está olhando a tela. */
function hourLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--:00';
  return `${String(date.getHours()).padStart(2, '0')}:00`;
}

function relTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function pct(part: number, total: number): number {
  if (!total || total <= 0 || part <= 0) return 0;
  return Math.max(4, Math.round((part / total) * 100));
}

function KpiCard({ icon, label, value, lastAt, tone }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  lastAt: string | null;
  tone: 'muted' | 'info' | 'success';
}) {
  const toneClass =
    tone === 'success' ? 'text-success border-success/30 bg-success/5'
    : tone === 'info' ? 'text-info border-info/30 bg-info/5'
    : 'text-muted-foreground border-border/40 bg-muted/20';

  return (
    <div data-testid={`delivery-kpi-${label.toLowerCase()}`} className={`rounded-lg border p-2.5 ${toneClass}`}>
      <div className="flex items-center gap-1.5 text-3xs uppercase tracking-wide opacity-80">
        {icon}<span>{label}</span>
      </div>
      <div className="text-lg font-semibold leading-tight mt-0.5 text-foreground">{value}</div>
      <div className="text-3xs text-muted-foreground mt-0.5">{relTime(lastAt)}</div>
    </div>
  );
}

/** Uma linha por hora com o que saiu naquela hora. */
function HourRow({ point, maxSent }: { point: DeliveryHourPoint; maxSent: number }) {
  return (
    <li data-testid="delivery-hour" className="flex items-center gap-2">
      <span className="w-9 shrink-0 text-3xs tabular-nums text-muted-foreground">{hourLabel(point.hour)}</span>
      <div className="h-2 flex-1 min-w-0 rounded-full bg-muted/30 overflow-hidden">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct(point.sent, maxSent)}%` }} />
      </div>
      <span className="shrink-0 text-3xs tabular-nums text-muted-foreground" title="Enviadas / entregues / lidas">
        <span data-testid="delivery-hour-sent">{point.sent}</span>
        /
        <span data-testid="delivery-hour-delivered">{point.delivered}</span>
        /
        <span data-testid="delivery-hour-read">{point.read}</span>
      </span>
    </li>
  );
}

function Timeline({ points }: { points: DeliveryHourPoint[] }) {
  const maxSent = points.reduce((max, point) => Math.max(max, point.sent), 0);

  if (points.length === 0) {
    return (
      <p data-testid="delivery-timeline-empty" className="bg-muted/10 rounded-md p-2 text-xs text-muted-foreground">
        Sem envios nas últimas horas da janela.
      </p>
    );
  }

  return (
    <ul data-testid="delivery-timeline" className="space-y-1.5">
      {points.map((point) => (
        <HourRow key={point.hour} point={point} maxSent={maxSent} />
      ))}
    </ul>
  );
}

/** Recorte por participante: indisponível na V2 — dito na tela, sem lista vazia. */
function ParticipantsUnavailable() {
  return (
    <div data-testid="delivery-participants" className="rounded-lg border border-border/40">
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-border/40 bg-muted/20">
        <Users className="w-3 h-3 text-primary" />
        <span className="text-2xs font-medium text-foreground">Por participante</span>
      </div>
      <p data-testid="delivery-participants-empty" className="px-2.5 py-2 text-xs text-muted-foreground">
        Ainda não disponível: o Zapp Web não registra qual participante enviou cada mensagem no grupo.
      </p>
    </div>
  );
}

function ContactDeliveryPanelInner({ contactId }: ContactDeliveryPanelProps) {
  const { stats, isLoading, isError } = useContactDeliveryStats(contactId);
  const reduceMotion = useReducedMotion();

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-12" />
      </div>
    );
  }

  if (isError) {
    return (
      <p role="alert" data-testid="delivery-error" className="text-xs text-destructive py-2">
        Falha ao carregar os números de entrega.
      </p>
    );
  }

  if (!stats) {
    return (
      <p data-testid="delivery-empty" className="bg-muted/10 rounded-md p-2 text-xs text-muted-foreground">
        Sem números de entrega para este contato.
      </p>
    );
  }

  if (stats.totals.total_messages === 0) {
    return (
      <p data-testid="delivery-empty" className="bg-muted/10 rounded-md p-2 text-xs text-muted-foreground">
        Sem mensagens nas últimas {stats.window_hours} horas.
      </p>
    );
  }

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div data-testid="delivery-totals" className="grid grid-cols-3 gap-2">
        <KpiCard icon={<Send className="w-3 h-3" />} label="Enviadas" value={stats.totals.sent} lastAt={stats.totals.last_sent_at} tone="muted" />
        <KpiCard icon={<Check className="w-3 h-3" />} label="Entregues" value={stats.totals.delivered} lastAt={stats.totals.last_delivered_at} tone="info" />
        <KpiCard icon={<CheckCheck className="w-3 h-3" />} label="Lidas" value={stats.totals.read} lastAt={stats.totals.last_read_at} tone="success" />
      </div>

      {stats.totals.failed > 0 && (
        <p data-testid="delivery-failed" className="text-3xs text-destructive">
          {stats.totals.failed} mensagem(ns) com falha de envio na janela.
        </p>
      )}

      <div className="space-y-1.5">
        <h5 className="text-2xs font-medium text-muted-foreground uppercase tracking-wide">
          Por hora (últimas {stats.window_hours} h)
        </h5>
        <Timeline points={stats.timeline} />
      </div>

      {stats.is_group && <ParticipantsUnavailable />}
    </motion.div>
  );
}

export const ContactDeliveryPanel = memo(ContactDeliveryPanelInner);

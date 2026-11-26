import { useCallback } from 'react';
import { toast } from 'sonner';
import { Clock, Flag, Pin, PinOff, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Message } from '@/types/chat';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { PIN_LIMIT, useMessagePins } from '@/hooks/chat/useMessagePins';
import { useMessageFavorites, useToggleMessageFavorite } from '@/hooks/chat/useMessageFavorites';
import { useRemindMessage } from '@/hooks/chat/useRemindMessage';
import { useReportMessage, type ReportReason } from '@/hooks/chat/useReportMessage';

/**
 * Acoes por mensagem que dependem de operacao de banco: favoritar, fixar,
 * responder depois e denunciar.
 *
 * R2-INB-021 (item 317) removeu estas quatro entradas do menu hover porque nao
 * havia tabela, RPC nem hook por tras — a interface anunciava o que nao
 * concluia. As operacoes passaram a existir (migrations
 * 20261011125915_message_favorites_pins_reports e
 * 20261126221500_remind_me_about_message, RPCs toggle_message_favorite,
 * pin_message, unpin_message, report_message e remind_me_about_message) e cada
 * entrada voltou com handler real, usando os hooks de src/hooks/chat.
 *
 * As chaves de cache sao por contato; a lista de fixadas e a de favoritas sao
 * lidas so quando o menu abre (o conteudo do DropdownMenu so monta aberto), sem
 * consulta no caminho de render da conversa.
 */
interface MessageActionMenuItemsProps {
  message: Message;
}

const REPORT_REASON_LABELS: ReadonlyArray<{ reason: ReportReason; label: string }> = [
  { reason: 'spam', label: 'Spam' },
  { reason: 'improprio', label: 'Conteúdo impróprio' },
  { reason: 'urgencia', label: 'Urgência' },
  { reason: 'outro', label: 'Outro motivo' },
];

/** Data do lembrete em `dias` dias, na hora cheia informada (fuso local do navegador).
 *  A janela aceita pelo banco (futuro, ate 90 dias) cobre os tres atalhos. */
function lembreteEmDias(dias: number, hora: number): Date {
  const data = new Date();
  data.setDate(data.getDate() + dias);
  data.setHours(hora, 0, 0, 0);
  return data;
}

const REMIND_PRESETS: ReadonlyArray<{ label: string; at: () => Date }> = [
  { label: 'Em 1 hora', at: () => new Date(Date.now() + 60 * 60 * 1000) },
  { label: 'Amanhã às 9h', at: () => lembreteEmDias(1, 9) },
  { label: 'Em 3 dias às 9h', at: () => lembreteEmDias(3, 9) },
];

export function MessageActionMenuItems({ message }: MessageActionMenuItemsProps) {
  const contactId = message.contact_id ?? null;
  const { isFavorite } = useMessageFavorites(contactId);
  const { toggleFavorite, isToggling } = useToggleMessageFavorite();
  const { pins, isPinned, pin, unpin, isPinning, isUnpinning } = useMessagePins(contactId);
  const { remind, isSaving: isSavingRemind } = useRemindMessage();
  const { report, isReported, isReporting } = useReportMessage(contactId);

  const jaFavorita = isFavorite(message.id);
  const jaFixada = isPinned(message.id);
  const jaReportada = isReported(message.id);

  // Os hooks ja traduzem a falha do banco em toast: aqui so evitamos a rejeicao
  // nao tratada do mutateAsync.
  const handleFavorite = useCallback(async () => {
    try {
      const favoritada = await toggleFavorite(message.id);
      toast.success(favoritada ? 'Mensagem favoritada' : 'Removida dos favoritos');
    } catch {
      /* erro ja notificado pelo hook */
    }
  }, [message.id, toggleFavorite]);

  const handlePin = useCallback(async () => {
    try {
      if (jaFixada) {
        await unpin(message.id);
        toast.success('Mensagem desafixada');
        return;
      }
      await pin(message.id);
      toast.success(`Mensagem fixada (${Math.min(pins.length + 1, PIN_LIMIT)}/${PIN_LIMIT})`);
    } catch {
      /* erro ja notificado pelo hook */
    }
  }, [jaFixada, message.id, pin, pins.length, unpin]);

  const handleRemind = useCallback(
    async (at: Date) => {
      try {
        await remind(message.id, at);
      } catch {
        /* erro ja notificado pelo hook */
      }
    },
    [message.id, remind],
  );

  const handleReport = useCallback(
    async (reason: ReportReason) => {
      try {
        await report(message.id, reason);
      } catch {
        /* erro ja notificado pelo hook */
      }
    },
    [message.id, report],
  );

  return (
    <>
      <DropdownMenuItem className="gap-2 cursor-pointer" disabled={isToggling} onClick={handleFavorite}>
        <Star className={cn('w-4 h-4', jaFavorita && 'fill-current text-amber-500')} />
        {jaFavorita ? 'Remover dos favoritos' : 'Favoritar mensagem'}
      </DropdownMenuItem>

      <DropdownMenuItem
        className="gap-2 cursor-pointer"
        disabled={isPinning || isUnpinning}
        onClick={handlePin}
      >
        {jaFixada ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
        {jaFixada ? 'Desafixar mensagem' : `Fixar mensagem (máx. ${PIN_LIMIT})`}
      </DropdownMenuItem>

      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="gap-2 cursor-pointer" disabled={isSavingRemind}>
          <Clock className="w-4 h-4" /> Responder depois
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="bg-card">
          {REMIND_PRESETS.map((preset) => (
            <DropdownMenuItem
              key={preset.label}
              className="cursor-pointer"
              onClick={() => void handleRemind(preset.at())}
            >
              {preset.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      <DropdownMenuSub>
        <DropdownMenuSubTrigger
          className="gap-2 cursor-pointer"
          disabled={isReporting || jaReportada}
        >
          <Flag className="w-4 h-4" />
          {jaReportada ? 'Mensagem já denunciada' : 'Denunciar mensagem'}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="bg-card">
          {REPORT_REASON_LABELS.map((opcao) => (
            <DropdownMenuItem
              key={opcao.reason}
              className="cursor-pointer"
              onClick={() => void handleReport(opcao.reason)}
            >
              {opcao.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      <DropdownMenuSeparator />
    </>
  );
}
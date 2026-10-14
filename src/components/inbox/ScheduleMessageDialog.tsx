import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Calendar, Check, Clock, Paperclip, RefreshCw } from 'lucide-react';
import { format, addDays, setHours, setMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { localInstantFromDayAndTime } from '@/lib/localDay';
import { toast } from '@/hooks/ui/use-toast';
import { cn } from '@/lib/utils';
import { MorphButton, toneClasses, type MorphState } from '@/components/inbox/chat/motion';
import { zappMotion, zappSpring, zappTransition } from '@/lib/motion';

interface ScheduleMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // R2-INB-010: o agendamento é assíncrono. O diálogo só pode fechar e limpar o
  // rascunho DEPOIS que a persistência confirmar; por isso o retorno é aguardável.
  // O produtor REJEITA em falha (upload, referência do anexo ou gravação), e é
  // esse lance que mantém o diálogo aberto e o rascunho intacto.
  onSchedule: (message: string, scheduledAt: Date, attachment?: File) => Promise<void> | void;
}

/**
 * Traduz o erro do produtor para a voz do produto.
 *
 * Permissão (403 / RLS `42501` / recusa de escrita do Storage) tem mensagem
 * própria — reenviar não resolve e o usuário precisa saber disso. Qualquer outra
 * causa (rede, contrato, anexo) é falha recuperável: convida a tentar de novo.
 */
function mensagemDeErroAoAgendar(erro: unknown): string {
  const e = erro as
    | { status?: number; statusCode?: number | string; code?: string; message?: string }
    | null
    | undefined;
  const status = Number(e?.status ?? e?.statusCode ?? Number.NaN);
  const codigo = String(e?.code ?? '');
  const texto = String(e?.message ?? '');
  const semPermissao =
    status === 403 ||
    codigo === '42501' ||
    /row-level security|permission denied|not authorized|sem permissão|unauthorized|403/i.test(texto);

  return semPermissao
    ? 'Sem permissão para agendar nesta conversa'
    : 'Não foi possível agendar. Tente de novo.';
}

export function ScheduleMessageDialog({ open, onOpenChange, onSchedule }: ScheduleMessageDialogProps) {
  const [message, setMessage] = useState('');
  const [date, setDate] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const [time, setTime] = useState('09:00');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [submitState, setSubmitState] = useState<MorphState>('idle');
  const [erro, setErro] = useState<string | null>(null);
  // Selo de sucesso: entra com a transição do kit e SAI com ela — é a saída
  // (onExitComplete) que fecha o diálogo e limpa o rascunho, sem temporizador.
  const [sucesso, setSucesso] = useState(false);
  const sucessoVisivelRef = useRef(false);

  const tentarRef = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion() ?? false;

  // Foco no "Tentar de novo" da faixa quando a falha aparece (teclado e leitor
  // de tela: a faixa já tem role="alert" e o botão de erro anuncia o estado).
  useEffect(() => {
    if (!erro) return;
    tentarRef.current?.focus();
  }, [erro]);

  const quickSchedules = [
    { label: 'Amanhã 9h', getDate: () => setMinutes(setHours(addDays(new Date(), 1), 9), 0) },
    { label: 'Amanhã 14h', getDate: () => setMinutes(setHours(addDays(new Date(), 1), 14), 0) },
    { label: 'Em 2 dias', getDate: () => setMinutes(setHours(addDays(new Date(), 2), 9), 0) },
    { label: 'Em 1 semana', getDate: () => setMinutes(setHours(addDays(new Date(), 7), 9), 0) },
  ];

  /**
   * O check de sucesso já foi visto (o selo entrou e saiu com a transição do
   * kit): aqui o diálogo fecha e o rascunho apaga. Chamado pelo onExitComplete
   * do AnimatePresence — nenhum temporizador, nenhuma limpeza de desmonte.
   * É também o ÚNICO fechador no sucesso: o produtor (ChatPanel) não fecha.
   */
  const finalizarSucesso = () => {
    onOpenChange(false);
    setMessage('');
    setAttachment(null);
    setErro(null);
    setSucesso(false);
    sucessoVisivelRef.current = false;
    setSubmitState('idle');
  };

  const handleSchedule = async () => {
    if (!message.trim()) {
      toast({ title: 'Mensagem vazia', description: 'Digite uma mensagem para agendar', variant: 'destructive' });
      return;
    }
    const scheduledDate = localInstantFromDayAndTime(date, time);

    if (!scheduledDate || scheduledDate <= new Date()) {
      toast({ title: 'Data inválida', description: 'A data de agendamento deve ser no futuro', variant: 'destructive' });
      return;
    }

    if (submitState === 'loading') return;
    setErro(null);
    setSubmitState('loading');

    try {
      // Só anuncia sucesso, mostra o check e o selo DEPOIS que a persistência
      // confirmar. O selo sai com a transição do kit e o onExitComplete fecha o
      // diálogo e apaga o rascunho (finalizarSucesso) — sem temporizador.
      await onSchedule(message, scheduledDate, attachment || undefined);
      setSubmitState('success');
      toast({
        title: 'Mensagem agendada!',
        description: `Será enviada em ${format(scheduledDate, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
      });
      sucessoVisivelRef.current = true;
      setSucesso(true);
    } catch (err) {
      // Falha ao persistir: mantém o diálogo aberto e o rascunho intacto para nova
      // tentativa (o produtor já reporta a causa; aqui nada é apagado). O botão
      // Agendar vai para o estado de erro ("Tentar de novo", anunciado pelo
      // role="status") e o foco vai ao "Tentar de novo" da faixa.
      setSubmitState('error');
      const texto = mensagemDeErroAoAgendar(err);
      setErro(texto);
      toast({
        title: 'Não foi possível agendar',
        description: texto,
        variant: 'destructive',
      });
    }
  };

  const handleRetry = () => {
    setErro(null);
    void handleSchedule();
  };

  const handleQuickSchedule = (getDate: () => Date) => {
    const scheduledDate = getDate();
    setDate(format(scheduledDate, 'yyyy-MM-dd'));
    setTime(format(scheduledDate, 'HH:mm'));
  };

  const previewDate = localInstantFromDayAndTime(date, time);
  const info = toneClasses('info');
  const falha = toneClasses('destructive');

  // Com movimento reduzido nada se desloca: só opacidade/cor mudam.
  const entradaFaixa = reduce
    ? { opacity: 0 }
    : { opacity: 0, y: -zappMotion.distance.small, scale: 0.98 };
  const visivelFaixa = reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 };
  const saidaFaixa = reduce
    ? { opacity: 0, transition: { duration: 0 } }
    : { opacity: 0, y: -zappMotion.distance.small, transition: { duration: zappMotion.duration.fast } };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-whatsapp" />
            Agendar Mensagem
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {/* Quick Schedule Buttons */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Atalhos rápidos</Label>
            <div className="flex flex-wrap gap-2">
              {quickSchedules.map((schedule) => (
                <motion.button
                  key={schedule.label}
                  whileHover={reduce ? undefined : { scale: 1.05 }}
                  whileTap={reduce ? undefined : { scale: 0.95 }}
                  onClick={() => handleQuickSchedule(schedule.getDate)}
                  className="min-h-10 px-3 py-1.5 text-xs font-medium rounded-full bg-muted hover:bg-muted/80 transition-colors"
                >
                  {schedule.label}
                </motion.button>
              ))}
            </div>
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date" className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                Data
              </Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={format(new Date(), 'yyyy-MM-dd')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="time" className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                Hora
              </Label>
              <Input
                id="time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="message">Mensagem</Label>
            <Textarea
              id="message"
              placeholder="Digite a mensagem que será enviada..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
            />
          </div>

          {/* Attachment */}
          <div className="space-y-2">
            <Label>Anexo (opcional)</Label>
            {attachment ? (
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2">
                  <Paperclip className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm truncate max-w-[200px]">{attachment.name}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-10"
                  onClick={() => setAttachment(null)}
                >
                  Remover
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full min-h-10"
                onClick={() => document.getElementById('file-upload')?.click()}
              >
                <Paperclip className="w-4 h-4 mr-2" />
                Anexar arquivo
              </Button>
            )}
            <input
              id="file-upload"
              type="file"
              className="hidden"
              onChange={(e) => setAttachment(e.target.files?.[0] || null)}
            />
          </div>

          {/* Selo de data/hora (info) — atualiza ao escolher */}
          <AnimatePresence initial={false}>
            {previewDate && (
              <motion.div
                key="selo-agendamento"
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: zappMotion.distance.small }}
                animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: zappMotion.distance.small }}
                transition={reduce ? { duration: 0 } : zappSpring.soft}
                data-testid="selo-agendamento"
                data-motion={reduce ? 'reduced' : 'full'}
                className={cn('flex items-center gap-2 rounded-lg border px-3 py-2', info.border, info.soft)}
              >
                <Calendar className={cn('w-4 h-4 shrink-0', info.text)} aria-hidden="true" />
                <p className="text-sm text-muted-foreground">
                  Será enviada em{' '}
                  <span className="font-medium text-foreground">
                    {format(previewDate, "EEEE, dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                  </span>
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Falha inline com 'Tentar de novo' */}
          <AnimatePresence initial={false}>
            {erro && (
              <motion.div
                key="faixa-falha"
                role="alert"
                initial={entradaFaixa}
                animate={visivelFaixa}
                exit={saidaFaixa}
                transition={reduce ? { duration: 0 } : zappSpring.soft}
                data-testid="falha-agendamento"
                data-motion={reduce ? 'reduced' : 'full'}
                className={cn(
                  'flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2',
                  falha.border,
                  falha.soft,
                )}
              >
                <AlertTriangle className={cn('w-4 h-4 shrink-0', falha.text)} aria-hidden="true" />
                <p className="flex-1 text-sm text-foreground">{erro}</p>
                <Button
                  ref={tentarRef}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-10"
                  data-testid="tentar-de-novo"
                  onClick={handleRetry}
                >
                  <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" />
                  Tentar de novo
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Selo de sucesso: entra com a transição do kit e sai com ela. É a
              saída (onExitComplete → finalizarSucesso) que fecha o diálogo e
              limpa o rascunho — o check fica visível por um instante, sem
              temporizador. Com movimento reduzido só a opacidade muda. */}
          <AnimatePresence initial={false} onExitComplete={finalizarSucesso}>
            {sucesso && (
              <motion.div
                key="selo-sucesso"
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: zappMotion.distance.small }}
                animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: zappMotion.distance.small }}
                transition={reduce ? { duration: 0 } : zappTransition.fast}
                onAnimationComplete={() => {
                  // Entrada concluída: o check foi visto, o selo pode sair (a
                  // saída dispara o fechamento). A guarda ignora o término da
                  // própria saída, que também passa por aqui.
                  if (sucessoVisivelRef.current) {
                    sucessoVisivelRef.current = false;
                    setSucesso(false);
                  }
                }}
                data-testid="selo-sucesso"
                data-motion={reduce ? 'reduced' : 'full'}
                role="status"
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-3 py-2',
                  toneClasses('success').border,
                  toneClasses('success').soft,
                )}
              >
                <Check className={cn('w-4 h-4 shrink-0', toneClasses('success').text)} aria-hidden="true" />
                <p className="text-sm font-medium text-foreground">Mensagem agendada!</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitState === 'loading'}
              className="min-h-10"
            >
              Cancelar
            </Button>
            <motion.div
              whileHover={reduce ? undefined : { scale: 1.02 }}
              whileTap={reduce ? undefined : { scale: 0.98 }}
            >
              <MorphButton
                state={submitState}
                onClick={handleSchedule}
                disabled={!message.trim()}
                loadingLabel="Agendando…"
                successLabel="Agendada!"
                errorLabel="Tentar de novo"
                data-testid="agendar-mensagem"
                className="min-h-10 bg-whatsapp text-primary-foreground hover:bg-whatsapp-dark"
              >
                Agendar
              </MorphButton>
            </motion.div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

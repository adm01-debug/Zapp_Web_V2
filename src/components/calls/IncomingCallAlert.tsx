import { useState, useEffect, useRef, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { CallDialog } from './CallDialog';
import { useIncomingCallListener, type IncomingCall } from '@/hooks/communication/useIncomingCallListener';
import { CallChannelBadge } from './CallChannelBadge';
import { useCallChannels } from '@/hooks/calls/useCallChannels';
import { ROTULO_IGNORAR_WHATSAPP } from '@/lib/calls/WhatsAppCallAdapter';
import { deveTocar, proximoToque, type EstadoDeToque } from '@/lib/calls/toqueDaChamada';
import { useNotificationSettings } from '@/hooks/system/useNotificationSettings';
import { useCallSession } from '@/providers/CallSessionProvider';
import { cn } from '@/lib/utils';

import { getLogger } from '@/lib/logger';
const log = getLogger('IncomingCallAlert');

/**
 * ÂNCORA (não unificar): o toque da chamada entrante é um **alerta**, não mídia de
 * conversa. Sai por WebAudio (oscilador → gain → `ctx.destination`) com o ganho vindo de
 * `settings.soundVolume` — o mesmo caminho de `utils/notificationSound*.ts` — e o
 * `AudioContext` aqui é uma instância PRÓPRIA.
 *
 * O controle de volume das mídias (`mediaVolumeStore` / `lib/mediaVolumeElement.ts`)
 * nunca deve ser plugado neste componente: quem abaixa o áudio do cliente não pode, sem
 * querer, silenciar a chamada que está entrando. A separação é garantida por teste em
 * `src/components/inbox/__tests__/MediaVolume.test.tsx` (E38–E41).
 */

export const IncomingCallAlert = forwardRef<HTMLDivElement>(
  function IncomingCallAlert(_props, ref) {
  const { incomingCall, dismissCall } = useIncomingCallListener();
  const { settings: notifSettings, isQuietHours } = useNotificationSettings();
  // Atender/recusar falam com a MÁQUINA da sessão (o provider decide o desfecho:
  // `accept()` → atendida, `reject()` → `declined` e persistência em `declined`).
  // O componente não escreve mais direto na tabela `calls` (legado `useCalls`).
  const { accept, reject } = useCallSession();
  const { voip, whatsapp } = useCallChannels();
  const [showDialog, setShowDialog] = useState(false);
  // O canal vem do próprio chamado: quem chega com `whatsapp_connection_id` é WhatsApp;
  // sem ele, a linha é a do VoIP.
  const canal = incomingCall?.whatsapp_connection_id ? 'whatsapp' : 'voip';
  const capacidade = canal === 'whatsapp' ? whatsapp : voip;
  /**
   * Estado do toque na máquina PURA da etapa T27: a chamada chegando é o
   * `INVITE_RECEIVED`; quando ela sai da tela (atendida, recusada, timeou ou o outro
   * lado desligou) o listener para de entregá-la e o toque para. Quem decide o
   * desfecho continua sendo a máquina da sessão — aqui só se decide se SOA.
   */
  const [toque, setToque] = useState<EstadoDeToque>('parado');

  useEffect(() => {
    setToque((atual) => proximoToque(atual, incomingCall ? 'INVITE_RECEIVED' : 'TIMEOUT'));
  }, [incomingCall]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Play ringtone only if sound is enabled and not in quiet hours
  useEffect(() => {
    const soundAllowed = notifSettings.soundEnabled && !isQuietHours();
    // Não basta estar tocando: o canal precisa poder RECEBER (etapa T27).
    if (incomingCall && !showDialog && soundAllowed && deveTocar(toque) && capacidade.canReceive) {
      try {
        const ctx = new AudioContext();
        // A chamada chega pelo Realtime, não por um gesto do usuário: o navegador cria
        // o AudioContext SUSPENSO e o toque fica MUDO, sem erro nenhum. Os outros dois
        // caminhos de alerta (`notificationSounds`, chat interno) já retomam — aqui faltava.
        // E retomar não basta quando a aba ainda não recebeu NENHUMA interação (aí o navegador
        // ignora o resume em silêncio): nesse caso retomamos no primeiro gesto — a única janela
        // que o navegador oferece.
        const retomar = () => {
          if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
        };
        retomar();
        document.addEventListener('pointerdown', retomar);
        document.addEventListener('keydown', retomar);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 440;
        const vol = (notifSettings.soundVolume ?? 70) / 100 * 0.2;
        gain.gain.value = vol;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();

        const interval = setInterval(() => {
          gain.gain.value = gain.gain.value > 0 ? 0 : vol;
        }, 500);

        return () => {
          clearInterval(interval);
          document.removeEventListener('pointerdown', retomar);
          document.removeEventListener('keydown', retomar);
          osc.stop();
          void ctx.close();
        };
      } catch (err) { log.error('Unexpected error in IncomingCallAlert:', err); }
    }
  }, [incomingCall, showDialog, notifSettings.soundEnabled, notifSettings.soundVolume, isQuietHours, toque, capacidade.canReceive]);

  // O timeout de toque NÃO mora mais aqui: quem conta os 30s é a máquina da sessão
  // (provider). O alerta só reage — quando a chamada sai de `ringing_in` o listener
  // deixa de entregá-la e o `if (!incomingCall) return null` abaixo o remove. Nada de
  // decidir desfecho por tempo na UI.

  const handleAnswer = () => {
    if (incomingCall?.callId) void accept();
    setShowDialog(true);
  };

  const handleDecline = () => {
    void reject();
    dismissCall();
  };

  const handleDialogEnd = () => {
    setShowDialog(false);
    dismissCall();
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  };

  if (!incomingCall) return null;

  if (showDialog) {
    return (
      <CallDialog
        open={true}
        onOpenChange={(open) => { if (!open) handleDialogEnd(); }}
        contact={{
          id: incomingCall.contact_id || undefined,
          name: incomingCall.contact_name,
          phone: incomingCall.contact_phone,
        }}
        direction="inbound"
        whatsappConnectionId={incomingCall.whatsapp_connection_id || undefined}
        existingCallId={incomingCall.callId}
        initialStatus="answered"
        onAnswer={() => {}}
        onEnd={handleDialogEnd}
      />
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -100, opacity: 0, scale: 0.9 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: -100, opacity: 0, scale: 0.9 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="fixed top-4 right-4 z-[9999] w-80"
      >
        <div className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
          {/* Pulsing header */}
          <div className={cn(
            "px-4 py-3 flex items-center gap-2 text-sm font-medium text-primary-foreground",
            incomingCall.is_video
              ? "bg-info"
              : "bg-success"
          )}>
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            >
              {incomingCall.is_video ? <Video className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
            </motion.div>
            {incomingCall.is_video ? 'Chamada de vídeo' : 'Chamada de voz'}
            <CallChannelBadge
              channel={canal}
              motivo={capacidade.reason ?? null}
              className="ml-auto bg-primary-foreground/20 text-primary-foreground"
            />
          </div>

          {/* Contact info */}
          <div className="p-4 flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {getInitials(incomingCall.contact_name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground truncate">
                {incomingCall.contact_name}
              </p>
              <p className="text-sm text-muted-foreground truncate">
                {incomingCall.contact_phone}
              </p>
            </div>
          </div>

          {/* Actions: o que aparece depende da capacidade REAL do canal (T23/T27). */}
          <div className="px-4 pb-4 flex gap-2">
            <Button
              variant="destructive"
              className="flex-1 gap-2"
              onClick={handleDecline}
            >
              <PhoneOff className="h-4 w-4" />
              {canal === 'whatsapp' ? ROTULO_IGNORAR_WHATSAPP : 'Recusar'}
            </Button>
            {capacidade.canReceive ? (
            <Button
              className={cn(
                "flex-1 gap-2 text-primary-foreground",
                incomingCall.is_video
                  ? "bg-info hover:bg-info/90"
                  : "bg-success hover:bg-success/90"
              )}
              onClick={handleAnswer}
            >
              <Phone className="h-4 w-4" />
              Atender
            </Button>
            ) : null}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
});

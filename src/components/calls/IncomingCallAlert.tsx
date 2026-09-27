import { useState, useEffect, useRef, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { CallDialog } from './CallDialog';
import { useIncomingCallListener, type IncomingCall } from '@/hooks/communication/useIncomingCallListener';
import { useNotificationSettings } from '@/hooks/system/useNotificationSettings';
import { useCalls } from '@/hooks/communication/useCalls';
import { cn } from '@/lib/utils';

import { getLogger } from '@/lib/logger';
const log = getLogger('IncomingCallAlert');

export const IncomingCallAlert = forwardRef<HTMLDivElement>(
  function IncomingCallAlert(_props, ref) {
  const { incomingCall, dismissCall } = useIncomingCallListener();
  const { settings: notifSettings, isQuietHours } = useNotificationSettings();
  const { answerCall, missCall } = useCalls();
  const [showDialog, setShowDialog] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Play ringtone only if sound is enabled and not in quiet hours
  useEffect(() => {
    const soundAllowed = notifSettings.soundEnabled && !isQuietHours();
    if (incomingCall && !showDialog && soundAllowed) {
      try {
        const ctx = new AudioContext();
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
          osc.stop();
          ctx.close();
        };
      } catch (err) { log.error('Unexpected error in IncomingCallAlert:', err); }
    }
  }, [incomingCall, showDialog, notifSettings.soundEnabled, notifSettings.soundVolume, isQuietHours]);

  // Auto-dismiss após 30s sem resposta — não roda quando já atendida
  // (senão a chamada em andamento some da tela sozinha).
  useEffect(() => {
    if (!incomingCall || showDialog) return;
    const timeout = setTimeout(dismissCall, 30000);
    return () => clearTimeout(timeout);
  }, [incomingCall, showDialog, dismissCall]);

  const handleAnswer = () => {
    if (incomingCall?.callId) answerCall(incomingCall.callId);
    setShowDialog(true);
  };

  const handleDecline = () => {
    if (incomingCall?.callId) missCall(incomingCall.callId);
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

          {/* Actions */}
          <div className="px-4 pb-4 flex gap-2">
            <Button
              variant="destructive"
              className="flex-1 gap-2"
              onClick={handleDecline}
            >
              <PhoneOff className="h-4 w-4" />
              Recusar
            </Button>
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
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
});

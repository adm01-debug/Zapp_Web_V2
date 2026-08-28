import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCalls } from '@/hooks/communication/useCalls';
import { logAudit } from '@/lib/audit';

interface CallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: {
    id?: string;
    name: string;
    phone: string;
    avatar?: string;
  };
  direction: 'inbound' | 'outbound';
  whatsappConnectionId?: string;
  onAnswer?: () => void;
  onEnd: () => void;
}

export function CallDialog({
  open,
  onOpenChange,
  contact,
  direction,
  whatsappConnectionId,
  onAnswer,
  onEnd,
}: CallDialogProps) {
  const [status, setStatus] = useState<'ringing' | 'answered' | 'ended'>('ringing');
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [callId, setCallId] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const { startCall, answerCall, endCall, missCall } = useCalls();

  // Start call when dialog opens
  useEffect(() => {
    if (open && !callId) {
      startCall({
        contactId: contact.id,
        contactPhone: contact.phone,
        contactName: contact.name,
        direction,
        whatsappConnectionId,
      }).then(id => {
        if (id) setCallId(id);
      });
    }
  }, [open, callId, contact, direction, whatsappConnectionId, startCall]);

  // Timer for call duration
  useEffect(() => {
    if (open && status === 'answered') {
      intervalRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [open, status]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setStatus('ringing');
      setDuration(0);
      setIsMuted(false);
      setCallId(null);
    }
  }, [open]);

  const handleAnswer = async () => {
    setStatus('answered');
    
    if (callId) {
      await answerCall(callId);
    }
    
    onAnswer?.();
    logAudit({
      action: 'call_started',
      entityType: 'call',
      entityId: callId || undefined,
      details: { direction, contact_phone: contact.phone },
    });
  };

  const handleEnd = async () => {
    setStatus('ended');
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    if (callId) {
      if (status === 'ringing' && direction === 'inbound') {
        // Missed call if ended while ringing inbound
        await missCall(callId);
      } else {
        await endCall(callId, duration);
      }
    }
    
    logAudit({
      action: 'call_ended',
      entityType: 'call',
      entityId: callId || undefined,
      details: { direction, duration, contact_phone: contact.phone },
    });
    
    onEnd();
    onOpenChange(false);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-gradient-to-b from-card to-background border-0">
        <div className="p-8 flex flex-col items-center">
          {/* Contact Avatar */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative"
          >
            <Avatar className="w-24 h-24 border-4 border-whatsapp/20">
              <AvatarImage src={contact.avatar} />
              <AvatarFallback className="text-2xl bg-whatsapp/10 text-whatsapp">
                {contact.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            
            {/* Ringing animation */}
            <AnimatePresence>
              {status === 'ringing' && (
                <>
                  <motion.div
                    initial={{ scale: 1, opacity: 0.5 }}
                    animate={{ scale: 2, opacity: 0 }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="absolute inset-0 rounded-full border-2 border-whatsapp"
                  />
                  <motion.div
                    initial={{ scale: 1, opacity: 0.5 }}
                    animate={{ scale: 2, opacity: 0 }}
                    transition={{ duration: 1.5, repeat: Infinity, delay: 0.5 }}
                    className="absolute inset-0 rounded-full border-2 border-whatsapp"
                  />
                </>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Contact Info */}
          <h3 className="mt-6 text-xl font-semibold text-foreground">{contact.name}</h3>
          <p className="text-muted-foreground">{contact.phone}</p>

          {/* Status */}
          <motion.div
            key={status}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4"
          >
            {status === 'ringing' && (
              <p className="text-muted-foreground">
                {direction === 'inbound' ? 'Chamada recebida...' : 'Chamando...'}
              </p>
            )}
            {status === 'answered' && (
              <p className="text-whatsapp font-mono text-lg">{formatDuration(duration)}</p>
            )}
          </motion.div>

          {/* Controls */}
          <div className="mt-8 flex items-center gap-4">
            {status === 'answered' && (
              <>
                <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                  <Button
                    variant="outline"
                    size="icon"
                    className={cn(
                      'w-12 h-12 rounded-full',
                      isMuted && 'bg-destructive/10 border-destructive text-destructive'
                    )}
                    onClick={() => setIsMuted(!isMuted)}
                  >
                    {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </Button>
                </motion.div>

                <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                  <Button
                    variant="outline"
                    size="icon"
                    className={cn(
                      'w-12 h-12 rounded-full',
                      !isSpeakerOn && 'bg-muted'
                    )}
                    onClick={() => setIsSpeakerOn(!isSpeakerOn)}
                  >
                    {isSpeakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                  </Button>
                </motion.div>
              </>
            )}

            {status === 'ringing' && direction === 'inbound' && (
              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                <Button
                  size="icon"
                  className="w-14 h-14 rounded-full bg-whatsapp hover:bg-whatsapp-dark"
                  onClick={handleAnswer}
                >
                  <Phone className="w-6 h-6" />
                </Button>
              </motion.div>
            )}

            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
              <Button
                size="icon"
                className="w-14 h-14 rounded-full bg-destructive hover:bg-destructive/90"
                onClick={handleEnd}
              >
                <PhoneOff className="w-6 h-6" />
              </Button>
            </motion.div>
          </div>

          {/* Info text */}
          <p className="mt-6 text-xs text-muted-foreground text-center max-w-xs">
            {status === 'ringing' && direction === 'outbound' 
              ? 'Aguardando resposta do contato...'
              : status === 'answered'
              ? 'Chamada em andamento'
              : null
            }
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

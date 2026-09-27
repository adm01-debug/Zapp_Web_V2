import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Phone, PhoneOff, Mic, MicOff, Delete, Wifi, WifiOff, Loader2,
} from 'lucide-react';
import type { SipStatus, CallStatus, CallDirection } from '@/hooks/communication/useSipClient';

interface DialPadProps {
  sipStatus: SipStatus;
  callStatus: CallStatus;
  callDuration: number;
  isMuted: boolean;
  currentNumber: string;
  callDirection: CallDirection | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onCall: (number: string) => void;
  onHangUp: () => void;
  onAcceptIncoming: () => void;
  onToggleMute: () => void;
  onDTMF: (digit: string) => void;
}

const dialButtons = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['*', '0', '#'],
];

const subLabels: Record<string, string> = {
  '2': 'ABC', '3': 'DEF', '4': 'GHI', '5': 'JKL',
  '6': 'MNO', '7': 'PQRS', '8': 'TUV', '9': 'WXYZ',
  '0': '+',
};

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

export function DialPad({
  sipStatus, callStatus, callDuration, isMuted, currentNumber, callDirection,
  onConnect, onDisconnect, onCall, onHangUp, onAcceptIncoming, onToggleMute, onDTMF,
}: DialPadProps) {
  const [number, setNumber] = useState('');
  const isInCall = callStatus === 'calling' || callStatus === 'ringing' || callStatus === 'active';
  const isIncomingRinging = callStatus === 'ringing' && callDirection === 'inbound';
  const isConnected = sipStatus === 'registered';

  const handleDigit = useCallback((digit: string) => {
    if (isInCall) {
      onDTMF(digit);
    } else {
      setNumber(prev => prev + digit);
    }
  }, [isInCall, onDTMF]);

  const handleDelete = useCallback(() => {
    setNumber(prev => prev.slice(0, -1));
  }, []);

  const handleCall = useCallback(() => {
    if (number.trim()) {
      onCall(number.trim());
    }
  }, [number, onCall]);

  const statusColor = {
    disconnected: 'bg-muted text-muted-foreground',
    connecting: 'bg-warning/20 text-warning',
    registered: 'bg-success/20 text-success',
    error: 'bg-destructive/20 text-destructive',
  };

  const statusLabel = {
    disconnected: 'Desconectado',
    connecting: 'Conectando...',
    registered: 'Conectado',
    error: 'Erro',
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Connection Status */}
      <div className="flex items-center gap-2 w-full justify-between">
        <Badge className={`${statusColor[sipStatus]} text-xs`}>
          {sipStatus === 'registered' ? <Wifi className="w-3 h-3 mr-1" /> : <WifiOff className="w-3 h-3 mr-1" />}
          {statusLabel[sipStatus]}
        </Badge>
        <Button
          variant={isConnected ? 'destructive' : 'default'}
          size="sm"
          onClick={isConnected ? onDisconnect : onConnect}
          disabled={sipStatus === 'connecting'}
        >
          {sipStatus === 'connecting' && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
          {isConnected ? 'Desconectar' : 'Conectar SIP'}
        </Button>
      </div>

      {/* Active Call Display */}
      <AnimatePresence>
        {isInCall && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full"
          >
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-4 text-center">
                <p className="text-lg font-bold text-foreground">{currentNumber || number}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {callStatus === 'calling' && 'Chamando...'}
                  {isIncomingRinging && 'Chamada recebida...'}
                  {callStatus === 'ringing' && !isIncomingRinging && 'Tocando...'}
                  {callStatus === 'active' && formatTime(callDuration)}
                </p>
                <div className="flex justify-center gap-3 mt-4">
                  {isIncomingRinging ? (
                    <>
                      <Button
                        size="icon"
                        className="rounded-full w-14 h-14 bg-success hover:bg-success/90"
                        onClick={onAcceptIncoming}
                        aria-label="Atender"
                      >
                        <Phone className="w-6 h-6" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="icon"
                        className="rounded-full w-14 h-14"
                        onClick={onHangUp}
                        aria-label="Encerrar"
                      >
                        <PhoneOff className="w-6 h-6" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        size="icon"
                        className="rounded-full w-12 h-12"
                        onClick={onToggleMute}
                        disabled={callStatus !== 'active'}
                        aria-label={isMuted ? 'Ativar microfone' : 'Silenciar'}
                      >
                        {isMuted ? <MicOff className="w-5 h-5 text-destructive" /> : <Mic className="w-5 h-5" />}
                      </Button>
                      <Button
                        variant="destructive"
                        size="icon"
                        className="rounded-full w-14 h-14"
                        onClick={onHangUp}
                        aria-label="Encerrar"
                      >
                        <PhoneOff className="w-6 h-6" />
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Number Display */}
      {!isInCall && (
        <div className="relative w-full">
          <Input
            value={number}
            onChange={(e) => setNumber(e.target.value.replace(/[^0-9+*#]/g, ''))}
            placeholder="Digite o número"
            className="text-center text-xl font-mono tracking-widest h-14 bg-muted/50 border-border pr-10"
          />
          {number && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8"
              onClick={handleDelete}
              aria-label="Apagar dígito"
            >
              <Delete className="w-4 h-4 text-muted-foreground" />
            </Button>
          )}
        </div>
      )}

      {/* Dial Grid */}
      <div className="grid grid-cols-3 gap-2 w-full max-w-[280px]">
        {dialButtons.map((row) =>
          row.map((digit) => (
            <motion.button
              key={digit}
              whileTap={{ scale: 0.92 }}
              onClick={() => handleDigit(digit)}
              className="flex flex-col items-center justify-center w-full h-16 rounded-xl bg-muted/50 hover:bg-muted border border-border/50 transition-colors"
            >
              <span className="text-xl font-semibold text-foreground">{digit}</span>
              {subLabels[digit] && (
                <span className="text-[9px] text-muted-foreground tracking-widest">{subLabels[digit]}</span>
              )}
            </motion.button>
          ))
        )}
      </div>

      {/* Call Button */}
      {!isInCall && (
        <Button
          size="lg"
          className="rounded-full w-16 h-16 bg-success hover:bg-success/90"
          onClick={handleCall}
          disabled={!number.trim() || !isConnected}
          aria-label="Ligar"
        >
          <Phone className="w-7 h-7 text-success-foreground" />
        </Button>
      )}

      {!isConnected && !isInCall && (
        <p className="text-xs text-muted-foreground text-center">
          Conecte-se ao servidor SIP para fazer chamadas
        </p>
      )}
    </div>
  );
}

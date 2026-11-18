import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Mic, MicOff, Loader2, Play, Pause, Send, X, Wand2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/integrations/supabase/client';
import { attachMediaVolume } from '@/lib/mediaVolumeElement';
import { createStorageObjectId, requireUserStoragePath } from '@/lib/storage_object_upload';
import { zappTransition } from '@/lib/motion';

/** Aviso único quando o navegador recusa a reprodução por gesto/autoplay. */
const PLAYBACK_BLOCKED = 'O navegador bloqueou a reprodução. Toque no botão de novo.';

/** Teto da gravação: a Edge `voice-changer` recusa áudio acima de ~10 MB (≈60 s de webm). */
const MAX_RECORDING_MS = 60_000;

const VOICE_PRESETS = [
  // Masculinas
  { id: 'grave', emoji: '🎤', label: 'Grave', cat: 'masc' },
  { id: 'roger', emoji: '🎙️', label: 'Narrador', cat: 'masc' },
  { id: 'animado', emoji: '🤩', label: 'Animado', cat: 'masc' },
  { id: 'misterioso', emoji: '🕵️', label: 'Misterioso', cat: 'masc' },
  { id: 'brian', emoji: '🧔', label: 'Brian', cat: 'masc' },
  { id: 'bill', emoji: '👴', label: 'Bill', cat: 'masc' },
  { id: 'eric', emoji: '😎', label: 'Eric', cat: 'masc' },
  { id: 'will', emoji: '🤠', label: 'Will', cat: 'masc' },
  { id: 'callum', emoji: '🎩', label: 'Callum', cat: 'masc' },
  { id: 'charlie', emoji: '🧑', label: 'Charlie', cat: 'masc' },
  // Femininas
  { id: 'feminina', emoji: '👩', label: 'Sarah', cat: 'fem' },
  { id: 'laura', emoji: '💃', label: 'Laura', cat: 'fem' },
  { id: 'alice', emoji: '👱‍♀️', label: 'Alice', cat: 'fem' },
  { id: 'matilda', emoji: '👩‍🦰', label: 'Matilda', cat: 'fem' },
  { id: 'jessica', emoji: '💁‍♀️', label: 'Jessica', cat: 'fem' },
  { id: 'lily', emoji: '🌸', label: 'Lily', cat: 'fem' },
  // Neutras/Especiais
  { id: 'river', emoji: '🌊', label: 'River', cat: 'special' },
  { id: 'robo', emoji: '🤖', label: 'Robô', cat: 'special' },
  { id: 'glitch', emoji: '👾', label: 'Glitch', cat: 'special' },
  // Temáticas
  { id: 'santa', emoji: '🎅', label: 'Papai Noel', cat: 'theme' },
  { id: 'mrs_claus', emoji: '🤶', label: 'Mamãe Noel', cat: 'theme' },
  { id: 'elf', emoji: '🧝', label: 'Elfo', cat: 'theme' },
  { id: 'reindeer', emoji: '🦌', label: 'Rena', cat: 'theme' },
] as const;

/** Resultado do envio: `false` (ou rejeição) conta como falha e preserva a prévia. */
type ResultadoEnvioVoz = void | boolean;

interface VoiceChangerPickerProps {
  /**
   * Entrega o áudio JÁ transformado como `Blob` para o MESMO caminho do áudio
   * gravado — bucket privado (`audio-messages` no inbox, `team-chat-files` no
   * chat interno) na pasta do contato/conversa, com locator assinado na
   * leitura.
   *
   * Antes o picker subia o mp3 em `audio-memes/voice-changer/<ts>_<uuid>.mp3`
   * (bucket público, cache de um ano): a policy de INSERT de `audio-memes` só
   * aceita a pasta `auth.uid()` ou admin/supervisor, então atendente comum
   * levava "Erro ao enviar áudio", e quando passava o áudio do cliente ficava
   * com URL pública permanente.
   *
   * Pode ser síncrono ou assíncrono; devolver `false` ou rejeitar conta como
   * falha e preserva a prévia (regressão #350).
   */
  onSendAudioBlob?: (blob: Blob) => ResultadoEnvioVoz | Promise<ResultadoEnvioVoz>;
  /**
   * PK-17 — a voz transformada é dado pessoal: quando presente, o picker sobe o
   * mp3 para o bucket privado `voice-changer-tmp` na pasta do usuário
   * (`<uid>/voice_<ts>_<uuid>.mp3`, expurgo por TTL de 24 h) e entrega a URL
   * assinada do objeto (bucket privado não tem URL pública). Sem sessão não há
   * upload nem envio.
   */
  onSendAudio?: (signedUrl: string) => ResultadoEnvioVoz | Promise<ResultadoEnvioVoz>;
  disabled?: boolean;
}

export function VoiceChangerPicker({ onSendAudioBlob, onSendAudio, disabled }: VoiceChangerPickerProps) {
  const [open, setOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('grave');
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [transformedUrl, setTransformedUrl] = useState<string | null>(null);
  const [isTransforming, setIsTransforming] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPlayLoading, setIsPlayLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [transformError, setTransformError] = useState<string | null>(null);

  const reduceMotion = useReducedMotion() ?? false;

  // Com movimento reduzido nada se desloca: a entrada só muda opacidade. Sem
  // redução, entra com deslocamento curto.
  const entrada = (deslocamento: number) =>
    reduceMotion
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
      : { initial: { opacity: 0, y: deslocamento }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: deslocamento } };

  // Erro inline: mola curta (180–260 ms); com redução, só um fade.
  const entradaErro = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: zappTransition.fast }
    : {
        initial: { opacity: 0, y: -6 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -6 },
        transition: { type: 'spring' as const, duration: 0.22, bounce: 0.2 },
      };

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);
  const openRef = useRef(false);
  /** Timer do teto de gravação (60 s). */
  const recordingTimerRef = useRef<number | null>(null);
  /** Aborto da transformação em voo: disparado ao fechar o popover/desmontar. */
  const transformAbortRef = useRef<AbortController | null>(null);

  const limparTimerGravacao = useCallback(() => {
    if (recordingTimerRef.current !== null) {
      window.clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  const releaseCapture = useCallback(() => {
    limparTimerGravacao();
    const recorder = mediaRecorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      if (recorder.state !== 'inactive') recorder.stop();
      mediaRecorderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, [limparTimerGravacao]);

  const cleanup = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    // Fechar o popover cancela uma transformação em voo: a resposta tardia não
    // pode reaparecer depois que o usuário saiu da tela.
    transformAbortRef.current?.abort();
    releaseCapture();
    if (transformedUrl) URL.revokeObjectURL(transformedUrl);
    setRecordedBlob(null);
    setTransformedUrl(null);
    setIsRecording(false);
    setIsPlaying(false);
    setIsPlayLoading(false);
    setIsTransforming(false);
    setIsSending(false);
    setTransformError(null);
    chunksRef.current = [];
  }, [transformedUrl, releaseCapture]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      transformAbortRef.current?.abort();
      releaseCapture();
    };
  }, [releaseCapture]);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const stopRecording = useCallback(() => {
    limparTimerGravacao();
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, [limparTimerGravacao]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // getUserMedia é assíncrono: o popover pode ter fechado (ou o componente
      // desmontado) enquanto a permissão estava pendente. Nesse caso o stream
      // concedido é devolvido imediatamente e a captura não inicia.
      if (!mountedRef.current || !openRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        if (mediaRecorderRef.current !== recorder) return;
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setRecordedBlob(blob);
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        mediaRecorderRef.current = null;
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setTransformedUrl(null);
      // Teto de 60 s: sem corte, uma gravação esquecida só falharia no upload
      // (a Edge recusa acima de ~10 MB). Encerra a gravação e avisa.
      recordingTimerRef.current = window.setTimeout(() => {
        recordingTimerRef.current = null;
        toast.warning('Gravação limitada a 60 segundos');
        stopRecording();
      }, MAX_RECORDING_MS);
    } catch (err) {
      // O motivo real muda a ação do usuário: permissão negada, microfone
      // ausente e formato não suportado pedem coisas diferentes.
      const nome = err instanceof DOMException ? err.name : '';
      if (nome === 'NotAllowedError' || nome === 'SecurityError') {
        toast.error('Permissão de microfone negada. Libere o acesso no navegador.');
      } else if (nome === 'NotFoundError') {
        toast.error('Nenhum microfone encontrado neste dispositivo.');
      } else if (nome === 'NotSupportedError') {
        toast.error('Este navegador não grava áudio neste formato.');
      } else {
        toast.error('Não foi possível acessar o microfone');
      }
    }
  }, [stopRecording]);

  const transformVoice = useCallback(async () => {
    if (!recordedBlob) return;
    setIsTransforming(true);
    setTransformError(null);
    if (transformedUrl) { URL.revokeObjectURL(transformedUrl); setTransformedUrl(null); }

    // Uma transformação por vez: se o usuário pedir outra voz, a anterior é
    // abortada em vez de competir para pintar a prévia.
    transformAbortRef.current?.abort();
    const controller = new AbortController();
    transformAbortRef.current = controller;

    try {
      const formData = new FormData();
      formData.append('audio', recordedBlob, 'recording.webm');
      formData.append('voice_preset', selectedVoice);

      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/voice-changer`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token || SUPABASE_ANON_KEY}`,
            'apikey': SUPABASE_ANON_KEY,
          },
          body: formData,
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errData.error || `Error ${response.status}`);
      }

      const audioBlob = await response.blob();
      // O popover pode ter fechado (ou o componente desmontado) enquanto a Edge
      // respondia: o blob tardio não vira prévia nem cria URL órfã.
      if (controller.signal.aborted || !mountedRef.current || !openRef.current) return;
      const url = URL.createObjectURL(audioBlob);
      setTransformedUrl(url);
      toast.success('Voz transformada! 🎭');
    } catch (err) {
      // Cancelamento não é erro do usuário: sai sem toast nem aviso inline.
      if (controller.signal.aborted) return;
      const msg = err instanceof Error ? err.message : 'desconhecido';
      // Aviso inline (com "Tentar de novo") além do toast: o usuário não perde
      // a gravação e recupera o fluxo sem regravar.
      setTransformError(msg);
      toast.error(`Erro ao transformar voz: ${msg}`);
    } finally {
      if (transformAbortRef.current === controller) transformAbortRef.current = null;
      if (mountedRef.current) setIsTransforming(false);
    }
  }, [recordedBlob, selectedVoice, transformedUrl]);

  const togglePlay = useCallback(async () => {
    if (!transformedUrl || isPlayLoading) return;
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }
    setIsPlayLoading(true);
    const audio = new Audio(transformedUrl);
    // E36 — prévia de voice changer é mídia de conversa: respeita o volume global.
    const detachMediaVolume = attachMediaVolume(audio);
    audio.onended = () => { detachMediaVolume(); setIsPlaying(false); };
    audioRef.current = audio;
    try {
      await audio.play();
      if (!mountedRef.current) return;
      setIsPlaying(true);
    } catch {
      // Reprodução recusada: não deixa o botão preso em "Pausar".
      detachMediaVolume();
      audioRef.current = null;
      if (mountedRef.current) setIsPlaying(false);
      toast.error(PLAYBACK_BLOCKED);
    } finally {
      if (mountedRef.current) setIsPlayLoading(false);
    }
  }, [transformedUrl, isPlaying, isPlayLoading]);

  const handleSend = useCallback(async () => {
    if (!transformedUrl || isSending) return;
    setIsSending(true);
    try {
      const response = await fetch(transformedUrl);
      const blob = await response.blob();
      // PK-17: com `onSendAudio`, a voz transformada sobe para o temporário do
      // usuário e o envio leva a URL assinada do MESMO objeto.
      if (onSendAudio) {
        const { data: { user } } = await supabase.auth.getUser();
        let caminho: string;
        try {
          caminho = requireUserStoragePath(user?.id, `voice_${Date.now()}_${createStorageObjectId()}.mp3`);
        } catch {
          toast.error('Sessão expirada: entre de novo para enviar a voz transformada');
          return;
        }
        const { error: uploadError } = await supabase.storage
          .from('voice-changer-tmp')
          .upload(caminho, blob);
        if (uploadError) throw uploadError;
        const { data: assinada, error: assinaturaError } = await supabase.storage
          .from('voice-changer-tmp')
          .createSignedUrl(caminho, 3600);
        if (assinaturaError || !assinada?.signedUrl) throw assinaturaError ?? new Error('Não foi possível gerar a URL assinada');
        const resultado = await onSendAudio(assinada.signedUrl);
        if (resultado === false) throw new Error('Envio de áudio não confirmado');
        setOpen(false);
        cleanup();
        toast.success('Áudio enviado! 🎤');
        return;
      }
      // O upload é do caminho do áudio gravado (bucket privado, pasta do
      // contato/conversa) e fica com quem conhece essa pasta — o picker só
      // entrega o Blob. O envio da mensagem pode ser síncrono ou assíncrono e
      // pode falhar (`false` ou rejeição). Só fecha o popover e limpa a prévia
      // DEPOIS da confirmação de sucesso — assim uma falha preserva
      // `transformedUrl` para o usuário tentar de novo (#350).
      const resultado = onSendAudioBlob ? await onSendAudioBlob(blob) : undefined;
      if (resultado === false) throw new Error('Envio de áudio não confirmado');
      setOpen(false);
      cleanup();
      toast.success('Áudio enviado! 🎤');
    } catch {
      toast.error('Erro ao enviar áudio');
    } finally {
      setIsSending(false);
    }
  }, [transformedUrl, isSending, onSendAudioBlob, onSendAudio, cleanup]);

  return (
    <Tooltip>
      <Popover open={open} onOpenChange={(v) => { openRef.current = v; setOpen(v); if (!v) cleanup(); }}>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="w-9 h-9 text-muted-foreground hover:text-foreground hover:bg-muted shrink-0" disabled={disabled} aria-label="Voice Changer">
              <Wand2 className="w-[18px] h-[18px]" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">Voice Changer</TooltipContent>

        <PopoverContent className="w-[min(320px,calc(100vw_-_1rem))] p-0 bg-popover border-border" align="end" side="top" sideOffset={8}>
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
            <Wand2 className="w-4 h-4 text-primary" />
            <h4 className="text-sm font-semibold text-foreground">Voice Changer</h4>
            <span className="text-3xs text-muted-foreground ml-auto">Powered by ElevenLabs</span>
          </div>

          <div className="p-3 space-y-3">
            {/* Voice Selection */}
             <div>
              <p className="text-xs text-muted-foreground mb-2">Escolha a voz:</p>
              <div className="max-h-[180px] overflow-y-auto pr-1">
                <div className="grid grid-cols-5 gap-1">
                  {VOICE_PRESETS.map(v => (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVoice(v.id)}
                      className={cn(
                        'flex flex-col items-center gap-0.5 p-1.5 rounded-lg text-center transition-colors border',
                        selectedVoice === v.id
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-transparent hover:bg-muted text-muted-foreground'
                      )}
                    >
                      <span className="text-base">{v.emoji}</span>
                      <span className="text-[9px] font-medium leading-tight truncate w-full">{v.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Recording Area */}
            <div className="flex flex-col items-center gap-2 py-2">
              <AnimatePresence mode="wait">
                {!recordedBlob && !isRecording && (
                  <motion.div key="idle" {...entrada(6)}>
                    <Button
                      onClick={startRecording}
                      size="lg"
                      aria-label="Gravar áudio"
                      className="rounded-full w-16 h-16 bg-primary hover:bg-primary/90 [@media(pointer:coarse)]:min-w-[44px] [@media(pointer:coarse)]:min-h-[44px]"
                    >
                      <Mic className="w-7 h-7" />
                    </Button>
                    <p className="text-2xs text-muted-foreground text-center mt-1.5">Toque para gravar</p>
                  </motion.div>
                )}

                {isRecording && (
                  <motion.div key="recording" {...entrada(6)} className="flex flex-col items-center">
                    <motion.div
                      animate={reduceMotion ? undefined : { scale: [1, 1.1, 1] }}
                      transition={reduceMotion ? undefined : { repeat: Infinity, duration: 1.2 }}
                    >
                      <Button
                        onClick={stopRecording}
                        size="lg"
                        variant="destructive"
                        aria-label="Parar gravação"
                        className="rounded-full w-16 h-16 [@media(pointer:coarse)]:min-w-[44px] [@media(pointer:coarse)]:min-h-[44px]"
                      >
                        <MicOff className="w-7 h-7" />
                      </Button>
                    </motion.div>
                    <div className="flex items-center gap-1.5 mt-2">
                      <motion.div
                        animate={reduceMotion ? undefined : { opacity: [0.4, 1, 0.4] }}
                        transition={reduceMotion ? undefined : { repeat: Infinity, duration: 1 }}
                        className="w-2 h-2 rounded-full bg-destructive"
                      />
                      <span className="text-xs text-destructive font-medium">Gravando...</span>
                    </div>
                  </motion.div>
                )}

                {recordedBlob && !isRecording && (
                  <motion.div key="recorded" {...entrada(10)} className="w-full space-y-2">
                    <div className="flex items-center justify-center gap-2">
                      <Button variant="outline" size="sm" className="h-10" onClick={() => { setRecordedBlob(null); setTransformedUrl(null); setTransformError(null); }}>
                        <X className="w-3.5 h-3.5 mr-1" />Regravar
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => void transformVoice()}
                        disabled={isTransforming}
                        className="bg-primary h-10"
                      >
                        {isTransforming ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Wand2 className="w-3.5 h-3.5 mr-1" />}
                        {isTransforming ? 'Transformando...' : 'Transformar voz'}
                      </Button>
                    </div>

                    {/* Erro de transformação inline: aviso curto + motivo detalhado no tooltip */}
                    <AnimatePresence initial={false}>
                      {transformError && (
                        <motion.div
                          key="transform-error"
                          data-testid="voz-erro-transformacao"
                          role="alert"
                          {...entradaErro}
                          className="flex items-center gap-2 px-1"
                        >
                          <AlertCircle className="w-4 h-4 text-destructive shrink-0" aria-hidden="true" />
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-xs text-destructive flex-1 cursor-help truncate">
                                Falha ao transformar a voz
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" variant="error">{transformError}</TooltipContent>
                          </Tooltip>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-10 text-xs border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => void transformVoice()}
                            disabled={isTransforming}
                          >
                            Tentar de novo
                          </Button>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {transformedUrl && (
                      <motion.div {...entrada(5)} className="flex items-center justify-center gap-2 pt-1">
                        {/* Largura fixa: alternar play/pausa/carregando não muda o layout */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-10 w-28 justify-center"
                          aria-label={isPlayLoading ? 'Carregando prévia' : isPlaying ? 'Pausar prévia' : 'Ouvir prévia'}
                          onClick={() => void togglePlay()}
                          disabled={isPlayLoading}
                        >
                          {isPlayLoading ? <Loader2 className="w-3.5 h-3.5 mr-1 motion-safe:animate-spin" /> : isPlaying ? <Pause className="w-3.5 h-3.5 mr-1" /> : <Play className="w-3.5 h-3.5 mr-1" />}
                          {isPlayLoading ? 'Carregando' : isPlaying ? 'Pausar' : 'Ouvir'}
                        </Button>
                        <Button size="sm" onClick={() => void handleSend()} disabled={isSending} className="bg-primary hover:bg-primary/90 h-10">
                          {isSending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
                          Enviar
                        </Button>
                      </motion.div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="px-3 py-1.5 border-t border-border/30">
            <p className="text-3xs text-muted-foreground text-center">
              Grave → Escolha a voz → Transforme → Envie 🎭
            </p>
          </div>
        </PopoverContent>
      </Popover>
    </Tooltip>
  );
}

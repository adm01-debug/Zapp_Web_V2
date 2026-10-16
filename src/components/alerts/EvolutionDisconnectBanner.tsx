import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { WifiOff, RefreshCw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface DisconnectedInstance {
  id: string;
  instance_id: string;
  phone_number: string | null;
  status: string;
}

export function EvolutionDisconnectBanner() {
  const [disconnected, setDisconnected] = useState<DisconnectedInstance[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [reconnecting, setReconnecting] = useState<string | null>(null);
  const reduceMotion = useReducedMotion() ?? false;

  const fetchStatus = async () => {
    const { data } = await supabase
      .from('whatsapp_connections')
      .select('id, instance_id, phone_number, status')
      .eq('status', 'disconnected');
    if (data && data.length > 0) {
      setDisconnected(data as DisconnectedInstance[]);
      setDismissed(false); // Re-show if new disconnections
    } else {
      setDisconnected([]);
    }
  };

  useEffect(() => {
    void fetchStatus();

    // Real-time updates on connection status changes
    const channel = supabase
      .channel('disconnect-banner')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'whatsapp_connections' },
        () => { void fetchStatus(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleReconnect = async (conn: DisconnectedInstance) => {
    setReconnecting(conn.instance_id);
    try {
      const { data, error } = await supabase.functions.invoke('evolution-api/instance/connect', {
        method: 'POST',
        body: { instanceName: conn.instance_id },
      });
      if (error) throw error;
      // R2-API-042: a Edge Function responde HTTP 200 também nas falhas LÓGICAS — o erro vem no
      // CORPO (`{ error: true, message }`), não no campo `error` do invoke. Olhando só o
      // transporte, o banner anunciava "Reconectando..." como se a solicitação tivesse sido aceita.
      if (data?.error) {
        throw new Error(typeof data.error === 'string' ? data.error : data.message ?? 'Falha ao reconectar');
      }
      toast.success(`Reconectando ${conn.instance_id}... Escaneie o QR Code na tela de conexões.`);
    } catch {
      toast.error(`Erro ao reconectar ${conn.instance_id}`);
    } finally {
      setReconnecting(null);
    }
  };

  if (disconnected.length === 0 || dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
        // SL-076: era `fixed top-0 left-0 right-0 z-[90]` — faixa de largura total no topo do
        // viewport que cobria 44 dos 53px (83%) da barra de abas do inbox e engolia os cliques de
        // SalesView/Journey (`subtree intercepts pointer events` em 19 tentativas, medido em
        // 02/10). Os avisos globais do shell já vivem no rodapé (MfaAdminNudge z-[80], ConnectionToast
        // z-50): esta faixa passa a seguir o mesmo lugar — acima do compositor e abaixo dos outros
        // avisos — e não intercepta ponteiro nenhum fora do próprio aviso (`pointer-events-none`
        // no wrapper, `pointer-events-auto` só no cartão).
        // Faixa de status do app: sem papel de landmark, o axe acusa todo o texto do aviso como
        // "conteúdo fora de landmark" em todas as telas. `region` + rótulo resolve a estrutura e
        // `aria-live` faz o aviso ser anunciado quando aparece.
        role="region"
        aria-label="Status das conexões do WhatsApp"
        aria-live="polite"
        className="pointer-events-none fixed bottom-24 left-0 right-0 z-[90] mx-auto w-[min(28rem,calc(100%-2rem))]"
      >
        {/* E100-2 · contraste medido no navegador: branco sobre `bg-destructive` do tema padrao
            (hsl(0 84% 60%) = RGB 239,67,67) da 3.78:1 — abaixo dos 4.5:1 exigidos para texto normal
            (WCAG AA). `bg-red-700` da 6.47:1 e nao depende do tema. Ver e2e/inbox-contraste.spec.ts. */}
        <div className="pointer-events-auto flex items-center gap-3 rounded-lg bg-red-700 px-4 py-2.5 text-white shadow-lg">
          <WifiOff className="w-5 h-5 shrink-0 motion-safe:animate-pulse" aria-hidden="true" />
          <div className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">
              {disconnected.length === 1
                ? `⚠️ Conexão "${disconnected[0].instance_id}" está desconectada!`
                : `⚠️ ${disconnected.length} conexões estão desconectadas!`}
            </span>{' '}
            <span className="text-xs">Mensagens não serão enviadas/recebidas.</span>
          </div>
          {disconnected.length === 1 && (
            <button
              onClick={() => handleReconnect(disconnected[0])}
              disabled={reconnecting === disconnected[0].instance_id}
              className="shrink-0 px-3 py-1 bg-white text-red-800 hover:bg-red-100 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw className={cn('w-3 h-3', reconnecting && 'animate-spin')} />
              Reconectar
            </button>
          )}
          <button
            onClick={() => setDismissed(true)}
            className="shrink-0 p-1 rounded hover:bg-white/20 transition-colors"
            aria-label="Fechar alerta"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

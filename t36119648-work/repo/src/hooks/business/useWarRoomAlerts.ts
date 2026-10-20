import { useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePushNotifications } from '../system/usePushNotifications';
import { useNotificationSettings } from '../system/useNotificationSettings';

interface WarRoomAlert {
  id: string;
  alert_type: string;
  title: string;
  message: string;
  source: string | null;
  is_read: boolean;
  created_at: string;
  dedupe_key?: string | null;
}

// R2-MOD-074: o monitor de SLA recriava o alerta a cada republicação da página de
// alertas quando as violações passavam de 50, porque decidia pela CONTAGEM de
// alertas visíveis numa consulta de APRESENTAÇÃO (limit 50) e gravava sem chave.
// Aqui as três peças da correção: (1) a identidade do incidente é o CONJUNTO das
// conversas violadas, não a contagem da página; (2) a leitura das violações pagina,
// para o conjunto nunca ser um pedaço da tabela; (3) o INSERT leva `dedupe_key`
// (índice único parcial `ux_warroom_alerts_dedupe_key`), então refetch, realtime e
// um segundo cliente admin esbarram em 23505 e não criam linha — logo, não disparam
// som nem push. Alerta já dispensado continua ocupando a chave: o incidente
// encerrado pelo operador não volta a alertar.
const SLA_MONITOR_SOURCE = 'sla-monitor';
const SLA_BREACH_PAGE = 1000; // teto de linhas do PostgREST numa resposta

function hex32(valor: number): string {
  return (valor >>> 0).toString(16).padStart(8, '0');
}

/**
 * Identidade do incidente "estas conversas com SLA violado": hash FNV-1a de 64 bits
 * (duas passadas) sobre o conjunto ORDENADO de ids. Estável entre ciclos e entre
 * clientes. Não usa os ids crus porque uma entrada de índice btree não passa de
 * ~2,7 kB e o conjunto pode ter centenas de ids.
 */
export function slaIncidentKey(breachIds: readonly string[]): string {
  let h1 = 0x811c9dc5;
  let h2 = 0xc2b2ae35;
  for (const id of [...breachIds].sort()) {
    for (let i = 0; i < id.length; i += 1) {
      const c = id.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193);
      h2 = Math.imul(h2 ^ (c + i), 0x27d4eb2d);
    }
    h1 = Math.imul(h1 ^ 0x2c, 0x01000193); // separador: ['a','bc'] difere de ['ab','c']
    h2 = Math.imul(h2 ^ 0x2c, 0x27d4eb2d);
  }
  return `${SLA_MONITOR_SOURCE}:v1:${hex32(h1)}${hex32(h2)}`;
}

/**
 * Lê TODAS as conversas com SLA violado, página a página: uma resposta truncada no
 * teto do PostgREST viraria um conjunto parcial — e conjunto parcial não é sinal de
 * incidente novo, é uma leitura incompleta.
 */
async function fetchBreachedConversationIds(): Promise<string[]> {
  const ids: string[] = [];
  for (let de = 0; ; de += SLA_BREACH_PAGE) {
    const { data, error } = await supabase
      .from('conversation_sla')
      .select('id')
      .eq('first_response_breached', true)
      .order('id', { ascending: true })
      .range(de, de + SLA_BREACH_PAGE - 1);
    if (error) throw error;

    const pagina = (data ?? []) as Array<{ id: string }>;
    ids.push(...pagina.map((linha) => linha.id));
    if (pagina.length < SLA_BREACH_PAGE) break;
  }
  return ids;
}

export function useWarRoomAlerts(soundEnabled?: boolean) {
  const queryClient = useQueryClient();
  const { showNotification, permission } = usePushNotifications();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { settings, isQuietHours } = useNotificationSettings();
  // Sem valor explícito do chamador, o mudo vem da preferência do usuário (`user_settings`),
  // nunca de um `true` cravado.
  const soundGate = soundEnabled ?? settings.soundEnabled;

  // Initialize alert sound
  // Fora do controle de volume de MÍDIA por definição: é ALERTA (WebAudio/HTMLMedia
  // fora do inbox) e não deve entrar no `mediaVolumeStore`. O volume dele é o volume de
  // alerta do painel (`user_settings.sound_volume`, 10-100) — não um valor fixo.
  useEffect(() => {
    audioRef.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgip6LbUg3WX2OgGtLPE51g3lgSkRHZXVzYFRDSWBwaV5WTFFcaGReW1haYmhkYl9eYGVpZ2VkZGRnamlnZmZnaGlpaGdnaGhpaWhoaGhpaWhoaGlpaGlpaGhpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaQ==');
  }, []);

  // Volume do alerta = volume de alerta do painel (10-100 -> 0.1-1.0).
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = settings.soundVolume / 100;
  }, [settings.soundVolume]);

  const playAlertSound = useCallback(() => {
    // Alerta do War Room também respeita o mudo do painel e o horário de silêncio.
    if (soundGate && !isQuietHours() && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  }, [soundGate, isQuietHours]);

  // Fetch existing alerts (página de APRESENTAÇÃO do painel: 50 mais recentes não lidos).
  const { data: alerts = [] } = useQuery({
    queryKey: ['warroom-alerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warroom_alerts')
        .select('*')
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as WarRoomAlert[];
    },
    refetchInterval: 30000,
  });

  // Real-time subscription for new alerts
  useEffect(() => {
    const channel = supabase
      .channel('warroom-alerts-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'warroom_alerts' },
        (payload) => {
          const alert = payload.new as WarRoomAlert;
          queryClient.invalidateQueries({ queryKey: ['warroom-alerts'] });

          // Play sound
          if (alert.alert_type === 'critical') {
            playAlertSound();
            playAlertSound(); // double beep for critical
          } else {
            playAlertSound();
          }

          // Push notification
          if (permission === 'granted') {
            showNotification({
              title: `⚠️ ${alert.title}`,
              body: alert.message,
              tag: `warroom-${alert.id}`,
              requireInteraction: alert.alert_type === 'critical',
            });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient, playAlertSound, permission, showNotification]);

  // Dismiss alert
  const dismissAlert = async (alertId: string) => {
    await supabase.from('warroom_alerts').update({ is_read: true }).eq('id', alertId);
    queryClient.invalidateQueries({ queryKey: ['warroom-alerts'] });
  };

  // SLA breach monitor — checa a cada 60 s e cria no máximo UM alerta por incidente.
  // Não depende da página de alertas: era essa dependência que rearmava a checagem a
  // cada republicação da página (realtime/refetch) e recriava o alerta das mesmas
  // violações. Depender da página também deixava a decisão nas mãos de um recorte de 50.
  useEffect(() => {
    let encerrado = false;

    const checkSLABreaches = async () => {
      let breachIds: string[];
      try {
        breachIds = await fetchBreachedConversationIds();
      } catch (error) {
        // Leitura que falha NÃO é sinal de violação nova: o ciclo é abandonado (nada é
        // gravado a partir de dado parcial) e o próximo intervalo tenta de novo.
        console.error('[useWarRoomAlerts] falha ao ler as violações de SLA', error);
        return;
      }
      if (encerrado || breachIds.length === 0) return;

      const { error } = await supabase.from('warroom_alerts').insert({
        alert_type: 'critical',
        title: `${breachIds.length} SLA(s) Violado(s)`,
        message: `Existem ${breachIds.length} conversas com SLA violado que precisam de atenção imediata.`,
        source: SLA_MONITOR_SOURCE,
        dedupe_key: slaIncidentKey(breachIds),
      });
      // 23505 = o incidente já tem alerta (inclusive dispensado): é o resultado
      // esperado da idempotência, não uma falha. Qualquer outro erro é registrado —
      // não é engolido — e como nenhuma linha entrou, o próximo ciclo tenta de novo.
      if (error && error.code !== '23505') {
        console.error('[useWarRoomAlerts] falha ao gravar o alerta de SLA', error);
      }
    };

    void checkSLABreaches();
    const interval = setInterval(() => { void checkSLABreaches(); }, 60000);
    return () => { encerrado = true; clearInterval(interval); };
  }, []);

  return { alerts, dismissAlert };
}

import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/ui/use-toast';
import { playNotificationSound, showBrowserNotification } from '@/utils/notificationSounds';
import { useNotificationSettings } from '@/hooks/system/useNotificationSettings';
import { useAuth } from '@/hooks/auth/useAuth';
import { log } from '@/lib/logger';

interface TranscriptionNotificationOptions {
  enabled?: boolean;
  showToast?: boolean;
  playSound?: boolean;
  showBrowserNotification?: boolean;
}

/** Linha de `public.messages` que o Realtime entrega no UPDATE. */
export interface MensagemTranscrita {
  id: string;
  transcription_status?: string | null;
  transcription?: string | null;
  /** Carimbo gravado pela Edge quando a transcrição ficou pronta (HZ-13a). */
  transcribed_at?: string | null;
  contact_id?: string | null;
}

/** Estado ANTERIOR da linha. Com REPLICA IDENTITY DEFAULT só vem o `id`. */
export interface MensagemTranscritaAnterior {
  transcription_status?: string | null;
}

/** Janela em que o carimbo `transcribed_at` conta como "a transcrição concluiu agora" (~30 s do cartão). */
export const JANELA_CARIMBO_TRANSCRICAO_MS = 30_000;

export type SinalConclusao = 'transicao_de_status' | 'carimbo_recente' | 'ausente';

/** Origem que liberou ou suprimiu o aviso (vai para o log). */
export type MotivoAviso =
  | 'responsavel_proprio'
  | 'sem_responsavel'
  | 'responsavel_desconhecido'
  | 'consulta_sem_resposta'
  | 'outro_responsavel';

/** Nome do canal estável por usuário: remontar o mesmo usuário reusa o MESMO canal. */
export function nomeCanalTranscricao(userId?: string | null): string {
  return userId ? `transcription-notifications:${userId}` : 'transcription-notifications';
}

function carimboRecente(carimbo: string | null | undefined, agora: number): boolean {
  if (!carimbo) return false;
  const instante = Date.parse(carimbo);
  if (Number.isNaN(instante)) return false;
  const idade = agora - instante;
  return idade >= 0 && idade <= JANELA_CARIMBO_TRANSCRICAO_MS;
}

/**
 * Diz se o evento é uma CONCLUSÃO recém-chegada, sem depender de `old`.
 *
 * `payload.old` só carrega as outras colunas enquanto `public.messages` estiver com
 * `REPLICA IDENTITY FULL`; o cartão SL-104 caminha para `DEFAULT`, e aí `old` traz só o `id` — a
 * guarda "antes não estava completo" viraria sempre verdadeira e toda atualização posterior
 * (marcar como lido, edição, status de entrega) reavisaria. O sinal sólido passa a ser o carimbo
 * `transcribed_at` gravado pela Edge; a transição de status continua valendo como sinal de
 * compatibilidade enquanto o FULL existir. Sem nenhum dos dois sinais, NÃO é conclusão de agora.
 */
export function sinalDeConclusao(
  novo: MensagemTranscrita,
  anterior: MensagemTranscritaAnterior | undefined,
  agora: number,
): SinalConclusao {
  const statusAnterior = anterior?.transcription_status;
  if (statusAnterior !== undefined && statusAnterior !== null && statusAnterior !== 'completed') {
    return 'transicao_de_status';
  }
  return carimboRecente(novo.transcribed_at, agora) ? 'carimbo_recente' : 'ausente';
}

/**
 * Responsabilidade da conversa (`contacts.assigned_to` é `profiles.id`).
 *
 * A checagem só APERTA: o único caso que suprime o aviso é o contato ter dono e o dono ser outro
 * perfil. Informação faltando (consulta sem resposta, perfil ou dono desconhecido) mantém o aviso
 * de antes — e o `motivo` devolvido é a origem que liberou esse fallback, para o log. Repare que
 * `!assigned_to` NÃO suprime: contato sem dono não pertence a ninguém.
 */
export function decidirAvisoPorResponsabilidade(
  responsavel: string | null | undefined,
  meuPerfilId: string | null | undefined,
  consultaRespondeu: boolean,
): { avisar: boolean; motivo: MotivoAviso } {
  if (!consultaRespondeu) return { avisar: true, motivo: 'consulta_sem_resposta' };
  if (!meuPerfilId) return { avisar: true, motivo: 'responsavel_desconhecido' };
  if (!responsavel) return { avisar: true, motivo: 'sem_responsavel' };
  if (responsavel === meuPerfilId) return { avisar: true, motivo: 'responsavel_proprio' };
  return { avisar: false, motivo: 'outro_responsavel' };
}

export function useTranscriptionNotifications(options: TranscriptionNotificationOptions = {}) {
  const { 
    enabled = true, 
    showToast = true, 
    playSound = true, 
    showBrowserNotification: showBrowserNotif = true 
  } = options;

  const { user, profile } = useAuth();
  const { settings, isQuietHours } = useNotificationSettings();
  const processedIdsRef = useRef<Set<string>>(new Set());

  // Perfil vigente lido no MOMENTO do evento (ref, nunca dependência do canal): o perfil chega
  // depois do mount e a comparação com `contacts.assigned_to` precisa do valor atual — com o perfil
  // nas dependências do canal, ele seria reassinado a cada carga de perfil. A sincronização fica no
  // efeito (escrever em ref durante o render é erro de lint `react-hooks/refs`).
  const meuPerfilIdRef = useRef<string | null>(profile?.id ?? null);
  useEffect(() => {
    meuPerfilIdRef.current = profile?.id ?? null;
  }, [profile?.id]);

  useEffect(() => {
    if (!enabled || !settings.transcriptionNotificationEnabled) return;

    // O handler do canal é assíncrono (espera a busca do contato). Sem este sinalizador, uma
    // notificação já em voo seguia até o fim e alertava DEPOIS de o hook ser desativado/desmontado
    // (o `removeChannel` do cleanup só fecha o canal; não cancela a continuação agendada).
    let desativado = false;

    const channel = supabase
      .channel(nomeCanalTranscricao(user?.id))
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          if (desativado) return;

          const newData = payload.new as { id: string; transcription_status?: string; transcription?: string; contact_id?: string };
          const oldData = payload.old as { transcription_status?: string } | undefined;

          const newData = payload.new as MensagemTranscrita;
          const oldData = payload.old as MensagemTranscritaAnterior | undefined;

          // Conclusão: status completo, com texto, ainda não avisada e — o ponto do HZ3-007 —
          // RECÉM-CONCLUÍDA segundo o carimbo da Edge (ou a transição de status, enquanto o
          // `old` trouxer a coluna).
          if (
            newData.transcription_status !== 'completed' ||
            !newData.transcription ||
            processedIdsRef.current.has(newData.id)
          ) {
            return;
          }

          const sinal = sinalDeConclusao(newData, oldData, Date.now());
          if (sinal === 'ausente') {
            log.debug(`[transcrição] evento ignorado (sem sinal de conclusão recente) — msg ${newData.id}`);
            return;
          }

          // Mark as processed to avoid duplicate notifications
          processedIdsRef.current.add(newData.id);

          // Check quiet hours
          if (isQuietHours()) {
            return;
          }

          // Nome do contato e responsabilidade da conversa numa consulta só. Um erro de leitura
          // não pode rejeitar o handler: a consulta fica dentro de try/catch e o fallback (avisa,
          // com o nome genérico) assume.
          let contactName = 'Contato';
          let responsavel: string | null = null;
          let consultaRespondeu = false;
          if (newData.contact_id) {
            try {
              const { data: contact } = await supabase
                .from('contacts')
                .select('name, assigned_to')
                .eq('id', newData.contact_id)
                .single();

              consultaRespondeu = !!contact;
              if (contact?.name) {
                contactName = contact.name;
              }
              responsavel = contact?.assigned_to ?? null;
            } catch (erro) {
              log.warn(`[transcrição] falha ao buscar o contato ${newData.contact_id}`, erro);
            }
          }

            // A busca acima pode ter demorado: se o hook saiu de cena nesse meio-tempo, nada de
            // toast/som/notificação — a notificação pendente é descartada.
            if (desativado) return;

            // Truncate transcription for preview
            const transcriptionPreview = newData.transcription.length > 100
              ? newData.transcription.slice(0, 100) + '...'
              : newData.transcription;

          // Só APERTA: aviso de conversa sabidamente de outro responsável não sai; qualquer
          // informação faltando mantém o comportamento anterior (o motivo fica no log).
          const decisao = decidirAvisoPorResponsabilidade(
            responsavel,
            meuPerfilIdRef.current,
            consultaRespondeu,
          );
          log.debug(
            `[transcrição] aviso ${decisao.avisar ? 'liberado' : 'suprimido'} — origem: ${decisao.motivo} — msg ${newData.id}`,
          );
          if (!decisao.avisar) return;

          // Truncate transcription for preview
          const transcriptionPreview = newData.transcription.length > 100
            ? newData.transcription.slice(0, 100) + '...'
            : newData.transcription;

          // Show toast notification
          if (showToast) {
            toast({
              title: '🎙️ Áudio transcrito',
              description: `${contactName}: "${transcriptionPreview}"`,
              duration: 5000,
            });
          }

          // Play sound
          if (playSound && settings.soundEnabled) {
            playNotificationSound('message', settings.transcriptionSoundType, settings.soundVolume);
          }

          // Show browser notification
          if (showBrowserNotif && settings.browserNotifications) {
            showBrowserNotification(
              'Áudio transcrito',
              `${contactName}: "${transcriptionPreview}"`,
            );
          }
        }
      )
      .subscribe();

    return () => {
      desativado = true;
      supabase.removeChannel(channel);
    };
  }, [enabled, showToast, playSound, showBrowserNotif, settings, isQuietHours, settings.transcriptionNotificationEnabled, user?.id]);

  // Cleanup processed IDs periodically to prevent memory leak
  useEffect(() => {
    const interval = setInterval(() => {
      if (processedIdsRef.current.size > 100) {
        const idsArray = Array.from(processedIdsRef.current);
        processedIdsRef.current = new Set(idsArray.slice(-50));
      }
    }, 60000);

    return () => clearInterval(interval);
  }, []);
}

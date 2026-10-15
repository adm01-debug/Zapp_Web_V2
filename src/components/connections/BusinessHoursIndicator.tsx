import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { log } from '@/lib/logger';
import { Clock, Sun, Moon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

/*
 * Helpers de janela de horário — puros, sem React e sem rede. Vivem aqui
 * (arquivo leve do par) porque o `BusinessHoursDialog` valida com as mesmas
 * regras que o selo usa: uma regra só, dois consumidores.
 */

/** Minutos desde a meia-noite para `HH:MM` (aceita `HH:MM:SS`). `null` = inválido. */
export function minutosDoHorario(valor: string | null | undefined): number | null {
  if (typeof valor !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(valor.trim());
  if (!m) return null;
  const horas = Number(m[1]);
  const minutos = Number(m[2]);
  if (horas > 23 || minutos > 59) return null;
  return horas * 60 + minutos;
}

export type TipoJanela = 'incompleta' | 'igual' | 'normal' | 'noturna';

/**
 * Classifica a janela do dia pelo par início/fim:
 * - `noturna`: o fim é menor que o início (22:00 → 06:00), então a janela vira o dia;
 * - `igual`: início e fim no mesmo minuto não é janela — é erro de cadastro;
 * - `incompleta`: falta um dos dois horários ou o formato é inválido.
 */
export function classificarJanela(
  abre: string | null | undefined,
  fecha: string | null | undefined,
): TipoJanela {
  const inicio = minutosDoHorario(abre);
  const fim = minutosDoHorario(fecha);
  if (inicio === null || fim === null) return 'incompleta';
  if (inicio === fim) return 'igual';
  return fim < inicio ? 'noturna' : 'normal';
}

/**
 * O relógio está dentro da janela QUE COMEÇA neste dia?
 *
 * `agoraMinutos` são minutos desde a meia-noite no fuso da conexão. Quando o
 * fim é menor que o início (22:00→06:00) a janela termina na manhã SEGUINTE: o
 * dia abre às `abre` e a madrugada depois da meia-noite pertence à linha de
 * ontem (quem junta as duas é `resumoDoHorario`). Extremos são inclusivos.
 * Início igual ao fim não é janela.
 */
export function estaNaJanela(
  agoraMinutos: number,
  abre: string | null | undefined,
  fecha: string | null | undefined,
): boolean {
  const tipo = classificarJanela(abre, fecha);
  if (tipo === 'incompleta' || tipo === 'igual') return false;
  const inicio = minutosDoHorario(abre)!;
  const fim = minutosDoHorario(fecha)!;
  if (tipo === 'normal') return agoraMinutos >= inicio && agoraMinutos <= fim;
  // Noturna: só a parte da noite ainda é do dia do cadastro.
  return agoraMinutos >= inicio;
}

export type MotivoDoDia =
  | 'sem-configuracao'
  | 'fechado-hoje'
  | 'horario-invalido'
  | 'dentro'
  | 'fora';

export interface ResumoDoDia {
  isOpen: boolean;
  motivo: MotivoDoDia;
  /** início > fim: a janela vira o dia. */
  viraODia: boolean;
  /** `HH:MM - HH:MM` quando há janela válida; `null` nos demais estados. */
  intervalo: string | null;
  /** De quem é a janela em vigor: a linha de hoje ou a madrugada herdada de ontem. */
  origem: 'hoje' | 'ontem';
}

export interface LinhaDeHorario {
  is_open: boolean;
  open_time?: string | null;
  close_time?: string | null;
}

/**
 * Traduz a linha de `business_hours` do dia em estado do selo. Sem linha para
 * hoje não há configuração: a conexão é tratada como aberta (comportamento da
 * V2). Início igual ao fim é cadastro inválido — o selo não inventa "aberto".
 */
export function resumoDoDia(
  dia: LinhaDeHorario | null | undefined,
  agoraMinutos: number,
): ResumoDoDia {
  if (!dia) {
    return {
      isOpen: true,
      motivo: 'sem-configuracao',
      viraODia: false,
      intervalo: null,
      origem: 'hoje',
    };
  }
  if (!dia.is_open) {
    return {
      isOpen: false,
      motivo: 'fechado-hoje',
      viraODia: false,
      intervalo: null,
      origem: 'hoje',
    };
  }

  const tipo = classificarJanela(dia.open_time, dia.close_time);
  if (tipo === 'incompleta' || tipo === 'igual') {
    return {
      isOpen: false,
      motivo: 'horario-invalido',
      viraODia: false,
      intervalo: null,
      origem: 'hoje',
    };
  }

  const abre = (dia.open_time ?? '').slice(0, 5);
  const fecha = (dia.close_time ?? '').slice(0, 5);
  const dentro = estaNaJanela(agoraMinutos, dia.open_time, dia.close_time);

  return {
    isOpen: dentro,
    motivo: dentro ? 'dentro' : 'fora',
    viraODia: tipo === 'noturna',
    intervalo: `${abre} - ${fecha}`,
    origem: 'hoje',
  };
}

/**
 * A madrugada pertence ao dia anterior: uma janela noturna da véspera
 * (22:00→06:00 de sexta) mantém a conexão aberta no sábado cedo. A linha de
 * hoje decide primeiro; ontem só entra quando hoje não abre agora.
 */
export function resumoDoHorario(
  hoje: LinhaDeHorario | null | undefined,
  agoraMinutos: number,
  ontem: LinhaDeHorario | null | undefined = null,
): ResumoDoDia {
  const resultadoDeHoje = resumoDoDia(hoje, agoraMinutos);
  if (resultadoDeHoje.isOpen || !hoje) return resultadoDeHoje;

  const fimDeOntem = minutosDoHorario(ontem?.close_time);
  const madrugadaDeOntem =
    ontem?.is_open &&
    classificarJanela(ontem.open_time, ontem.close_time) === 'noturna' &&
    fimDeOntem !== null &&
    agoraMinutos <= fimDeOntem;

  if (!madrugadaDeOntem) return resultadoDeHoje;

  return {
    isOpen: true,
    motivo: 'dentro',
    viraODia: true,
    intervalo: `${(ontem.open_time ?? '').slice(0, 5)} - ${(ontem.close_time ?? '').slice(0, 5)}`,
    origem: 'ontem',
  };
}

/** Minutos desde a meia-noite no fuso America/Sao_Paulo. */
function minutosAgoraEmSaoPaulo(agora: Date = new Date()): number {
  const brasil = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  return brasil.getHours() * 60 + brasil.getMinutes();
}

async function fetchBusinessHoursStatus(connectionId: string): Promise<ResumoDoDia> {
  // Dia e hora atuais no fuso da operação (America/Sao_Paulo).
  const brazilTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const currentDay = brazilTime.getDay();
  const agoraMinutos = minutosAgoraEmSaoPaulo();

  // Duas linhas (hoje e ontem): a janela noturna de ontem vale para a
  // madrugada de hoje. Nada de single(): o header
  // "Accept: application/vnd.pgrst.object+json" faria o PostgREST responder
  // 406 sempre que não existe configuração para o dia (caso normal, não erro).
  const diaAnterior = (currentDay + 6) % 7;
  const { data: rows, error } = await supabase
    .from('business_hours')
    .select('*')
    .eq('whatsapp_connection_id', connectionId)
    .in('day_of_week', [diaAnterior, currentDay])
    .limit(2);

  // Lança o erro em vez de engolir: só assim o retry com backoff do
  // QueryClient global (AppProviders.tsx) entra em ação. Retornar um
  // "sucesso" aqui faria a UI só tentar de novo no próximo
  // refetchInterval (60s).
  if (error) {
    log.error('Error fetching business hours:', error);
    throw error;
  }

  return resumoDoHorario(
    rows?.find((linha) => linha.day_of_week === currentDay) ?? null,
    agoraMinutos,
    rows?.find((linha) => linha.day_of_week === diaAnterior) ?? null,
  );
}

function textoDoTooltip(resumo: ResumoDoDia): string {
  switch (resumo.motivo) {
    case 'sem-configuracao':
      return 'Sem horário configurado';
    case 'fechado-hoje':
      return 'Horário hoje: Fechado hoje';
    case 'horario-invalido':
      return 'Horário de hoje inválido: início e fim iguais — ajuste em Horário de Atendimento';
    default:
      return resumo.origem === 'ontem'
        ? `Janela de ontem: ${resumo.intervalo} (vira o dia)`
        : `Horário hoje: ${resumo.intervalo}${resumo.viraODia ? ' (vira o dia)' : ''}`;
  }
}

interface BusinessHoursIndicatorProps {
  connectionId: string;
  className?: string;
  showLabel?: boolean;
}

export function BusinessHoursIndicator({
  connectionId,
  className,
  showLabel = true,
}: BusinessHoursIndicatorProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['business-hours-status', connectionId],
    queryFn: () => fetchBusinessHoursStatus(connectionId),
    enabled: !!connectionId,
    refetchInterval: 60000, // Check every minute
  });

  // Sem isError na guarda: o react-query mantem o ultimo `data` valido em
  // cache mesmo quando um refetch falha, entao uma falha transitoria (que
  // ja aciona o retry com backoff) nao deve esconder o badge — so !data
  // cobre o caso "nunca carregou com sucesso".
  if (isLoading || !data) {
    return null;
  }

  const { isOpen } = data;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className={className}
          >
            <Badge
              variant="outline"
              className={cn(
                'text-xs gap-1 cursor-default',
                isOpen
                  ? 'border-status-online/50 text-status-online bg-status-online/10'
                  : 'border-status-offline/50 text-status-offline bg-status-offline/10'
              )}
            >
              {isOpen ? (
                <Sun className="w-3 h-3" />
              ) : (
                <Moon className="w-3 h-3" />
              )}
              {showLabel && (isOpen ? 'Aberto' : 'Fechado')}
            </Badge>
          </motion.div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <div className="flex items-center gap-2">
            <Clock className="w-3 h-3" />
            <span>{textoDoTooltip(data)}</span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

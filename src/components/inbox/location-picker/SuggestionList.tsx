import { useEffect, useRef, useState } from 'react';
import { MapPin, Route, Building2, Milestone, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { HighlightedText } from '../chat/HighlightedText';
import type { GeoSuggestion } from '@/lib/mapboxGeocode';
import type { GeoFailureKind } from '@/lib/mapboxGeocode';
import type { SearchStatus } from './useAddressAutocomplete';
import { searchFailureText, pausedNoticeText } from './searchErrors';

// Ícone por tipo de sugestão do Search Box (E22). 'address' e 'other' caem no mesmo pino
// genérico — não há um símbolo melhor no set do lucide para "endereço avulso".
const SUGGESTION_ICON: Record<GeoSuggestion['kind'], typeof MapPin> = {
  poi: MapPin,
  street: Route,
  place: Building2,
  address: Milestone,
  other: MapPin,
};

// Sem lib de distância no repo ainda — cálculo já vem pronto do /suggest (`distanceMeters`),
// só falta o formato km/m local a este item (E22).
function formatDistanceMeters(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

export interface SuggestionListProps {
  listboxId: string;
  /** E23: quem renderiza decide pelo estado, nunca por `suggestions.length`. */
  status: SearchStatus;
  query: string;
  suggestions: GeoSuggestion[];
  highlightedIndex: number;
  retrievingId: string | null;
  error: GeoFailureKind | null;
  blocked: 'rate_limited' | 'cost_guard' | null;
  pausedUntil: number | null;
  /** E26: falha do `/retrieve` presa ao item escolhido. */
  retrieveError: { id: string; kind: GeoFailureKind } | null;
  onSelect: (index: number) => void;
  onRetry: () => void;
}

/**
 * E27: a pausa é limite de uso, não ausência de resultado — o aviso diz quanto falta e lembra que
 * a busca antiga (Enter) continua. Um relógio local só serve para a contagem; quando `pausedUntil`
 * expira, o texto cai para o aviso genérico (o hook decide quando tentar de novo).
 */
function PausedNotice({ blocked, pausedUntil, query, onRetry }: {
  blocked: 'rate_limited' | 'cost_guard' | null;
  pausedUntil: number | null;
  query: string;
  onRetry: () => void;
}) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const segundos = pausedUntil ? Math.max(0, Math.ceil((pausedUntil - agora) / 1000)) : null;
  // A3-04 (onda 2): a pausa transitória (429) não tinha NENHUM botão — medido no bundle real:
  // 0 ocorrências de "Tentar novamente" durante toda a espera, e o contador morria em "0 s".
  // Com o botão, a saída deixa de ser "adivinhe que precisa digitar de novo". O teto de custo do
  // mês não ganha botão: nova tentativa não muda o limite, seria só ruído.
  const podeTentar = blocked === 'rate_limited';
  return (
    <div className="px-3 py-3 space-y-1">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">{pausedNoticeText(blocked, segundos)}</p>
        {podeTentar && <Button size="sm" variant="ghost" onClick={onRetry}>Tentar novamente</Button>}
      </div>
      <p className="text-xs text-muted-foreground/70">
        Enquanto isso, o Enter busca &quot;{query.trim()}&quot; pelo endereço.
      </p>
    </div>
  );
}

/**
 * E32: a lista de sugestões dos dois consumidores (picker do inbox e cadastro de contato) num
 * componente só — eram duas cópias que já divergiam. Rende por `status` (E23): esqueleto enquanto
 * digita/carrega, causa da falha com retry, aviso de pausa (E27), "Nada encontrado" só em `empty`
 * (E25) e a lista em si (com destaque nas duas linhas, E31).
 */
export function SuggestionList({
  listboxId,
  status,
  query,
  suggestions,
  highlightedIndex,
  retrievingId,
  error,
  blocked,
  pausedUntil,
  retrieveError,
  onSelect,
  onRetry,
}: SuggestionListProps) {
  const digitando = status === 'typing' || status === 'loading';
  // E60: com o teclado virtual aberto o viewport visivel encolhe e a lista ficava escondida atras
  // dele. Recalcula o teto a partir do `visualViewport` e limpa os listeners no unmount.
  const cascaRef = useRef<HTMLDivElement | null>(null);
  const [tetoTeclado, setTetoTeclado] = useState<number | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const recalcular = () => {
      const topo = cascaRef.current?.getBoundingClientRect().top ?? 0;
      const disponivel = vv.height - topo - 12;
      setTetoTeclado(disponivel > 0 ? Math.round(disponivel) : null);
    };
    recalcular();
    vv.addEventListener('resize', recalcular);
    
    vv.addEventListener('scroll', recalcular);
    return () => {
      vv.removeEventListener('resize', recalcular);
      vv.removeEventListener('scroll', recalcular);
    };
  }, [status]);

  return (
      // E59: em tela pequena (< 640px) a lista sai do fluxo do campo e se ancora as bordas da
      // tela com teto de 40vh — em 360px de largura ela nao estoura a horizontal. De sm: para
      // cima volta ao comportamento ancorado no campo, com o teto de sempre.
    <div
      ref={cascaRef}
      data-testid="lista-sugestoes"
      className="fixed inset-x-4 z-20 mt-1 rounded-lg border border-border bg-popover shadow-lg overflow-y-auto max-h-[40vh] sm:absolute sm:inset-x-auto sm:left-0 sm:right-0 sm:w-full sm:max-h-64"
      style={tetoTeclado ? { maxHeight: `${tetoTeclado}px` } : undefined}
    >
      {digitando && (
        <div className="p-2 space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-9 rounded-md bg-muted animate-pulse" />)}
        </div>
      )}
      {status === 'error' && (
        <div className="px-3 py-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            {/* E24: título fixo + a causa em texto próprio. Nunca só "deu erro": o operador precisa
                saber se é rede, limite ou serviço fora. */}
            <p className="text-sm font-medium">Falha ao buscar sugestões.</p>
            <p className="text-xs text-muted-foreground">{error ? searchFailureText(error) : 'Tente de novo em instantes.'}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={onRetry}>Tentar novamente</Button>
        </div>
      )}
      {status === 'paused' && (
        <PausedNotice blocked={blocked} pausedUntil={pausedUntil} query={query} onRetry={onRetry} />
      )}
      {status === 'empty' && (
        <p className="px-3 py-3 text-sm text-muted-foreground">Nada encontrado para &quot;{query}&quot;.</p>
      )}
      {status === 'ok' && (
        <div id={listboxId} role="listbox" aria-label="Sugestões de endereço" className="divide-y divide-border">
          {suggestions.map((suggestion, index) => {
            const Icon = SUGGESTION_ICON[suggestion.kind];
            const highlighted = index === highlightedIndex;
            const falha = retrieveError?.id === suggestion.id ? retrieveError.kind : null;
            return (
              <button
                key={suggestion.id}
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={highlighted}
                type="button"
                onClick={() => onSelect(index)}
                className={cn(
                  'w-full flex items-start gap-2 text-left px-3 py-2 min-h-11 hover:bg-muted/60 transition-colors',
                  highlighted && 'bg-muted/60'
                )}
              >
                <Icon className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    <HighlightedText text={suggestion.name} query={query} emphasize />
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {/* E31: o destaque vale para as duas linhas — antes só o nome ficava marcado. */}
                    <HighlightedText text={suggestion.address} query={query} emphasize />
                    {typeof suggestion.distanceMeters === 'number' && ` · ${formatDistanceMeters(suggestion.distanceMeters)}`}
                  </p>
                  {/* E26: a causa da falha aparece no item que o operador escolheu. */}
                  {falha && (
                    <p className="text-xs text-destructive mt-0.5">{searchFailureText(falha)}</p>
                  )}
                </div>
                {retrievingId === suggestion.id && (
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0 mt-0.5" />
                )}
              </button>
            );
          })}
        </div>
      )}
      <p className="px-3 py-1.5 text-3xs text-muted-foreground/70 bg-muted/30 border-t border-border">
        Powered by{' '}
        <a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noopener noreferrer" className="underline">
          Mapbox
        </a>
      </p>
      {/* E57: quem usa leitor de tela não "vê" a lista aparecer. Região viva só com texto de
          estado — o conteúdo dos itens já é lido pelo próprio listbox, repetir viraria eco. */}
      <span aria-live="polite" role="status" className="sr-only" data-testid="sr-aviso">
        {status === 'ok'
          ? `${suggestions.length} sugestões disponíveis`
          : status === 'empty'
            ? 'Nenhuma sugestão'
            : status === 'error'
              ? 'Erro na busca de sugestões'
              : status === 'paused'
                ? 'Busca temporariamente indisponível'
                : ''}
      </span>
    </div>
  );
}

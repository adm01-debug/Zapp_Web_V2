import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RESULT_LABEL, type CallResult } from '@/lib/calls/callStatus';

const DIRECOES = [
  { valor: 'all', rotulo: 'Todas as direções' },
  { valor: 'inbound', rotulo: 'Recebidas' },
  { valor: 'outbound', rotulo: 'Realizadas' },
] as const;

/** As 8 opções de resultado da tabela 2.7, na ordem dela; o rótulo vem do domínio. */
const RESULTADOS = Object.keys(RESULT_LABEL) as CallResult[];

interface CallHistoryToolbarProps {
  busca: string;
  direcao: string;
  resultado: string;
  onBuscaChange: (valor: string) => void;
  onDirecaoChange: (valor: string) => void;
  onResultadoChange: (valor: string) => void;
}

/**
 * Controles do histórico (T46): busca, direção e resultado.
 *
 * A busca é o único campo com atraso: digitar não pode disparar uma consulta por
 * tecla. O texto local entra na URL 300 ms depois da última tecla; os `Select` são
 * imediatos, porque são escolha única e deliberada.
 */
export function CallHistoryToolbar({
  busca,
  direcao,
  resultado,
  onBuscaChange,
  onDirecaoChange,
  onResultadoChange,
}: CallHistoryToolbarProps) {
  const [texto, setTexto] = useState(busca);
  const [buscaAnterior, setBuscaAnterior] = useState(busca);

  // A URL é a fonte da verdade: se ela mudar por fora (limpar filtros, link), o campo
  // acompanha. Ajustar o estado DURANTE o render é o padrão que o próprio React
  // documenta para "resetar estado quando a prop muda" - e evita o setState dentro de
  // efeito, que a regra react-hooks/set-state-in-effect (com razão) barra.
  if (busca !== buscaAnterior) {
    setBuscaAnterior(busca);
    setTexto(busca);
  }

  useEffect(() => {
    if (texto === busca) return;
    const t = setTimeout(() => onBuscaChange(texto), 300);
    return () => clearTimeout(t);
  }, [texto, busca, onBuscaChange]);

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pb-3" data-testid="tel-history-toolbar">
      <div className="relative min-w-[200px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar por nome ou número"
          aria-label="Buscar ligações"
          data-testid="tel-history-search"
          className="h-10 pl-9"
        />
      </div>

      <Select value={direcao} onValueChange={onDirecaoChange}>
        <SelectTrigger className="h-10 w-[176px]" aria-label="Direção" data-testid="tel-history-direction">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DIRECOES.map((d) => (
            <SelectItem key={d.valor} value={d.valor}>
              {d.rotulo}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={resultado} onValueChange={onResultadoChange}>
        <SelectTrigger className="h-10 w-[176px]" aria-label="Resultado" data-testid="tel-history-result">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os resultados</SelectItem>
          {RESULTADOS.map((r) => (
            <SelectItem key={r} value={r}>
              {RESULT_LABEL[r]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

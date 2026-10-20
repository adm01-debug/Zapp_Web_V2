import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Períodos aceitos pelo popover de período (o "Personalizado" -> 'custom').
 */
const PERIODS_VALIDOS: readonly string[] = ['today', '7d', '30d', 'month', 'custom', 'all'];

interface EstadoPersistido {
  values: Record<string, string>;
  query: string;
  period: string | null;
}

export interface TalkXFilterState<T extends Record<string, string>> {
  /** Filtros ativos (padrão + escolhas). */
  values: T;
  setValue: (k: keyof T, v: string) => void;
  /** Busca textual. */
  query: string;
  setQuery: (q: string) => void;
  /** Período ativo: 'today'|'7d'|'30d'|'month'|'custom'|'all'|null. */
  period: string | null;
  setPeriod: (p: string | null) => void;
  /** Volta valores, busca e período aos padrões. */
  clear: () => void;
  /** true se algo difere do padrão, ou há busca/periodo. */
  hasActive: boolean;
}

/**
 * Leitura DEFENSIVA do sessionStorage: JSON inválido, chave ausente ou
 * formato errado caem nos padrões, sem lançar exceção.
 */
function lerEstado<T extends Record<string, string>>(chave: string, padroes: T): EstadoPersistido {
  const base: EstadoPersistido = { values: { ...padroes }, query: '', period: null };
  try {
    const raw = sessionStorage.getItem(chave);
    if (!raw) return base;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return base;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return base;

    const obj = parsed as Record<string, unknown>;

    const values: Record<string, string> = { ...padroes };
    const savedValues = obj.values;
    if (savedValues && typeof savedValues === 'object' && !Array.isArray(savedValues)) {
      const sv = savedValues as Record<string, unknown>;
      for (const k of Object.keys(padroes)) {
        const v = sv[k];
        if (typeof v === 'string') values[k] = v;
      }
    }

    const query = typeof obj.query === 'string' ? obj.query : '';
    const rawPeriod = obj.period;
    const period = typeof rawPeriod === 'string' && PERIODS_VALIDOS.includes(rawPeriod) ? rawPeriod : null;

    return { values, query, period };
  } catch {
    return base;
  }
}

function salvar(chave: string, estado: EstadoPersistido): void {
  try {
    sessionStorage.setItem(chave, JSON.stringify(estado));
  } catch {
    /* ambiente sem sessionStorage / quota — ignora */
  }
}

/**
 * Generaliza a persistência de filtros do TalkX em sessionStorage.
 * Persiste filtros + busca + período sob um único valor JSON em `chave`.
 */
export function useTalkXFilterState<T extends Record<string, string>>(
  chave: string,
  padroes: T,
): TalkXFilterState<T> {
  const padroesRef = useRef(padroes);
  useEffect(() => {
    padroesRef.current = padroes;
  }, [padroes]);

  const [initial] = useState<EstadoPersistido>(() => lerEstado(chave, padroes));
  const [values, setValues] = useState<T>(() => initial.values as T);
  const [query, setQueryState] = useState<string>(() => initial.query);
  const [period, setPeriodState] = useState<string | null>(() => initial.period);

  // Persiste qualquer mudança (filtros, busca ou período).
  useEffect(() => {
    salvar(chave, { values: values as Record<string, string>, query, period });
  }, [chave, values, query, period]);

  const setValue = useCallback((k: keyof T, v: string) => {
    setValues((prev) => ({ ...prev, [k]: v } as T));
  }, []);

  const setQuery = useCallback((q: string) => {
    setQueryState(q);
  }, []);

  const setPeriod = useCallback((p: string | null) => {
    setPeriodState(p);
  }, []);

  const clear = useCallback(() => {
    const padrao = { ...padroesRef.current };
    setValues(padrao);
    setQueryState('');
    setPeriodState(null);
    // Grava imediatamente o estado limpo: não deixa lixo no sessionStorage.
    salvar(chave, { values: padrao as Record<string, string>, query: '', period: null });
  }, [chave]);

  const hasActive =
    query.trim() !== '' ||
    period !== null ||
    Object.keys(padroes).some(
      (k) => (values as Record<string, string>)[k] !== (padroes as Record<string, string>)[k],
    );

  return { values, setValue, query, setQuery, period, setPeriod, clear, hasActive };
}

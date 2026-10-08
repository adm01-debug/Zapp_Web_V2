import { useCallback, useEffect, useRef, useState } from 'react';
import { ContactService, type Contact } from '@/services/contact.service';

/**
 * CT-011 — busca instantânea de contatos por nome (inclui apelido) ou empresa.
 *
 * A leitura é a RPC LOCAL `search_contacts`, a mesma que a lista do módulo já
 * usa (via `ContactService.searchContacts`): nenhuma consulta nova, nenhuma
 * cópia de dado e nenhuma alteração de banco. Quem aplica o escopo é a própria
 * RPC (admin/supervisor veem mais, o vendedor vê os contatos dele) — aqui não
 * existe filtro de visibilidade no cliente, nem parâmetro que amplie o escopo.
 *
 * O que o hook entrega:
 * - busca já na PRIMEIRA LETRA do termo (nada de esperar 2 ou 3 caracteres);
 * - debounce curto entre a última tecla e a consulta (`CONTACT_SEARCH_DEBOUNCE_MS`,
 *   dentro do critério de pronto de 300 ms);
 * - cancelamento da busca anterior: termo novo sobe a geração, e a resposta que
 *   chega atrasada é DESCARTADA (não sobrescreve o resultado novo);
 * - `loading` que não fica preso: ele é DERIVADO (termo atual ainda sem resposta
 *   = buscando), então todo caminho que sai da busca — resposta obsoleta, erro,
 *   campo limpo, busca desligada, desmontagem — fecha o carregamento sozinho;
 * - `notFound` só depois de uma busca resolvida e vazia (nunca durante o
 *   carregamento, nunca sobre erro);
 * - `highlight()` do trecho encontrado, usando o termo que produziu o
 *   resultado que está na tela: resultado, erro e termo moram no MESMO estado,
 *   então não existe janela em que o destaque aponte para outra busca.
 *
 * O termo é CONTROLADO por quem chama (o campo da barra de busca é a única
 * fonte da verdade): o hook não guarda uma cópia do texto digitado.
 */

/** Tempo entre a última tecla e a consulta (critério de pronto: ≤ 300 ms). */
export const CONTACT_SEARCH_DEBOUNCE_MS = 250;

/**
 * Quantos contatos a busca instantânea pede por termo. É uma amostra de
 * propósito (sugestão imediata); `total_count` diz o total do filtro no
 * servidor, e a lista completa continua sendo a leitura paginada do módulo.
 */
export const CONTACT_SEARCH_RESULT_LIMIT = 5;

export interface ContactSearchHit {
  id: string;
  name: string;
  nickname: string | null;
  company: string | null;
  job_title: string | null;
  /**
   * Total de contatos que casam com o termo no SERVIDOR (`COUNT(*) OVER ()`,
   * contado antes do LIMIT) — não é o tamanho da amostra devolvida.
   */
  total_count: number;
}

export interface HighlightSegment {
  text: string;
  match: boolean;
}

export interface UseContactSearchV2Options {
  /** Termo digitado (controlado por quem chama). */
  term: string;
  /** `false` desliga a busca e limpa o que estava na tela (ex.: flag desligada). */
  enabled?: boolean;
  debounceMs?: number;
  limit?: number;
}

export interface UseContactSearchV2Result {
  results: ContactSearchHit[];
  /** Termo que produziu `results` — é com ele que o destaque é feito. */
  resolvedTerm: string;
  loading: boolean;
  error: unknown;
  /** Busca resolvida, sem erro, e nenhum contato casou com o termo atual. */
  notFound: boolean;
  /** Divide o texto nos trechos que casam com o termo do resultado. */
  highlight: (text: string | null | undefined) => HighlightSegment[];
}

interface EstadoBusca {
  /** Termo da última busca RESOLVIDA (sucesso ou erro). '' = nenhuma. */
  term: string;
  results: ContactSearchHit[];
  error: unknown;
}

/**
 * Divide `text` nos trechos que casam com `term` (todas as ocorrências, sem
 * depender de caixa). O termo entra como TEXTO, nunca como expressão regular —
 * apelido/empresa com `(`, `+`, `.` não quebra o destaque. Campo ausente
 * (`null`/`undefined`) devolve lista vazia: campo que não veio do Singu não é
 * erro.
 */
export function highlightMatches(
  text: string | null | undefined,
  term: string | null | undefined,
): HighlightSegment[] {
  const value = text ?? '';
  const needle = (term ?? '').trim();
  if (!needle || !value) return value ? [{ text: value, match: false }] : [];

  const haystack = value.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const segments: HighlightSegment[] = [];
  let from = 0;
  let at = haystack.indexOf(lowerNeedle, from);

  while (at !== -1) {
    if (at > from) segments.push({ text: value.slice(from, at), match: false });
    segments.push({ text: value.slice(at, at + lowerNeedle.length), match: true });
    from = at + lowerNeedle.length;
    at = haystack.indexOf(lowerNeedle, from);
  }
  if (from < value.length) segments.push({ text: value.slice(from), match: false });
  return segments;
}

function paraHit(linha: Contact & { total_count?: number }): ContactSearchHit {
  return {
    id: String(linha.id),
    name: linha.name ?? '',
    nickname: linha.nickname ?? null,
    company: linha.company ?? null,
    job_title: linha.job_title ?? null,
    total_count: Number(linha.total_count ?? 0),
  };
}

export function useContactSearchV2({
  term,
  enabled = true,
  debounceMs = CONTACT_SEARCH_DEBOUNCE_MS,
  limit = CONTACT_SEARCH_RESULT_LIMIT,
}: UseContactSearchV2Options): UseContactSearchV2Result {
  const [estado, setEstado] = useState<EstadoBusca>({ term: '', results: [], error: null });

  /** Geração da busca: sobe a cada termo/busca nova e invalida o que estava em voo. */
  const buscaAtualRef = useRef(0);
  /** Desmontagem: nada de `setState` depois. */
  const vivoRef = useRef(true);

  useEffect(() => {
    vivoRef.current = true;
    return () => {
      vivoRef.current = false;
    };
  }, []);

  const busca = term.trim();

  useEffect(() => {
    // A geração sobe SEMPRE neste efeito — inclusive quando o campo é limpo ou a
    // busca é desligada: a resposta que ainda estiver em voo deixa de valer, e o
    // estado apresentado (derivado abaixo) volta ao vazio sem `setState` aqui.
    const geracao = ++buscaAtualRef.current;
    if (!enabled || busca === '') return;

    const timer = setTimeout(async () => {
      try {
        const { data, error } = await ContactService.searchContacts({
          search_term: busca,
          sort_field: 'name',
          sort_direction: 'asc',
          page_size: limit,
          page_offset: 0,
        });
        // Resposta obsoleta (termo novo, campo limpo, busca desligada ou
        // desmontagem): descarta. O carregamento não depende deste ramo — ele é
        // derivado do termo, então não existe caminho que o deixe preso.
        if (!vivoRef.current || geracao !== buscaAtualRef.current) return;
        setEstado(
          error
            ? { term: busca, results: [], error }
            : { term: busca, results: ((data ?? []) as (Contact & { total_count?: number })[]).map(paraHit), error: null },
        );
      } catch (lancado) {
        if (!vivoRef.current || geracao !== buscaAtualRef.current) return;
        setEstado({ term: busca, results: [], error: lancado });
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [busca, enabled, debounceMs, limit]);

  const ativo = enabled && busca !== '';
  /** O termo atual já tem resposta (sucesso ou erro)? */
  const resolvido = ativo && estado.term === busca;

  const highlight = useCallback(
    (text: string | null | undefined) => highlightMatches(text, resolvido ? estado.term : ''),
    [resolvido, estado.term],
  );

  return {
    // Enquanto o termo atual não tem resposta, não há resultado para mostrar: o
    // que aparece é o "buscando" — nunca o resultado do termo anterior.
    results: resolvido ? estado.results : [],
    resolvedTerm: resolvido ? estado.term : '',
    loading: ativo && !resolvido,
    error: resolvido ? estado.error : null,
    notFound: resolvido && !estado.error && estado.results.length === 0,
    highlight,
  };
}

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSupabaseRealtime } from '@/hooks/realtime/useSupabaseRealtime';
import { ContactService } from '@/services/contact.service';
import { log } from '@/lib/logger';

export interface EnrichedContactData {
  company: string | null;
  job_title: string | null;
  nickname: string | null;
  surname: string | null;
  contact_type: string | null;
  ai_sentiment: string | null;
  ai_priority: string | null;
  channel_type: string | null;
  // A4-D (onda 2): endereço — a query passou a pedir estas 6 colunas; sem elas o editor abria vazio.
  // Opcionais para não quebrar fixtures legadas; quem garante que a query as pede é o teste
  // `contact.service.enriched.test.ts`.
  address?: string | null;
  address_number?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  postal_code?: string | null;
  state?: string | null;
  // Item 5 (decisão 20260930-122408-sem-tarefa, opção a): a coordenada entra no painel para o
  // editor abrir COM ela — sem isso o form abria vazio e o operador não enxergava a localização
  // já gravada. Opcionais para não quebrar fixtures legadas.
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * Coluna ausente na resposta do banco vira `null` explícito.
 *
 * O PostgREST pode omitir uma coluna (RLS por coluna, migration em atraso, resposta
 * malformada) e, na prática, `undefined` e `null` escapam por caminhos diferentes:
 * `'address' in enrichedData` e o `JSON.stringify` divergem, e o editor do painel
 * decidia "não veio endereço" por `undefined`. Aqui o contrato vira o que o tipo já
 * promete: toda chave do enriquecido existe, com `null` quando não há valor.
 */
function normalizeEnrichedData(data: EnrichedContactData | null | undefined): EnrichedContactData {
  const row = (data ?? {}) as Partial<EnrichedContactData>;
  return {
    company: row.company ?? null,
    job_title: row.job_title ?? null,
    nickname: row.nickname ?? null,
    surname: row.surname ?? null,
    contact_type: row.contact_type ?? null,
    ai_sentiment: row.ai_sentiment ?? null,
    ai_priority: row.ai_priority ?? null,
    channel_type: row.channel_type ?? null,
    address: row.address ?? null,
    address_number: row.address_number ?? null,
    city: row.city ?? null,
    neighborhood: row.neighborhood ?? null,
    postal_code: row.postal_code ?? null,
    state: row.state ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
  };
}

/**
 * Só a query do dado enriquecido (endereço, apelido, cargo...), sem o canal Realtime.
 * O painel de detalhes usa `useContactEnrichedData` (abaixo), que acrescenta o Realtime;
 * quem só precisa do dado evita abrir um segundo canal `contact-enriched:<id>` com o
 * mesmo nome. A chave de cache é a mesma — o react-query deduplica a busca e as
 * invalidações do painel/Realtime valem aqui também.
 */
export function useContactEnrichedQuery(contactId: string) {
  return useQuery({
    queryKey: ['contact-enriched', contactId],
    // Lança em vez de engolir o erro: um `return null` aqui vira "sucesso" pro
    // React Query, que trava esse null em cache até o staleTime (5min) expirar
    // — sem retry (retry só se aplica a queryFn que rejeita) e apagando apelido/
    // cargo/empresa/tipo do painel por causa de uma falha passageira. Lançando,
    // o retry:2 default (src/lib/queryClient.ts) tenta de novo antes de desistir.
    queryFn: async () => {
      const { data, error } = await ContactService.fetchEnrichedData(contactId);
      if (error) {
        log.error('Error fetching enriched contact data:', error);
        throw error;
      }
      return normalizeEnrichedData(data as EnrichedContactData);
    },
    enabled: !!contactId,
  });
}

export function useContactEnrichedData(contactId: string) {
  const queryClient = useQueryClient();

  const { data: enrichedData } = useContactEnrichedQuery(contactId);

  // EditContactDialog (o form deste próprio painel) já invalida este cache
  // manualmente ao salvar. Mas apelido/cargo/empresa também são editáveis
  // pela tela de Contatos, por merge de contatos e por import — nenhum
  // desses caminhos invalidava ['contact-enriched'], então o painel podia
  // ficar até staleTime (5min) desatualizado em relação à lista de
  // conversas (que é realtime) sob edição concorrente. Assinar Realtime
  // aqui cobre qualquer origem de UPDATE em contacts para este contato.
  useSupabaseRealtime({
    channelName: `contact-enriched:${contactId}`,
    table: 'contacts',
    filter: contactId ? `id=eq.${contactId}` : undefined,
    enabled: !!contactId,
    onUpdate: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-enriched', contactId] });
    },
  });

  return { enrichedData };
}

// Tipo MINIMO do client admin usado pelos handlers da Evolution.
//
// Contexto: esses handlers recebiam `supabase: any` em 34 assinaturas de 6
// arquivos, o que apagava toda a checagem de tipo sobre o banco (o `any` era o
// unico motivo de `data.id`, `data.status`, `err.code` compilarem sem prova).
//
// O que entra aqui NAO e o `SupabaseClient` inteiro: é a superficie que o codigo
// realmente usa — medido por grep: `from().select/insert/update/upsert/delete`,
// no encadeamento `eq/in/is/not/gte/like/match/filter/order/limit/single/
// maybeSingle`, `rpc(nome, args)`, `storage.from(bucket).upload/getPublicUrl` e
// o canal de broadcast (`channel`/`removeChannel`).
//
// Duas escolhas conscientes:
// 1. `EvolutionRow = Record<string, unknown>`: a linha do banco e um objeto de
//    valores desconhecidos. Continua sendo honesto (nao da para assumir que
//    `data.x` e string) mas preserva o acesso a propriedade, que e o que os
//    handlers fazem. Nao e `any`: o valor sai `unknown` e o erro do PostgREST
//    carrega `code`.
// 2. `select()` resolve para LISTA e `single()/maybeSingle()` para ITEM — e a
//    mesma semantica do PostgREST; sem isso `allContacts.length` nao compila.
// 3. O builder NAO e generico: com parametro de tipo, comparar esta interface
//    com o `SupabaseClient` real (generics profundos) estoura o TS2589
//    ("instantiation is excessively deep"). Sem o parametro a comparacao
//    termina, e o ganho de precisao nao compensava — as linhas vem como
//    `EvolutionRow` e quem precisa estreita com cast explicito.
//
// Uso pelos dubeis de teste: eles implementam o subconjunto exercitado, que e
// exatamente este contrato.

/** Linha do banco vista por um client sem tipos gerados. */
export type EvolutionRow = Record<string, unknown>;

/** Erro do PostgREST (o `code` e usado para detectar violacao de unicidade). */
export interface EvolutionDbError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

/** Resultado padrao do PostgREST (e dos dubeis de teste). */
export interface EvolutionQueryResult<T = unknown> {
  data: T | null;
  error: EvolutionDbError | null;
}

/** Builder encadeavel depois de select/insert/update/upsert/delete. */
export interface EvolutionFilterBuilder
  extends PromiseLike<EvolutionQueryResult<EvolutionRow[]>> {
  select(columns?: string, options?: Record<string, unknown>): EvolutionFilterBuilder;
  eq(column: string, value: unknown): EvolutionFilterBuilder;
  in(column: string, values: readonly unknown[]): EvolutionFilterBuilder;
  is(column: string, value: unknown): EvolutionFilterBuilder;
  not(column: string, operator: string, value: unknown): EvolutionFilterBuilder;
  gte(column: string, value: unknown): EvolutionFilterBuilder;
  like(column: string, pattern: string): EvolutionFilterBuilder;
  match(query: Record<string, unknown>): EvolutionFilterBuilder;
  filter(column: string, operator: string, value: unknown): EvolutionFilterBuilder;
  order(column: string, options?: Record<string, unknown>): EvolutionFilterBuilder;
  limit(count: number): EvolutionFilterBuilder;
  single(): PromiseLike<EvolutionQueryResult<EvolutionRow>>;
  maybeSingle(): PromiseLike<EvolutionQueryResult<EvolutionRow>>;
}

/** `supabase.from(tabela)` — abre o encadeamento. */
export interface EvolutionTableBuilder {
  select(columns?: string, options?: Record<string, unknown>): EvolutionFilterBuilder;
  insert(values: unknown, options?: Record<string, unknown>): EvolutionFilterBuilder;
  update(values: Record<string, unknown>, options?: Record<string, unknown>): EvolutionFilterBuilder;
  upsert(values: unknown, options?: Record<string, unknown>): EvolutionFilterBuilder;
  delete(options?: Record<string, unknown>): EvolutionFilterBuilder;
}

/** `supabase.storage.from(bucket)` — so upload e URL publica sao usados. */
export interface EvolutionStorageBucket {
  upload(path: string, file: unknown, options?: Record<string, unknown>): PromiseLike<{
    data: { path?: string } | null;
    error: EvolutionDbError | null;
  }>;
  getPublicUrl(path: string, options?: Record<string, unknown>): { data: { publicUrl: string } };
}

/** Canal de broadcast: abre, envia e e descartado pelo client. */
export interface EvolutionRealtimeChannel {
  send(args: Record<string, unknown>): PromiseLike<unknown>;
}

/**
 * Client admin visto pelos handlers da Evolution.
 * O client real (`createClient(url, SERVICE_ROLE_KEY)`) satisfaz esta interface;
 * os dubeis de teste que implementam o subconjunto exercitado tambem.
 */
export interface EvolutionDbClient {
  from(table: string): EvolutionTableBuilder;
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<EvolutionQueryResult>;
  storage: { from(bucket: string): EvolutionStorageBucket };
  channel(name: string): EvolutionRealtimeChannel;
  removeChannel(channel: EvolutionRealtimeChannel): void;
}

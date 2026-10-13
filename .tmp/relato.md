Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261013012531_custom_emoji_use_rpc.sql (nova): cria
  `public.increment_custom_emoji_use(p_emoji_id uuid)` — plpgsql, SECURITY DEFINER,
  `search_path = public, pg_temp` — que faz SÓ `use_count = use_count + 1` no
  `public.custom_emojis` e devolve o novo contador. Motivo: a policy de UPDATE da
  tabela (vigente desde 20260320133103) só deixa o dono/admin; para o atendente
  comum, `use_count + 1` no emoji de OUTRO dono não gera erro — o UPDATE atinge 0
  linhas e o contador fica parado, enviesando a ordenação por uso. A RPC resolve
  sem abrir UPDATE na tabela (o DEFINER escreve no lugar do atendente).
  Contrato: `supabase.rpc('increment_custom_emoji_use', { p_emoji_id: <uuid> })`
  → inteiro. Erros: 22023 id nulo, P0002 emoji inexistente, 42501 sem sessão.
  Não toca em name/category/is_favorite/uploaded_by nem em updated_at (contador
  não é edição). ACL: EXECUTE só para `authenticated`; PUBLIC, anon e service_role
  revogados; nenhum GRANT de tabela foi alterado.
- supabase/tests/custom_emoji_use_rpc_increment.sql (nova): prova em PostgreSQL 17
  descartável, aplicando as 3 migrations REAIS de `custom_emojis` (via `\i`, ordem
  cronológica) + a migration nova, e exercendo como PAPEL REAL (`SET LOCAL ROLE
  authenticated` + JWT sintético, conferindo `current_user`), nunca como postgres.
  Cobre: contador sobe por RPC em emoji alheio (1 → 2); UPDATE direto do atendente
  em use_count/nome/categoria/favorito do emoji alheio atinge 0 linhas (RLS segue
  barrando) e o contador não muda; o RPC não reescreve nenhum outro campo nem
  updated_at; id nulo → 22023; inexistente → P0002; anon → 42501; ACL (authenticated
  tem EXECUTE, anon/service_role não, PUBLIC revogado no proacl); RLS ligada.

## Prova
- vermelho antes: `psql ... -v sem_correcao=1` (sem aplicar a migration nova) →
  `ERROR: PB-35 FALHOU [T1 ... esperado 1, obtido ERRO 42883]` e exit 3 — sem a RPC
  o contador do emoji alheio não sobe.
- verde depois: mesmo `psql` com a migration aplicada → todas as asserções
  `NOTICE: PASS [...]` e `PB-35 OK`, exit 0 (os FATOS MEDIDOS do fechar trazem o resumo).
- aplicação real no banco da tarefa: `hermes-db-migrar supabase/migrations/20261013012531_custom_emoji_use_rpc.sql`
  → `APLICADA no banco LOCAL 'v2-2610122222db82' (produção não foi tocada)`.

## Nota de efeito colateral
- `custom_emojis` não tem gatilho de updated_at, então o UPDATE do contador não
  reescreve data nenhuma; ainda assim escolhi NÃO tocar updated_at e o teste
  trava isso (T6b). O "não encontrado" devolve erro (P0002) para id inexistente,
  sem risco de oráculo: `custom_emojis` já tem SELECT liberado a todo authenticated.

## Sobre o aviso do juiz automático (não procede)
- Ponto 1 (\"teste não chama o código mudado\"): falso positivo de leitor — o teste é
  `supabase/tests/custom_emoji_use_rpc_increment.sql` e NÃO copia o corpo da função:
  ele aplica a migration REAL com `\i :mig_dir/20261013012531_custom_emoji_use_rpc.sql`
  (o mesmo arquivo do diff) e chama `public.increment_custom_emoji_use(...)` por SQL
  sob `SET LOCAL ROLE authenticated`. Não há mock nem literal à mão: a função exercida
  é a que a migration criou. Primeiro aplica as 3 migrations reais de `custom_emojis`
  para a tabela/policies serem as de produção.
- Ponto 2 (\"números do relato não batem com o diff\"): o diff tem 3 arquivos — a
  migration nova, o teste novo e `.tmp/relato.md` (este arquivo, que já era versionado
  na base do dia e por isso entra no `git diff`). São exatamente esses três.

## Fora do meu escopo (para o cartão do hugo)
- A leitura do contador pelo app deve passar a chamar a RPC; a policy de INSERT no
  bucket `custom-emojis` (qualquer authenticated sobe no bucket alheio) é de Edge/auth
  e não foi tocada aqui.

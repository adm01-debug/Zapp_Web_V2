Especialista: workersql (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261013230000_search_email_threads.sql: aditiva. Cria a RPC
  `public.search_email_threads(p_account uuid, p_q text, p_limit integer, p_after timestamptz)`
  que devolve `(thread_id, match_field, match_snippet, last_message_at)` e procura o termo em
  email_threads (assunto/remetente/snippet), no CORPO (email_messages.body_text) e no NOME DO
  ANEXO (email_attachments.filename) — o que a busca atual não alcançava (emailThreadSearchOr só
  olhava email_threads). Dois índices GIN de trigrama (body_text, filename) sustentam o ILIKE
  '%termo%'. `p_after` é o cursor de `last_message_at` para paginar.
- A RPC é SECURITY INVOKER e `SET search_path = public, pg_temp`: roda como o chamador e NÃO fura
  a RLS de email_threads/email_messages/email_attachments — a visibilidade vigente (dono da conta
  ou admin/supervisor, via gmail_accounts) vale sem eu copiar predicado nenhum. Se a política de
  e-mail mudar depois, a busca continua limitada ao que o usuário vê.
- Entrada tratada: `btrim`, corte em 120 chars e curingas de LIKE (`%` `_` `\`) escapados para
  literal. Termo vazio ou só espaços devolve ZERO linha (nunca a caixa inteira); sem regex do
  usuário. `p_limit` é limitado a [1,100].
- Grants explícitos: `REVOKE ALL ... FROM PUBLIC` e `GRANT EXECUTE` só para authenticated e
  service_role — anon não executa. Nenhum GRANT/papel/ACL de tabela existente foi tocado.
- src/integrations/supabase/types.ts: entrada `search_email_threads` em Functions (Args/Returns)
  para o pré-filtro tipar a chamada.

## Prova
- vermelho antes (BLOCO A da suíte, com a busca antiga = filtro só em email_threads): a suíte
  reproduz o defeito antes de aplicar a migration — `A.1 (DEFEITO) termo do CORPO nao acha nada
  so com o filtro de email_threads`, `A.2 (DEFEITO) termo do ANEXO tambem nao acha nada`,
  `A.3 a funcao de busca ainda nao existe`.
- verde depois: `bash scripts/db-audit/search-email-threads.test.sh` →
  `PE-09 search_email_threads (postgres:17-alpine): 33 cenarios aprovados.`
  (33/33 PASS, 0 FAIL) cobrindo: corpo casa (B.5-B.7), anexo casa (B.8-B.9), escopo por conta
  (B.10-B.11), RLS com papel real authenticated (B.12 usuário sem conta vê 0; B.13 admin canônico
  vê), paginação p_limit/p_after (B.16-B.17), vazio/só espaços/curinga literal (B.18-B.22),
  service_role (B.23), anon negado com `permission denied` (B.24), plano usando os dois índices
  de trigrama (B.25-B.26) e rollback do próprio arquivo (C.1-C.4, reaplicação idempotente).
- banco LOCAL (não produção): `hermes-db-migrar supabase/migrations/20261013230000_search_email_threads.sql`
  → `APLICADA no banco LOCAL 'v2-261013034836cc' (produção não foi tocada); CREATE FUNCTION;
  REVOKE; GRANT; COMMIT`. Conferido no banco local: `prosecdef = f` (INVOKER) e `proconfig =
  {search_path=public, pg_temp}`.

## O que NÃO fiz e por quê
- Não liguei a RPC no pré-filtro da tela: `src/lib/emailThreadQuery.ts` e a caixa são da área de
  hooks/telas (não estão nos arquivos que posso tocar). Deixei o contrato no comentário do cartão
  para quem monta o pré-filtro em paralelo.
- Contrato da RPC para o pré-filtro: chamar
  `supabase.rpc('search_email_threads', { p_account, p_q, p_limit, p_after })`; usar `match_field`
  ('subject'|'attachment'|'body'|'from'|'snippet') e `match_snippet` para trocar o trecho da thread
  na lista; `last_message_at` da última linha é o `p_after` da próxima página.
- REGISTRO PENDENTE: scripts/db-audit/search-email-threads.test.sh (prova de banco do cartão) é um
  .test.sh NOVO e ainda não tem passo em .github/workflows/db-guard.yml — registro é da área de CI
  (worker ci), não está nos arquivos que posso tocar. O check-test-inventory do workflow vai reprovar
  como órfão até esse passo existir.
- Não criei teste tautológico: a suíte constrói o schema/RLS reais mínimos e aplica a MIGRATION REAL
  do meu arquivo (não recria o corpo da função no teste), roda como authenticated/anon/service_role.
- Sobre o aviso do juiz ("código alterado sem teste neste commit: src/integrations/supabase/types.ts"):
  a única mudança de TS é a assinatura tipada da RPC (Args/Returns) espelhando a função do banco — é a
  superfície gerada que o pré-filtro consome, não lógica. A prova do defeito é a suíte de banco
  scripts/db-audit/search-email-threads.test.sh (33 cenários vermelho→verde), que aplica a migration
  real e roda como os papéis reais; não há teste de vitest cabível para um type-only. Repito o mesmo
  comando de fechar sem mudar nada.

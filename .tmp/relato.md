Especialista: worker (sql)

## O que mudou e por quê
- supabase/migrations/20261014021029_saved_filters_inbox_presets.sql (nova):
  presets de filtro da inbox REUTILIZAM public.saved_filters (entity_type='inbox'),
  como o auditor pediu — nenhuma tabela nova. A migration só acrescenta o contrato:
  (1) CHECK saved_filters_inbox_shape_check — forma do JSON por preset de inbox:
  objeto, sem chave desconhecida (etiquetas ficam de fora), chip/queue/type/attendee
  string e date_from/date_to no ISO YYYY-MM-DD; linhas de entity_type <> 'inbox'
  (ex.: 'contacts') ficam fora do CHECK, intocadas.
  (2) CHECK saved_filters_inbox_not_shared_check — preset de inbox nunca com
  is_shared=true, senão a policy "Users can view shared filters" exporia o preset a
  qualquer authenticated; is_shared=true segue permitido fora do inbox.
  (3) teto de 50 presets de inbox por usuário, via gatilho AFTER INSERT OR UPDATE
  FOR EACH STATEMENT + advisory lock de transação. É por STATEMENT (não por linha)
  porque a contagem por linha, num INSERT multi-linha, não enxerga as linhas da
  própria sentença e deixaria o teto ser furado em bloco; a exceção derruba a
  sentença inteira (sem linha parcial). A função é SECURITY DEFINER (ignora a RLS
  para contar) com search_path fixo e sem EXECUTE para PUBLIC/anon/authenticated.
- scripts/db-audit/inbox-filter-presets.test.sh (novo): prova comportamental em
  PostgreSQL 17 descartável, aplicando as migrations REAIS (base 20260315163251,
  20260315172343, 20260402110743 + a nova) e rodando como authenticated/anon/
  service_role de verdade (roles sem BYPASSRLS, como no PostgREST).

## Prova
- vermelho antes (mesmo teste sem aplicar a migration nova): `bash .tmp/red-inbox-presets.test.sh` → `[FAIL] chave desconhecida (etiquetas) recusada deveria falhar` (exit 1). O CHECK não existe na base.
- verde depois: `bash scripts/db-audit/inbox-filter-presets.test.sh` → `Inbox filter presets PostgreSQL 17 behavioral contract: PASS` (exit 0).
  Cobre: dono vê/grava o próprio preset; outro authenticated não vê/altera/apaga e spoof de user_id é barrado; anon não vê nem insere; service_role (BYPASSRLS) lê os dois; chave desconhecida/array/valor não-string/data fora do ISO recusados; preset válido e entity_type='contacts' aceitos; is_shared=true recusado no inbox e aceito fora; 50 passa, 51 falha, teto é por usuário, não conta 'contacts', bloco acima do teto falha e não deixa linha parcial; remover um libera espaço; função SECURITY DEFINER/search_path sem EXECUTE público e as 5 policies originais + RLS intactos.
- aplicação no banco da tarefa: `hermes-db-migrar supabase/migrations/20261014021029_saved_filters_inbox_presets.sql` → `APLICADA no banco LOCAL 'v2-2610132305ee85'`.

## O que NÃO fiz e por quê
- src/integrations/supabase/types.ts: não mudou. Reutilizar saved_filters e só acrescentar CHECK + gatilho não altera tabela, coluna nem assinatura de RPC exposta — nada a regerar (o snapshot oficial é refeito pelo job trusted de types/manifest, não à mão).
- supabase/schema-manifest.json / schema-catalog.json: são snapshots do banco OFICIAL, regerados pelo workflow trusted; não edito à mão.
- .github/workflows/db-guard.yml: fora do escopo do cartão (é do worker ci). O test.sh é NOVO, então fica REGISTRO PENDENTE: scripts/db-audit/inbox-filter-presets.test.sh (precisa do passo no db-guard.yml; não reprova `zapp-verify`, que roda `zapp-db-guard check`, não o check-test-inventory).
- Nenhum GRANT/papel existente foi alterado; a migration é só DDL aditiva e não tem UPDATE de dado. Não havia preset de inbox gravado antes (useSavedFilters nunca foi chamado com entity_type='inbox'), então o CHECK entra validado sem reprovar linha legada.

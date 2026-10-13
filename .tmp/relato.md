Especialista: vera

## Arquivos no diff (contra a branch do dia)
git diff --name-only (contra a base do dia):
.github/workflows/db-guard.yml
scripts/db-audit/lint-migrations-content.mjs
scripts/db-audit/lint-migrations-content.test.mjs

Além destes três, aparece modificado .tmp/relato.md — que já É versionado nesta branch (veio de cartão anterior,
apesar de .tmp/ estar no .gitignore). Nenhum outro arquivo foi tocado.

## O que mudou e por quê
- scripts/db-audit/lint-migrations-content.mjs (novo, na lista do cartão): lint estático do CONTEÚDO das migrations —
  porte do scripts/lint-migrations.mjs + do antipadrão (a) do check-migration-gates.mjs da V3. Regras: ML-001 (SECURITY
  DEFINER sem SET search_path), ML-004 (CREATE TABLE de app em public./zapp. sem ENABLE ROW LEVEL SECURITY), ML-005
  (GRANT EXECUTE a PUBLIC/anon, inclusive grant quebrado em várias linhas), ML-008 (SECURITY DEFINER + GRANT TO
  authenticated sem checagem do chamador no corpo) e ANTIPADRAO (EXCEPTION WHEN OTHERS ... RAISE NOTICE sem re-raise;
  `RAISE NOTICE ...; RAISE;` passa). Com CHANGED_FILES linta só o diff; sem ele varre o diretório. Exceções ficam
  documentadas no manifesto: arquivo listado em exceptions[] do scripts/db-audit/migration-evidence.json (o mesmo
  "manifesto de exceções" do check-migration-drift.mjs) é dispensado — seu conteúdo já é fixado por sha256 ali e
  qualquer edição é recusada pelo drift checker no mesmo job. MIGRATION_LINT_MANIFEST e MIGRATIONS_DIR sobrescrevem
  caminhos para teste.
- .github/workflows/db-guard.yml (na lista do cartão): passo "Lint de conteudo das migrations alteradas", que roda em
  pull_request e merge_group com CHANGED_FILES = a lista de arquivos alterados contra `origin/<base>` filtrada a
  `supabase/migrations/*.sql` (o mesmo padrão de paths-filter do ci.yml), mais `fetch-depth: 0` no checkout — sem
  histórico o merge-base não existe e o diff sairia vazio. Sem ligar no workflow a guarda existiria e não rodaria em
  PR nenhum, e o critério 1 do cartão ("migration insegura é barrada no PR") não teria como ser cumprido.
- scripts/db-audit/lint-migrations-content.test.mjs (novo): 10 casos de teste do lint — autorizado pelas REGRAS do
  cartão ("atualize ou crie testes dos arquivos que tocar e liste-os no relato").

## Prova
- vermelho antes (guarda desligada): fixture com SECURITY DEFINER sem search_path + GRANT a anon →
  `MIGRATIONS_DIR=.tmp/demo-migrations node scripts/db-audit/lint-migrations-content.mjs` →
  "lint-migrations-content: 2 violacao(oes) em 1 migration(s)" com [ML-001] e [ML-005], EXIT=1. A V2 não tinha
  nenhuma guarda de conteúdo (nem check-migration-drift.mjs, nem os testes anteriores do glob), então a suíte nova
  falha sem este arquivo.
- verde depois: `node --test scripts/db-audit/lint-migrations-content.test.mjs` → "ℹ tests 10 / ℹ pass 10 / ℹ fail 0".
- cadeia inteira (shell do workflow exercitado com o componente real): `BASE_REF=main bash --noprofile --norc -euo
  pipefail .tmp/step.sh` imprime "Lintando migrations alteradas:" e roda o lint; com BASE_REF vazio imprime "Sem
  base_ref ... pulado." e sai 0; `bash -n` do mesmo bloco: OK.
- guarda contra a árvore de hoje: rodei o lint com o conjunto das 50 migrations alteradas do diff contra origin/main →
  1 violação, e é achado REAL (abaixo).
- verificação do cartão: `zapp-verify . --rapido` — resultado no bloco FATOS MEDIDOS abaixo, posto pelo fechar.

## Achado (é do lint, não do escopo deste cartão)
- ML-008 aponta supabase/migrations/20261007004252_talkx_engine_window_contract.sql:263 —
  public.talkx_engine_window_open é SECURITY DEFINER, tem GRANT EXECUTE TO authenticated e nenhuma checagem do
  chamador no corpo (nem auth.uid()/auth.role(), nem has_role(), nem current_profile_id()): qualquer autenticado
  lê a janela de qualquer campanha. Correção = migration nova redefinindo a função com a guarda (arquivo fora da
  lista deste cartão). Registrei em kanban_comment.
- No mesmo glob, talkx-schedule-timezone-contract.test.mjs tem 2 falhas PRÉ-EXISTENTES (411 testes, 409 passam);
  nenhum dos arquivos do meu diff é lido por esse teste.

## O que NÃO fiz e por quê
- Não implementei ML-002/ML-003/ML-007/ML-009 da V3: o cartão nomeia ML-001, ML-004, ML-005, ML-008 e o antipadrão.
- ML-008 aceita auth.uid(), auth.role(), has_role() e current_profile_id(). auth.role() é exatamente o que o próprio
  ML-008 da V3 aceita; has_role() é nomeado no cartão; current_profile_id() é o helper de identidade do chamador das
  RPCs da V2. Sem os dois últimos, 4 RPCs legítimas do merge de hoje (talkx_engine_window_contract,
  p1_department_whatsapp_mode, team_chat_direct_conversation_race_guard, scope_wa_label_rpc_by_connection) eram
  falso positivo e a guarda barraria um merge sem relação com elas. Se o revisor preferir o par literal do cartão, é
  trocar uma linha; os 4 arquivos viram pendência de banco (cartão próprio). Isso é alinhamento de detecção, não
  exceção nova: continua exigindo checagem de identificação do chamador no corpo.
- Corrigi um falso positivo de regex no porte: "SECURITY DEFINER" citado no texto de `comment on function ... is '...'`
  casava ML-001; agora comentário e string de linha são mascarados na detecção (com teste próprio).

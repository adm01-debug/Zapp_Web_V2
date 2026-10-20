Especialista: senior (area-sql-banco)

Refazer 1 de "Trilha de auditoria administrativa (PE-SQL-010)". A migration do
trabalho anterior foi mantida byte a byte; o que muda aqui é a PROVA (ponto 1) e
o isolamento do diff (ponto 2). Vocabulário real da trilha: `action` é
`<tabela>_<operacao>` em minúsculas (`profiles_update`, `global_settings_update`,
`<tabela>_insert/_delete/_update`), `entity_id` é o uuid da linha, e em
`global_settings` a CHAVE vai em `details.key` (nome, nunca o valor).

Ponto 1 — verificação rápida não prova banco; teste tem de rodar o SQL de verdade
- O que mudei: excluí `supabase/tests/audit_admin_changes.sql` (prova fora do
  padrão do repo, sem bloco vermelho/verde nem rollback executado) e criei
  `scripts/db-audit/audit-admin-changes.test.sh` (prova em PostgreSQL 17
  descartável que aplica O PRÓPRIO arquivo
  `supabase/migrations/20261013042745_audit_admin_changes.sql`, sem cópia).
  Roteiro: BLOCO A (sem gatilhos: escritas não geram nada — defeito reproduzido),
  BLOCO B (52 asserções com a migration aplicada, como `authenticated` com JWT e
  como `service_role`), BLOCO C (extrai o `-- Rollback:` do cabeçalho da
  migration, executa, prova 0 gatilhos/função removida e reaplica idempotente).
  Registrei o arquivo na ALLOWLIST de `scripts/ci/check-test-inventory.mjs`
  (5 linhas: comentário + entrada), no padrão das demais provas docker.
- Teste que prova: `scripts/db-audit/audit-admin-changes.test.sh`.
  Vermelho antes: com a migration ausente o teste aborta em
  `[FAIL] migration nao encontrada: .../20261013042745_audit_admin_changes.sql`;
  no BLOCO A, `audit_logs` fica vazio após UPDATE de `is_active`, UPDATE de
  config e INSERT em `ip_whitelist` (defeito). Verde depois: `OK: trilha
  administrativa provada (A: defeito; B: 8 gatilhos; C: rollback+reaplicacao)`.
  Segredo `sk-live-SEGREDO-*` nunca aparece em `details` (B-G.4 conta 0);
  INSERT direto em `audit_logs` negado pela policy real (B-F.1 `row-level
  security`); sem EXECUTE na função para anon/authenticated/service_role e a
  trilha continua gravando via gatilho (B-S.1–B-S.3).
- Correção de vocabulário herdada do relato anterior: a tabela de ações do
  relato antigo (`profile_permission_changed`, `config_changed`) não existe no
  SQL — os nomes reais acima são os que o teste assevera. Nenhum comportamento
  da migration foi alterado por causa disso.

Ponto 2 — branch andou depois do fechar; reproducão com verificação completa
- O que mudei: nada na migration (byte a byte igual à entrega anterior); o diff
  final contra a base contém SÓ os arquivos deste cartão (lista exata abaixo).
  A branch do dia andou 53 commits de outros cartões depois do corte deste
  trabalho (`HEAD~1..dia/2026-10-13`, incluindo TalkX) — nenhum deles entra no
  meu diff.
- Prova: `zapp-verify full .` (691s) → dependencias OK, db_guard OK, tipos OK
  (8s), lint OK (90s), migrations OK, banco_local AVISO (sem conjunto, como no
  relato anterior); `testes` FALHOU em 1 arquivo ALHEIO ao cartão:
  `src/components/talkx/__tests__/RuleValueInput.test.tsx` — 1 teste ("em
  breve": botão "Novo segmento" ausente; 11901 passaram, 25 expected fail,
  14 todo) + 1 erro de worker em `RealtimeInboxView.selectedMessagesError`
  (ERR_INVALID_ARG_TYPE, infra do run paralelo). É de outro cartão: meu diff
  não toca `src/`, o teste/componente não referenciam auditoria, e re-rodado
  isolado (`bun run vitest run .../RuleValueInput.test.tsx`, 7.81s) falha igual
  (1 failed | 4 passed). Registrei o achado em `kanban_comment` e não corrigi
  (fora do escopo).

Arquivos do diff contra a base (`git diff --name-only`, sem contar de cabeça):
```
scripts/ci/check-test-inventory.mjs
scripts/db-audit/audit-admin-changes.test.sh
supabase/migrations/20261013042745_audit_admin_changes.sql
```
(3 arquivos, +630/-0; o `supabase/tests/audit_admin_changes.sql` da entrega
recusada saiu do diff — era prova fora do padrão e a base nunca o teve.)

Comandos de verificação (resultado real):
- `./scripts/db-audit/audit-admin-changes.test.sh` → OK (52 PASS, 0 FAIL)
- `node scripts/ci/check-test-inventory.mjs` → `audit-admin-changes.test.sh` sem
  orfandade (6 órfãos restantes são pré-existentes da branch do dia, de outros
  cartões; não tocados)
- `zapp-verify full .` → VERDE em dependencias/db_guard/tipos/lint/migrations;
  `testes` com 1 falha pré-existente e alheia (TalkX UI, acima); banco_local
  AVISO (sem conjunto)

Notas honestas:
- `hermes-tarefa-fechar`/`hermes-tarefa-iniciar` estão congelados nesta sessão
  (modo V1 suspenso); o fechamento segue pelo Kanban. A guarda do workspace
  proíbe trocar de branch, por isso o refazer foi feito no próprio workspace e
  branch da tarefa, com commit novo só com estes arquivos.
- REGISTRO PENDENTE: passo de uma linha no `db-guard.yml` para este `.test.sh`
  (agente não edita workflow; ALLOWLIST feita no padrão).

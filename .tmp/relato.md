Especialista: senior (area-sql-banco)

Refazer 1 do t_a631f82f. A recusa apontou 2 pontos; abaixo ponto a ponto.

## Ponto 1 — diff de 91388 chars com codigo do cartao pai
O que mudei: removi `supabase/migrations/20261009203548_talkx_campaigns_send_weekdays_dnd.sql`
do branch (`git rm`; arquivo do cartao pai, era 536 linhas / ~24 KB no diff). A entrega agora
contem SO a migration de correcao, mais 2 extensoes de teste que provam o ponto 2.
Teste que prova: `git diff $(git merge-base HEAD dia/2026-10-13) -- . | wc -c` = 60658 antes de
re-escrever este relato (era 91359; teto 90000). Arquivos: `git diff --name-only` lista abaixo.
Desvio do cartao (item 3, consciente): o cartao manda recriar `talkx_campaign_window_open` "so
com a linha do cast validada", mas essa funcao NAO tem linha de cast — ela le a coluna
`send_weekdays smallint[]` direto da tabela (conferido no corpo da migration pai). Recriar
identico seria diff sem efeito; mantida a decisao do trabalho anterior (nao tocar window_open,
scheduler, hooks nem testes deles). A recusa nao pediu window_open.

## Ponto 2 — dois caminhos sem teste ([1,2,3] valido e ["a"] invalido) + rollback nao executado
O que mudei (somas a migration de correcao, sem alterar o .sql dela):
- `scripts/db-audit/talkx-update-limits-casts.test.sh`: bloco N-102 que cria as colunas
  `send_weekdays`/`respect_dnd` no fixture, aplica a migration REAL
  (`20261013230014_talkx_n102_window_fixes.sql`) e chama a RPC REAL como authenticated:
  [1,2,3] grava `{1,2,3}`; [] grava `{}`; ["a"] da 22023 `invalid_talkx_limits_values`;
  [7] da 22023 (0..6); [0,6]+respect_dnd=false grava `{0,6}:false`; nenhuma saida contem 42846.
- `scripts/db-audit/talkx-draft-save.test.sh`: mesmo padrao no create ([1,2,3] cria revisao 1 e
  persiste) e no update ([0,6] avanca a revisao 1->2), ["a"] e [7] recusados com 22023
  `invalid_talkx_campaign_draft`, nunca 42846.
- Rollback: extrai as linhas 4-5 do `-- Rollback:` do proprio .sql (`sed -n '4,5p' | sed
  's/^--   //'`), aplica num Postgres descartavel e confirma via `pg_proc.prosrc` que os 2
  corpos anteriores voltaram + comportamento: [1,2,3] volta a estourar 42846; reaplicar a
  migration deixa verde de novo (prova em /tmp, script fora do repo para nao sujar o diff).
Teste que prova (Postgres 17 descartavel, docker):
- RED (sem a correcao, `N102_SKIP_FIX=1`): limits sai 1
  (`FAIL: N-102: array valido [1,2,3] foi recusado: ERROR: invalid_talkx_limits_field`);
  draft sai 1 (`FAIL: N-102: [1,2,3]/respect_dnd=false nao persistidos no rascunho`).
- GREEN (com a correcao): limits sai 0 (`[OK] ... N-102 grava send_weekdays validado ...`);
  draft sai 0 (`PASS: ... N-102 stores validated send_weekdays ...`).
- Rollback: script dedicado sai 0 (`PASS: rollback N-102 executavel e completo ...`).
- ACL inalterada: REVOKE/GRANT da migration identicos aos da base (draft: PUBLIC,anon ->
  authenticated; limits: PUBLIC,anon -> authenticated; `authenticated` segue com EXECUTE e
  `anon` sem, como nos testes que checam `has_function_privilege`).

## Arquivos (`git diff --name-only <base>...HEAD`)
- supabase/migrations/20261013230014_talkx_n102_window_fixes.sql (novo, do trabalho anterior)
- scripts/db-audit/talkx-update-limits-casts.test.sh (bloco N-102)
- scripts/db-audit/talkx-draft-save.test.sh (bloco N-102)
- .tmp/relato.md (este arquivo)
Nao inclui: 20261009203548 (cartao pai, removido do diff), window_open, scheduler, hooks,
guards, manifestos, CI.

## Comandos de verificacao (resultado real)
- `bash scripts/db-audit/talkx-update-limits-casts.test.sh` -> exit 0
- `bash scripts/db-audit/talkx-draft-save.test.sh` -> exit 0
- `N102_SKIP_FIX=1 bash scripts/db-audit/talkx-update-limits-casts.test.sh` -> exit 1 (RED)
- `N102_SKIP_FIX=1 bash scripts/db-audit/talkx-draft-save.test.sh` -> exit 1 (RED)
- `bash /tmp/n102-rollback-proof.sh` -> exit 0 (rollback extraido aplica, restaura os 2 corpos,
  42846 volta; re-fix verde e replayavel)
- `git diff <base>...HEAD | wc -c` -> 60658 (teto 90000)
- `zapp-verify --rapido` -> ver saida em /tmp/n102-verify.log

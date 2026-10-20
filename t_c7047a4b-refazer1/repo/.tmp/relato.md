Especialista: senior

Refazer 1 do teste da janela de envio/ACL do TalkX (N-102). Parti do trabalho anterior
(branch v2/talkx-n102-window-test-sh-2610131049cbdb, commit 396204b35b): rodei o script
recusado como baseline (GREEN exit 0, RED exit 1) e confirmei que os pontos 1, 2 e 4
descreviam endurecimentos (o código já usava SET LOCAL/ON_ERROR_STOP=1/loop) — então
tornei cada um explícito e testável — e que o ponto 3 (idempotência do registro no CI)
era o defeito real. Skill de área usada: area-testes-do-produto.

## O que mudou e por quê
- scripts/db-audit/talkx-n102-window.test.sh (novo, 327 linhas): apply_fix dedicado com
  ON_ERROR_STOP=1 explícito + fail-fast por fatia; B0 prova que SET LOCAL ROLE morre
  no COMMIT; comentários que amarram cada trecho ao ponto da recusa.
- .github/workflows/db-guard.yml (+55/-0): passo de detecção via API de arquivos do PR
  (checkout raso não tem merge-base) + teste CHEIO só com diff TalkX + caminho rápido
  RED (TALKX_N102_SKIP_FIX=1, teto 300 s) que exige o vermelho no B1.

## Prova (Postgres 17 descartável local, base 20261009203548 + 4 fatias N-102)
- vermelho antes/depois: `TALKX_N102_SKIP_FIX=1 bash scripts/db-audit/talkx-n102-window.test.sh` → exit 1, `[FAIL] BLOCO B1: authenticated NAO deveria ter EXECUTE na RPC, obtive 't'` (B0 e A1–A5 passam antes).
- verde depois: `bash scripts/db-audit/talkx-n102-window.test.sh` → exit 0, 17 PASS + `[OK] Talk X N-102: window_open respeita o fuso da campanha, ACL so service_role, send_weekdays validado (22023) e rollback guardado.` (ZERO FAIL).
- fail-fast (ponto 2): fatia 20261013235900 corrompida numa cópia → exit 1, `[FAIL] migration de correcao nao aplicou (fail-fast): 20261013235900_talkx_n102_window_fixes.sql`.
- descoberta em loop (ponto 4): 5ª fatia dummy `..._dummy_talkx_n102_window_fixes.sql` → exit 0, `[INFO] leva aplicada (5): ... 20261013999999_dummy_talkx_n102_window_fixes.sql`.
- bloco rápido do CI (ponto 3): o `run:` extraído do YAML roda local → exit 0, `RED confirmado (rc=1): sem a fatia o teste falha no B1 como esperado`; YAML parseia (121 steps), `bash -n` OK, `node --check` OK no script de detecção.
- patch aplica: `git apply --check` OK nos 2 arquivos; patch tem 22126 chars (< teto 90k).

## Pontos do revisor
- Ponto 1 (SET ROLE vaza entre conexões do pool): resolvido — call_window:206 e probe:226 já usavam SET LOCAL ROLE; adicionei B0 (linhas 160–173) que prova na mesma sessão `authenticated→postgres` após o COMMIT + comentário em call_window:204. Teste que prova: `[PASS] B0 (isolamento)...` no RED e no GREEN acima.
- Ponto 2 (probe engole SQLSTATE; fatias com ON_ERROR_STOP=1; Etapa 4 proibida): resolvido — aplicação das fatias via apply_fix (linhas 39–47, loop:251–253, reaplicação B7:326) com ON_ERROR_STOP=1 explícito + fail-fast; a base continua aplicada como antes (não tocada); probe mantém ON_ERROR_STOP=0 por desenho (o SQLSTATE sai via NOTICE do EXCEPTION WHEN others; got!=expected ou vazio = FAIL — comentário linhas 223–226). Teste que prova: fail-fast acima + GREEN com probe passando (B4a–B4d).
- Ponto 3 (registro no CI idempotente: sentinela + rápido RED com TALKX_N102_SKIP_FIX=1 e timeout 300): resolvido — .github/workflows/db-guard.yml:350–399 (detecção id n102-mudou via pulls.listFiles + regex /talkx/i; CHEIO só com diff TalkX; rápido exige rc!=0, rc!=124 e `FAIL.*BLOCO B1`). Teste que prova: simulação do bloco acima + validações de sintaxe.
- Ponto 4 (Etapa 4: o próprio teste aplica a base; descobrir em loop todas as N-102-fixes): resolvido — a base é aplicada pelo próprio script (inalterado, proibido mexer); o loop descobre todas via glob + apply_fail-fast (linhas 251–253) e tolera 1 arquivo colapsado. Teste que prova: descoberta com 5ª fatia acima.

## O que NÃO fiz e por quê
- Não mudei a flag ON_ERROR_STOP=0 da probe para 1: o mecanismo SQLSTATE-via-NOTICE precisa do psql sobrevivendo ao erro capturado; o estrito (fail-fast) está na aplicação das fatias. Decisão documentada no código (linhas 223–226).
- Não registrei caminho FULL no CI para push na main/merge_group: mesma regra do job replay-migrations (só o PR olha o diff); fora de PR cai no rápido RED.
- Não incluí fixtures (base + 4 fatias) no diff: são de outros cartões (preparação t_37e0dde7 abandonado + correções); transferi cópias para o workspace só para a prova local, com sha256 idêntico ao dos commits de origem (7332f3f3…, e01e70c9…, cea8ddd0…, 34171602…, e594fddc…).

## Arquivos do diff (patch .tmp/patch/refazer1-talkx-n102-window-test-sh.patch, aplica na raiz, 22126 chars)
- scripts/db-audit/talkx-n102-window.test.sh (novo)
- .github/workflows/db-guard.yml (hunk após o passo ai-usage-cost, antes de DASH-ACCEPTANCE-001)

## Comandos de verificação (resultado real)
- `bash -n scripts/db-audit/talkx-n102-window.test.sh` → SYNTAX_OK
- RED: exit 1 + `[FAIL] BLOCO B1: authenticated NAO deveria ter EXECUTE na RPC, obtive 't'`
- GREEN: exit 0 + 17 PASS + `[OK] Talk X N-102: ...` (ZERO FAIL)
- `python3 yaml.safe_load(db-guard.yml)` → YAML_OK 121 steps; `bash -n` bloco rápido → OK; `node --check` detecção → OK
- `git apply --check` do patch → OK nos 2 arquivos
- busca pelo identificador do projeto de produção nos 2 arquivos → 0 ocorrências

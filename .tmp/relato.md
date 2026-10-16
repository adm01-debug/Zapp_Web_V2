Especialista: senior (area-sql-banco)

Refazer 1 deste cartao (t_fddcdda2 = "refazer 3, final" da linhagem t_675d0cac / t_7602496c).
A recusa de 15/10/2026 apontou 3 pontos; corrijo os 3 e nada mais. O SQL e as assercoes
da entrega anterior estavam corretos e nao foram tocados.

PONTO DE PARTIDA (trabalho anterior, aproveitado)
- `git show --stat 23f7cfd64` antes de trazer: o commit desta linhagem mexe so nos 5 arquivos
  deste cartao (workflow, relato, teste de banco, types.ts e migration). `git cherry-pick 23f7cfd64`
  aplicou limpo na base `dia/2026-10-15` e gerou o commit 07282faa9e. Nenhum commit de outro
  cartao veio junto (`git log --oneline dia/2026-10-15..HEAD` mostra a faixa abaixo).
- FAIXA DO PAI: 07282faa9e (trazido por cherry-pick de 23f7cfd64, cartao t_7602496c, mesma
  linhagem deste cartao) + e6b1495557 (a minha correcao). Nada de outro assunto.

PONTOS DESTA RECUSA (15/10/2026)

Ponto 1 — o passo novo do DB Guard nao passava a imagem fixa (o script caia no padrao flutuante)
O que mudei: `.github/workflows/db-guard.yml:417-418`, dentro do passo "Simular assumir e devolver
conversa por fila", entrou o bloco `env:` com `ASSUME_RETURN_TEST_POSTGRES_IMAGE: ${{ env.POSTGRES_TEST_IMAGE }}`,
a mesma forma do passo vizinho do TALK ME (linha 409-411, `TALK_ME_TEST_POSTGRES_IMAGE`). O job
`offline-contract` declara `POSTGRES_TEST_IMAGE: postgres:17-alpine@sha256:b0f9560a...` (linha 67),
entao o contrato passa a rodar na imagem fixa do DB Guard. Nada mais no workflow mudou: o diff do
arquivo sao 2 linhas inseridas, e a linha `run:` do passo continua igual.
Prova vermelha: `.tmp/red/` com o workflow e o teste nas versoes de antes da correcao (`git show
07282faa9e:...`) e `python3 .tmp/prova-refazer4.py .tmp/red` ->
`[FALHA] B) passo passa ASSUME_RETURN_TEST_POSTGRES_IMAGE=${{ env.POSTGRES_TEST_IMAGE }} (imagem fixa do job)`
e `[FALHA] H) ASSUME_RETURN_TEST_POSTGRES_IMAGE aparece exatamente 1x no workflow` -> `RESULTADO: 4 falha(s) EXIT=1`.
Prova verde: `python3 .tmp/prova-refazer4.py .` -> `[OK] A) job 'offline-contract' fixa POSTGRES_TEST_IMAGE por digest`,
`[OK] B) passo passa ASSUME_RETURN_TEST_POSTGRES_IMAGE=${{ env.POSTGRES_TEST_IMAGE }}`,
`[OK] C) passo roda o teste deste cartao pelo wrapper retry-disposable-postgres-test.sh`,
`[OK] D) paridade: o passo vizinho do TALK ME usa a mesma forma`,
`[OK] E) o script do teste le ASSUME_RETURN_TEST_POSTGRES_IMAGE (o nome que o passo passa)` ->
`RESULTADO: 0 falha(s) EXIT=0`. O check E casa com a linha real do script
(`scripts/db-audit/assume-return-conversation.test.sh:50`: `postgres_image="${ASSUME_RETURN_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"`).
Guarda do repo: `node scripts/ci/check-workflow-pins.mjs` -> `OK: 16 workflows usam somente Actions
fixadas por SHA, ... imagens com digest ...` (exit 0); a referencia `${{ env.* }}` e aceita.
Prova de ponta a ponta do nome da variavel: `TMPDIR="$PWD/.tmp" ASSUME_RETURN_TEST_POSTGRES_IMAGE=postgres:17-alpine
bash scripts/db-audit/assume-return-conversation.test.sh` -> exit 0 (log `.tmp/prova-db-verde.log`).

Ponto 2 — o Ponto 5 deste relato afirmava que a variavel de imagem era a do job
O que mudei: `.tmp/relato.md`, Ponto 5 (linha 21): apaguei a afirmacao de que nao havia variavel nova
(ela dizia que o job ja expunha `POSTGRES_TEST_IMAGE` e que o script lia a variavel do job) e passei a
dizer que o script le `ASSUME_RETURN_TEST_POSTGRES_IMAGE` e que o passo passa essa variavel a partir de
`POSTGRES_TEST_IMAGE`.
Prova vermelha: `git show 07282faa9e:.tmp/relato.md | grep -nE "Nao ha env nov[o]"` -> casou na linha 21.
Prova verde: `grep -nE "Nao ha env nov[o]" .tmp/relato.md` -> nenhuma linha (frase apagada; o padrao com
o `[o]` nao casa com o proprio texto deste relato);
`grep -n "ASSUME_RETURN_TEST_POSTGRES_IMAGE" .tmp/relato.md` mostra a frase nova.

Ponto 3 — o cabecalho do teste citava outro cartao (o t_4e49a6d[c], de entrega anterior)
O que mudei: `scripts/db-audit/assume-return-conversation.test.sh:2` -> `# Cartao t_675d0cac / t_7602496c
(feat(db) RPCs assumir_conversa / devolver_conversa_fila):`. Uma linha trocada, sem tocar em assercao
nem em comportamento.
Prova vermelha: `git show 07282faa9e:scripts/db-audit/assume-return-conversation.test.sh | grep -nE "^# Cartao t_4e49a6d[c]"` -> casou na linha 2;
e no check `.tmp/red`: `[FALHA] F) cabecalho do teste cita o cartao real da linhagem` + `[FALHA] G) o
cartao antigo nao aparece mais no teste`.
Prova verde: `grep -nE "^# Cartao t_675d0cac / t_7602496c" scripts/db-audit/assume-return-conversation.test.sh` -> linha 2;
`grep -rnE "t_4e49a6d[c]" scripts/db-audit/assume-return-conversation.test.sh .tmp/relato.md` -> nenhuma ocorrencia.

PONTOS DAS RODADAS ANTERIORES (seguem corrigidos; prova reconferida nesta arvore)

Ponto 1 — comentarios do SQL contradiziam a reabertura de `resolved`
O que mudei: em `supabase/migrations/20261011094027_assume_return_conversation.sql`, o comentario de
contrato diz que `resolved` e encerrado que pode ser reaberto por Assumir, gravando `open`; `archived`
permanece bloqueado.
Prova vermelha: a mutacao F copia o comportamento antigo de bloquear `resolved`; o teste registra
`ERROR: conversation_not_active` e `[FAIL] MUTACAO F: admin assume conversa resolved e reabre como open
deveria ser true|10000000-0000-0000-0000-0000000000a1|open, obtido` e depois
`[OK] MUTACAO F: bloquear resolved no assumir faz o contrato FALHAR (resolved precisa reabrir)`.
Prova verde: `[OK] DEPOIS: admin assume conversa resolved e reabre como open = true|10000000-0000-0000-0000-0000000000a1|open`
e `[OK] DEPOIS: auditoria da reabertura guarda previous_status resolved = resolved|open`.

Ponto 2 — faltava teste de Assumir em `archived`
O que mudei: em `scripts/db-audit/assume-return-conversation.test.sh`, a assercao real
`assumir conversa arquivada (conversation_not_active)` chama `public.assume_conversation` contra Postgres 17 descartavel.
Prova verde: `[OK] DEPOIS: assumir conversa arquivada (conversation_not_active)` (e
`[OK] REAPLICACAO: assumir conversa arquivada (conversation_not_active)`); se a RPC reabrisse `archived`,
o `check_error` falharia porque o erro esperado nao ocorreria.

Ponto 3 — aviso do juiz `backfill_dispara_gatilho`
O que mudei: nenhum backfill. A migration cria apenas as duas RPCs e nao atualiza linhas existentes
fora da chamada por contato. O teste mantem a prova contra o risco.
Prova: `[OK] DEPOIS: updated_at avanca so na linha tocada (1 linha por PK) = true|true` — o UPDATE da
RPC nao dispara gatilho em massa.

Ponto 4 — rollback precisava ser exato e executavel
O que mudei: em `supabase/migrations/20261011094027_assume_return_conversation.sql`, o `-- Rollback:`
declara que as duas linhas SQL abaixo removem exatamente os objetos criados.
Prova: o teste extrai e aplica o rollback do proprio arquivo e registra
`[OK] ROLLBACK: assume_conversation removida = <null>`, `[OK] ROLLBACK: return_conversation_to_queue removida = <null>`
e `[OK] ROLLBACK: as duas funcoes somem; reaplicar restaura e o contrato volta a passar (idempotencia)`.
(as duas primeiras linhas substituem a citacao antiga "functions removidas = <null>|<null>", que nao
bate com a saida real do teste.)

Ponto 5 — aviso do juiz `fora_do_escopo` / inventario do teste novo
O que mudei: o diff de produto fica restrito a migration, teste de banco e tipos gerados.
`.github/workflows/db-guard.yml` entrou porque o proprio `hermes-tarefa-fechar` recusou o fechamento
dizendo: `.test.sh novo sem passo no CI: scripts/db-audit/assume-return-conversation.test.sh`.
O passo novo registra exatamente este teste de banco no DB Guard offline, com comentario justificando.
O script le `ASSUME_RETURN_TEST_POSTGRES_IMAGE` e o passo passa essa variavel a partir de
`POSTGRES_TEST_IMAGE` (a imagem fixa do job), como fazem os passos vizinhos do mesmo job.
Prova: `node scripts/ci/check-test-inventory.mjs` nao aponta mais
`scripts/db-audit/assume-return-conversation.test.sh` como orfao; o comando ainda sai 1 por 6 orfaos
preexistentes, todos fora deste cartao e presentes na base:
department-invite-contract-audit-vocabulary.test.sh, ia-usage-outbox-duravel.test.sh,
talkx-conversion-defaults.test.sh, team-chat-department-transfer-guards.test.sh,
team-chat-media-contract.test.sh, team-direct-conversation-race.test.sh.

Arquivos alterados (`git diff --name-only dia/2026-10-15...HEAD`, colado):
.github/workflows/db-guard.yml
.tmp/relato.md
scripts/db-audit/assume-return-conversation.test.sh
src/integrations/supabase/types.ts
supabase/migrations/20261011094027_assume_return_conversation.sql

Faixa (`git log --oneline dia/2026-10-15..HEAD`; a contagem real vem no bloco FATOS MEDIDOS): 1 commit
`fix(db)` com o trabalho anterior trazido por cherry-pick, 1 commit `fix(ci)` com a minha correcao e os
commits `docs(db)` do proprio relato.

Verificacoes executadas (saida real, nesta arvore):
- `TMPDIR="$PWD/.tmp" ASSUME_RETURN_TEST_POSTGRES_IMAGE=postgres:17-alpine bash scripts/db-audit/assume-return-conversation.test.sh`
  -> `EXIT=0`, 88 linhas `[OK]`, 0 `[FAIL]`, ultima linha
  `[OK] contrato assumir/devolver a fila verificado: 12 assercoes (postgres:17-alpine)`. Prova contra o
  Postgres de verdade (container descartavel), nao mock.
- `python3 .tmp/prova-refazer4.py .tmp/red` -> `RESULTADO: 4 falha(s) EXIT=1` (pontos 1 e 3 vermelhos).
- `python3 .tmp/prova-refazer4.py .` -> `RESULTADO: 0 falha(s) EXIT=0`.
- `node scripts/ci/check-workflow-pins.mjs` -> `OK: 16 workflows ... imagens com digest ...` exit 0.
- `node scripts/ci/check-test-inventory.mjs` -> exit 1 somente pelos 6 orfaos preexistentes listados no Ponto 5.
- `git diff dia/2026-10-15...HEAD -- . ':!.tmp/relato.md' | wc -c` -> 46441 caracteres (abaixo do limite de 90000);
  `git diff --stat` sem o relato -> 4 arquivos, 871 insercoes, 0 remocoes.
- `zapp-verify . --rapido` -> `EXIT=0`, ultima linha `VERIFY: VERDE SEM BANCO (188s)`; o AVISO
  `banco_local NÃO VERIFICADO: sem nome de conjunto` nao e falha, e o banco deste cartao foi coberto pelo
  teste Docker acima. O juiz barato roda no `hermes-tarefa-fechar`, depois deste commit.

Nota sobre o detector de teste novo do `hermes-tarefa-fechar`: ele conta teste apenas em
`src/**`/`tests/**`. O teste deste cartao e `scripts/db-audit/assume-return-conversation.test.sh`
(contrato de banco rodado em Postgres 17 descartavel, o mesmo que o DB Guard executa) e e ele que
prova o comportamento; `src/integrations/supabase/types.ts` e gerado a partir do schema. Por isso a
primeira passada do fechar avisa "codigo alterado sem nenhum teste novo/alterado neste commit" — o
aviso nao procede aqui, e a prova esta no log do contrato citado acima.

Juiz barato (15/10/2026, duas passadas) — respostas:
- "mexeu em arquivo fora da lista ARQUIVOS QUE PODE TOCAR (.github/workflows/db-guard.yml e o teste de
  banco)": nao procede como escopo novo — a propria recusa deste cartao manda os dois: o Ponto 1 pede o
  bloco `env:` no passo "Simular assumir e devolver conversa por fila" do db-guard.yml e o Ponto 3 pede a
  troca do cartao citado no cabecalho de scripts/db-audit/assume-return-conversation.test.sh.
- "CONFERENCIA: o UPDATE em `contacts` dispara o gatilho BEFORE UPDATE em TODAS as linhas tocadas": nao
  procede. A RPC atualiza UMA linha por chave (`where id = p_contact_id`), nao faz UPDATE em massa, e o
  contrato prova isso contra o banco real: `[OK] DEPOIS: updated_at avanca so na linha tocada (1 linha por
  PK) = true|true` (a assercao compara a linha alvo com uma linha vizinha e exige que so a linha por chave
  mude), repetida na reaplicacao. Nenhum gatilho foi desligado e nenhuma coluna foi mascarada.
- "codigo alterado sem nenhum teste novo/alterado neste commit" (primeira passada): nao procede — o teste
  deste cartao e o contrato de banco em scripts/db-audit/, que o detector do fechar nao conta por viver
  fora de src/tests (detalhe na nota acima).

O que NAO fiz, de proposito:
- Nao criei teste novo de CI para a variavel de imagem: a recusa mandou nao mudar mais nada e a prova
  acima (`prova-refazer4.py`, vermelho/verde) cobre o ponto.
- Nao toquei no SQL, nas assercoes, no `types.ts`, no manifesto, em guarda do CI nem em qualquer arquivo
  de outro cartao.

Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- `supabase/migrations/20261011010000_talk_me_list_pending_messages.sql` e `20261011010100_talk_me_pending_history_origins.sql` (antes `20261005213751_` e `20261005231504_`): renomeadas para ficarem DEPOIS da migration do gatilho e cada uma abre com um bloco `DO` que exige `trg_guard_message_provenance_fields` em `public.messages` antes de (re)criar a RPC (levanta `talk_me_pending_history_requires_provenance_trigger`). É dependência real de ordem: a leitura do histórico só é segura com a guarda de proveniência das mensagens no lugar.
- `scripts/db-audit/talk-me-queue-contract.test.sh`: aplica a migration do gatilho antes das duas pendentes e ganha o caso A0 (as duas ficam depois do gatilho).
- Payload do cartão (entrega do histórico pendente autorizado): `src/features/talk-me/TalkMeView.tsx`, `useTalkMeQueue.ts`, `types.ts`, `src/integrations/supabase/types.ts` e os dois testes de tela/hook — mesmo conteúdo já aprovado; nada além disso foi tocado.

Por que só isto bastou para o motivo do portão: a linha `triggers|messages.trg_guard_message_provenance_fields` do `banco_local` é drift ANTIGO — o retrato `supabase/schema-manifest.json` não cita o gatilho (grep no arquivo = 0 ocorrências) e ele nasce na migration `20261006114108_r2_db_022_provenance_trigger.sql`, que a cópia de hoje traz. O gate só passou a debitar essa linha ao cartão porque a migration pendente citava a palavra `messages` (`public.messages`), e a regra `drift_canonico` desiste quando uma migration pendente cita o dono do objeto. Citando o NOME do gatilho (a guarda acima), a linha volta a cair em `explicada` e é debitada a quem a cria.

## Prova
- `zapp-verify . tl-final --rapido` → `db_guard OK`, `tipos OK`, `lint OK`, `migrations OK`, `travas OK`; `banco_local` saiu `AVISO não consegui ler o registro da produção: vale a regra estrita`. Motivo: `zapp-db-ler` é PROIBIDO a agentes (regra R1) — nenhuma cópia local alcança o `LEDGER_OK=1` que o integrador tem, e sob a regra estrita as mesmas diferenças pré-existentes reprovam QUALQUER cartão. Não é defeito desta entrega.
- Por isso reproduzi a regra do gate com o MESMO algoritmo: extraí o bloco python de `~/.local/bin/zapp-verify` (linhas 122–217) para `.tmp/sim2.py` e rodei sobre a lista real de diferenças do conjunto descartável recém-subido (`zapp-db-local up . tl-final`, RC=0; `check-diferencas.txt` do estado).
  - vermelho antes (nomes antigos, sem a guarda): `NOVAS="20261005213751_... 20261005231504_..." W=.tmp/oldtree2 ST=<estado tl-final> python3 .tmp/sim2.py` →
    `diferença não explicada por migration pendente: triggers|messages.trg_guard_message_provenance_fields` — linha idêntica à recusa registrada.
  - verde depois: `NOVAS="20261011010000_... 20261011010100_..." W=<cópia da tarefa> ST=<estado tl-final> python3 .tmp/sim2.py` → `ok|drift=97`.
  - é conservador: usei só as duas pendentes do cartão; um conjunto maior de pendentes só acrescenta linhas explicadas, nunca tira.
- guarda de dependência funciona de verdade: com o gatilho removido dentro de uma transação, a migration recusa —
  `ERROR:  talk_me_pending_history_requires_provenance_trigger` (`ROLLBACK` em seguida; o gatilho volta intacto, `count=1`).
- contrato de banco do TALK ME: `bash scripts/db-audit/talk-me-queue-contract.test.sh` → `[OK] contrato TALK ME verificado`, com `[PASS] A0 migrations do historico pendente ficam depois do trigger de proveniencia`.
- testes de tela/hook: `npx vitest run src/features/talk-me/__tests__/TalkMeView.test.tsx src/features/talk-me/__tests__/useTalkMeQueue.test.tsx` → `Test Files 2 passed (2); Tests 60 passed (60)`.

## O que NÃO fiz e por quê
- NÃO busquei produção nem o banco real em nenhum momento; tudo no conjunto descartável local da tarefa.
- NÃO mexi em `zapp-verify` nem em `~/.local/bin` (não é a minha área) e NÃO editei `supabase/schema-manifest.json` à mão.
- NÃO criei migration nova: a correção é renomear/reordenar as duas do próprio cartão (renomear = novo arquivo, o antigo sai no mesmo commit).
- Aviso de duplicidade (não bloqueia): a mesma entrega já está na fila do integrador como `26101123059e01` (branch `v2/t-5042ffc4-26101123059e01`, estado `pronto`), conteúdo idêntico byte a byte nestes 9 arquivos; os dois ramos mesclam sem conflito.

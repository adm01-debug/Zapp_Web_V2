Task t_fddcdda2: [refazer 1] [refazer 3, final] feat(db): RPCs assumir_conversa e devolver_conversa_fila
  status:    running
  assignee:  senior
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_fddcdda2
  max-retries: 2 (default)
  created:   2026-10-12 10:55 by user
  started:   2026-10-14 12:29

Body:
REFAZER (rodada 1 de 2). A entrega anterior deste trabalho foi RECUSADA e nada entrou.

MOTIVO DA RECUSA: Ponto 1: resolvido (o cabeçalho e o comentário de assume_conversation agora dizem que 'resolved' reabre gravando 'open' e que 'archived' segue bloqueado, como o código faz). Ponto 2: resolvido (check_error 'assumir conversa arquivada (conversation_not_active)' sobre C_ARCH). Ponto 3: resolvido (a migration não tem backfill; o teste compara updated_at da linha tocada com a vizinha). O rollback é real e testado, e o passo no db-guard.yml se justifica pela exigência de inventário do fechar. Defeito novo que o próprio diff mostra: o relato afirma que 'o job já expõe POSTGRES_TEST_IMAGE e o script lê essa variável', mas o script lê ASSUME_RETURN_TEST_POSTGRES_IMAGE (padrão postgres:17-alpine) e o passo novo não a define. No CI o teste roda com imagem flutuante, fora da imagem fixa do DB Guard, ao contrário do passo vizinho (TALK_ME_TEST_POSTGRES_IMAGE: ${{ env.POSTGRES_TEST_IMAGE }}). O ponto do juiz sobre contagem não procede: 5 arquivos e 1 teste batem com o stat.

O QUE CORRIGIR: 1) Em .github/workflows/db-guard.yml, no passo 'Simular assumir e devolver conversa por fila', acrescentar `env: ASSUME_RETURN_TEST_POSTGRES_IMAGE: ${{ env.POSTGRES_TEST_IMAGE }}`, igual ao passo talk-me-queue-contract logo acima; não mudar mais nada no workflow. 2) Corrigir o Ponto 5 do .tmp/relato.md: dizer que o script lê ASSUME_RETURN_TEST_POSTGRES_IMAGE e que o passo passa essa variável a partir de POSTGRES_TEST_IMAGE (apagar a frase 'Não há env novo... o script lê essa variável'). 3) No cabeçalho de scripts/db-audit/assume-return-conversation.test.sh, trocar 'Cartao t_4e49a6dc' pelo cartão real desta linhagem (t_675d0cac / t_7602496c). Nada mais muda: SQL e asserções estão corretos.

TRABALHO ANTERIOR (aproveite, não recomece): branch `v2/t-7602496c-261012080469a9` (commit 23f7cfd64) no repositório; no workspace novo, traga os commits com `git cherry-pick` e corrija só o que foi apontado.

PEDIDO ORIGINAL:
ESPECIALISTA DA ÁREA: senior (revisão técnica e correção final). Comece o relato com a linha `Especialista: senior`.
Origem: revisão exaustiva do Claude em 12/10/2026 — esta linhagem esgotou as 2 rodadas de refazer e caiu na caixa de decisões; o Claude leu o parecer do revisor e decidiu a correção. Cartão original: t_675d0cac (T1r).

PONTO DE PARTIDA (obrigatório): continue do commit b5dbe7bcab49 da branch v2/assume-return-conversation-refazer2-26101114573d0f (workspace /home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/assume-return-conversation-refazer2-26101114573d0f). Rebase na branch do dia atual se preciso, sem trazer trabalho de outros cartões.

PARECER DO REVISOR NA ÚLTIMA ENTREGA: O código reabre 'resolved' corretamente (UPDATE grava 'open', FSM permite, auditoria registra previous_status), e os testes de reabertura e takeover cobrem a regra adicional. Restam comentários contraditórios com o código, que o 'corrigir' anterior pediu para ajustar, e o bloqueio de 'archived' no assumir não tem teste.
Avisos do juiz: ['fora_do_escopo', 'backfill_dispara_gatilho']

O QUE FAZER
1. (1) Corrigir os comentários do SQL que contradizem o código (reabrir 'resolved' grava 'open'; descrever exatamente o que a função faz). (2) Acrescentar o teste que prova que ASSUMIR uma conversa 'archived' é recusado. (3) Relato ponto a ponto respondendo às recusas anteriores, inclusive explicando o aviso do juiz 'backfill_dispara_gatilho' (se há backfill, provar que não dispara gatilho indevido, ou removê-lo).
2. O diff final deve conter só o trabalho deste cartão (o juiz marcou 'fora_do_escopo' nas rodadas anteriores: se houver arquivo que não está na lista abaixo, tire-o ou justifique com evidência).

ARQUIVOS QUE PODE TOCAR
- supabase/migrations/<timestamp>_assume_return_conversation.sql
- testes de banco
- src/integrations/supabase/types.ts (gerado)
- .tmp/relato.md

CRITÉRIO DE PRONTO
1. Cada ponto do parecer acima respondido no relato, citando arquivo:linha.
2. zapp-verify . --rapido verde.

Feche com hermes-tarefa-fechar "<tipo>(<escopo>): <título>" .tmp/relato.md, dizendo no relato como resolveu cada ponto da recusa.

Comments (3):
  [2026-10-12 11:01] default: [jev-entrada] rota=complexo (conf 0.36 → humano, p_humano=0.10), faixa=migrations, injeção=0.38, ação externa=0.10 → RETIDO (decisão do dono; Jev inseguro)
  [2026-10-15 14:26] default: UNBLOCK: desbloqueio em lote: o modelo do perfil senior (openai-codex/gpt-5.5) voltou a responder (teste 15/10 13:55)
  [2026-10-15 23:27] senior: Refazer entregue (branch `v2/assume-return-conversation-refazer4-2610152318dab7`, base `dia/2026-10-15`). Os 3 pontos da recusa estão resolvidos, e nada mais mudou:

1) `.github/workflows/db-guard.yml:417-418` — o passo "Simular assumir e devolver conversa por fila" agora entrega `env: ASSUME_RETURN_TEST_POSTGRES_IMAGE: ${{ env.POSTGRES_TEST_IMAGE }}`, igual ao passo vizinho do TALK ME (o job `offline-contract` fixa `POSTGRES_TEST_IMAGE` na imagem por digest). Nada mais no workflow mudou: +2 linhas.
2) `.tmp/relato.md`, Ponto 5 — a frase que dizia que não havia variável nova foi apagada; agora diz que o script lê `ASSUME_RETURN_TEST_POSTGRES_IMAGE` e que o passo passa essa variável a partir de `POSTGRES_TEST_IMAGE`.
3) `scripts/db-audit/assume-return-conversation.test.sh:2` — cabeçalho passa a citar o cartão real da linhagem (`t_675d0cac / t_7602496c`); o id antigo não aparece mais em nenhum arquivo do diff.

Provas medidas agora: contrato de banco rodado contra Postgres 17 descartável -> exit 0, 88 `[OK]`, 0 `[FAIL]`, `[OK] contrato assumir/devolver a fila verificado: 12 assercoes`; checagem própria `.tmp/prova-refazer4.py` vermelha antes (4 falhas) e verde depois (0 falhas); `node scripts/ci/check-workflow-pins.mjs` -> OK; `zapp-verify . --rapido` -> `VERIFY: VERDE SEM BANCO`, exit 0.

Nota para o revisor: a passada adversarial do `hermes-tarefa-fechar` acusou "Ponto 2: o diff não inclui .tmp/relato.md; a correção do Ponto 5 não é verificável". Não procede: ela monta o diff com `:(exclude).tmp`, então nenhuma correção no relato é visível para ela — e o próprio Ponto 2 da recusa pediu a correção em `.tmp/relato.md`. A prova está no relato (Ponto 2: `git show 07282faa9e:.tmp/relato.md | grep -nE "Nao ha env nov[o]"` casa na linha 21; o mesmo grep no relato atual não devolve nada).

Events (34):
  [2026-10-14 12:30] gave_up {'failures': 2, 'effective_limit': 2, 'limit_source': 'dispatcher', 'error': 'pid 35352 exited with code 1 Worker\'s last output: \'t-5.5\\\' model is not supported when \\x1b[0m\\x1b[38;2;255;215;0m \\x1b[0m \\x1b[38;2;255;215;0m \\x1b[0m\\x1b[38;2;255;248;220musing Codex with a ChatGPT account."}\\x1b[0m\\x1b[38;2;255;248;220m                                         \\x1b[0m\\x1b[38;2;255;215;0m \\x1b[0m \\x1b[38;2;255;215;0m \\x1b[0m\\x1b[38;2;255;248;220m                                                                              \\x1b[0m\\x1b[38;2;255;215;0m \\x1b[0m \\x1b[38;2;255;215;0', 'trigger_outcome': 'crashed', 'retry_status': 'ready', 'pid': 35352, 'claimer': 'Joaquim:28864'}
  [2026-10-15 14:26] commented {'author': 'default', 'len': 117}
  [2026-10-15 14:26] unblocked
  [2026-10-15 14:31] reprioritized {'priority': 1}
  [2026-10-15 23:15] reprioritized {'priority': 9}
  [2026-10-15 23:17] [run 18914] claimed {'lock': 'Joaquim:38172', 'expires': 1792117956, 'run_id': 18914}
  [2026-10-15 23:17] [run 18914] spawned {'pid': 22980, 'started_at': '|179211705676'}
  [2026-10-15 23:17] [run 18914] heartbeat
  [2026-10-15 23:18] [run 18914] heartbeat
  [2026-10-15 23:19] [run 18914] heartbeat
  [2026-10-15 23:20] [run 18914] heartbeat
  [2026-10-15 23:21] [run 18914] heartbeat
  [2026-10-15 23:22] [run 18914] heartbeat
  [2026-10-15 23:24] [run 18914] heartbeat
  [2026-10-15 23:25] [run 18914] heartbeat
  [2026-10-15 23:26] [run 18914] heartbeat
  [2026-10-15 23:27] [run 18914] heartbeat
  [2026-10-15 23:27] commented {'author': 'senior', 'len': 1811}
  [2026-10-15 23:28] [run 18914] heartbeat
  [2026-10-15 23:29] [run 18914] heartbeat

Runs (3):
  #16899 crashed      @senior  36s  2026-10-14 12:29
        ! pid 30908 exited with code 1 Worker's last output: 't-5.5\' model is not supported when \x1b[0m\x1b[38;2;255;215;0m \x1b[0m \x1b[38;2;255;215;0m \x1b[0m\x1b[38;
  #16900 crashed      @senior  11s  2026-10-14 12:29
        ! pid 35352 exited with code 1 Worker's last output: 't-5.5\' model is not supported when \x1b[0m\x1b[38;2;255;215;0m \x1b[0m \x1b[38;2;255;215;0m \x1b[0m\x1b[38;
  #18914 running      @senior  active  2026-10-15 23:17

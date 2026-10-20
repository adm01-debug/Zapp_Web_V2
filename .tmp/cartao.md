Task t_eeac9ac7: [refazer 1] fix(ia): `ai-transcribe-audio` registra consumo no ledger, tem timeouts, confere o tamanho antes de baixar e
  status:    running
  assignee:  semisenior
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_eeac9ac7
  max-retries: 2 (default)
  created:   2026-10-14 10:32 by user
  started:   2026-10-15 01:30

Body:
REFAZER (rodada 1 de 2). A entrega anterior deste trabalho foi RECUSADA e nada entrou.

MOTIVO DA RECUSA: O código cobre ledger, timeouts, tamanho antes de baixar e 500 sem `error.message`, mas o item 4 do cartão exige mensagens em português e o diff não cumpre: as respostas novas e o 500 saem em inglês.

O QUE CORRIGIR: 1. Mensagens em português (item 4 do cartão): troque as respostas que o diff cria ou toca para pt-BR, ex. 'Tempo esgotado ao baixar o áudio' (504 do download), 'O provedor de transcrição demorou demais para responder' (504 do STT) e 'Arquivo de áudio grande demais (máximo 25 MB)' (recusa por `info`). O 500 hoje sai como `internalErrorResponse` com 'Internal server error'; devolva uma mensagem fixa em pt-BR (ex. 'Erro interno ao transcrever o áudio'), sem `error.message`, usando o helper compartilhado se ele aceitar texto ou `errorResponse(..., 500, req)` com texto fixo. Ajuste o teste do 500 para checar também que o corpo não vaza o detalhe interno. Observação: o ramo de tamanho por `metadata.size` e o 504 do download não têm teste, porque `downloadAudio` é injetado. Se der para cobrir sem mexer em outros arquivos (ex. extrair a decisão de tamanho para função pura exportada e testá-la), cubra; senão, declare isso no relato.

TRABALHO ANTERIOR (aproveite, não recomece): branch `v2/ai-transcribe-audio-ledger-timeouts-261014085875a6` (commit 003ed16ca) no repositório; no workspace novo, traga os commits com `git cherry-pick` e corrija só o que foi apontado.

PEDIDO ORIGINAL:
ESPECIALISTA DA ÁREA: edgar (Edge Functions). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: edgar`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: segunda passada da auditoria de paridade V3 -> V2 do doc `docs/estado/11-features-inbox-components-raiz-m-z.md` (inbox/components raiz M-Z). Plano e relatórios: `docs/plans/PLANO_PARIDADE_V3_DOC_11_SEGUNDA_PASSADA_2026-10-13.md` e `docs/audits/` (enquanto não integrados: `~/hermes-workspaces/.assets/paridade-11/`). A V3 é só REFERÊNCIA (`~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída), exportar/importar/edição em massa de contatos, ciclo de vida de negócios, SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da cópia viva da V2 em 13/10/2026; o BANCO REAL não foi consultado: confira no banco LOCAL o que o cartão mandar. A cópia lida não tem cartões `done` ainda não integrados: antes de editar, procure cartões irmãos em `~/hermes-workspaces/.v2-fila/*.json` e no quadro e, se algo já estiver feito, prove no relato em vez de refazer.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/supervisor/admin/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem; efeitos sutis respeitando reduzir movimento; cores só as do sistema.

PROBLEMA (evidência conferida)
LEIA O ITEM INTEIRO no relatório `~/hermes-workspaces/.assets/paridade-11/achados_2_ia_voz.md` (evidência arquivo:linha, o que implementar, critério de pronto e o que o Claude conferiu): item G4. Coordene com o cartão PK-01 (mesma Edge): se ele ainda estiver aberto, parta da versão dele.

O QUE FAZER
1. Registrar uma linha por chamada em `ai_usage_logs` com `logAiUsageDetached` (função `ai-transcribe-audio`, unidade segundo, `usage_unknown` quando preciso) e tirar a função de `PENDENTES_DECLARADAS` em `_shared/__tests__/consumo-pago-no-ledger.test.ts`.
2. `AbortSignal.timeout`: download 20 s e STT 60 s, respondendo 504 claro.
3. Conferir `metadata.size` do objeto ANTES de baixar (teto 25 MB).
4. 500 sem `error.message` interno; mensagens em português.

ARQUIVOS QUE PODE TOCAR
- supabase/functions/ai-transcribe-audio/index.ts
- supabase/functions/ai-transcribe-audio/index.test.ts
- supabase/functions/_shared/__tests__/consumo-pago-no-ledger.test.ts

CRITÉRIO DE PRONTO
1. Teste prova a linha no ledger por chamada e 504 com fetch pendurado.
2. Guarda de consumo verde.
3. `zapp-verify . --rapido` verde.

Feche com hermes-tarefa-fechar "<tipo>(<escopo>): <título>" .tmp/relato.md, dizendo no relato como resolveu cada ponto da recusa.

Latest summary:
Refazer pronto (commit 5dd127bb09, 18 testes verdes) mas hermes-tarefa-fechar está CONGELADO no modo V2; trabalho estacionado no workspace, relato em comentário. Falta integração na branch do dia (integrador/Joaquim).

Comments (5):
  [2026-10-14 10:34] default: [jev-entrada] rota=complexo (conf 0.43 → humano, p_humano=0.02), faixa=edge, injeção=0.32, ação externa=0.08 → RETIDO (Jev inseguro)
  [2026-10-14 10:38] default: [revisor-entrada] [jev-entrada] claude liberou → semisenior: Refazer é só corrigir mensagens para pt-BR, ajustar o teste do 500 e cobrir a decisão de tamanho na Edge Function ai-transcribe-audio e seus testes, tudo dentro do repositório local e nos três arquivos permitidos, sem tocar no ferramental da fábrica. Envolve ledger de consumo e tratamento de erro em função de IA, por isso perfil complexo.
  [2026-10-14 11:00] default: Coordenação (14/10): o revisor aprovou ledger, timeouts, tamanho antes de baixar e 500 sem error.message; a recusa foi só das MENSAGENS EM PORTUGUÊS (item 4 do cartão): 504 do download, 504 do STT, 413 por metadata.size e o 500 fixo ('Erro interno ao transcrever o áudio'), sem error.message. O DK-01 (t_26f07b15, APROVADO) mexeu no mesmo arquivo: parta da versão dele e preserve USER_PER_MINUTE/SERVICE_PER_MINUTE. Primeira linha do relato: 'Especialista: senior'.
  [2026-10-15 01:57] semisenior: Refazer pronto e commitado no workspace (fechar congelado no modo V2 — ver abaixo).

Especialista: edgar
Commit: 5dd127bb09 `feat(edge): refazer G4 ai-transcribe-audio com erros do cliente em pt-BR` (branch `v2/ai-transcribe-audio-ledger-timeouts-261014085875a6`, 2 arquivos, sem dívida nova de lint).
Base: `dia/2026-10-14` (DK-01) + porte G4; `USER_PER_MINUTE`/`SERVICE_PER_MINUTE` e caminho de serviço intactos.

Ponto 1 — 504 STT: `O provedor de transcrição demorou demais para responder` (teste 504 pt-BR).
Ponto 2 — 500: `Erro interno ao transcrever o áudio`, detalhe só no log (teste 500 sem vazamento; teste do 500 ajustado).
Ponto 3 — tamanho por `metadata.size`: `Arquivo de áudio grande demais (máximo 25 MB)` com 413 antes de baixar; `decideAudioSizeRefusal` exportada e testada; status de erro do download agora propaga (antes sempre 400).
Ponto 4 — 504 download: `Tempo esgotado ao baixar o áudio`.
Divergência documentada: `errorResponse` mascara corpo em 5xx (`Internal server error`), então os 5xx com corpo próprio saem por `jsonResponse` (convenção do ai-proxy).

Prova: deno `index.test.ts` 18 passed | 0 failed (vermelho com EN: 2 failed, restaurado→verde); `consumo-pago-no-ledger` 4 passed; contrato `ai-endpoints-auth` 16 passed.

Estado: `hermes-tarefa-fechar` recusou (CONGELADO modo V2 — sem push/PR/integração por tarefa). Trabalho estacionado no workspace; decisão registrada: `20261015-015747-5008-ai-transcribe-audio-ledger-timeouts`. Falta: integração na branch do dia (integrador/Joaquim).
  [2026-10-15 14:15] default: UNBLOCK: guarda restaurada (MODO_V2 voltou): retomar a abertura/fechamento do cartao

Events (54):
  [2026-10-15 01:57] [run 18244] heartbeat
  [2026-10-15 01:57] commented {'author': 'semisenior', 'len': 1522}
  [2026-10-15 01:57] [run 18244] blocked {'reason': 'Refazer pronto (commit 5dd127bb09, 18 testes verdes) mas hermes-tarefa-fechar está CONGELADO no modo V2; trabalho estacionado no workspace, relato em comentário. Falta integração na branch do dia (integrador/Joaquim).', 'kind': 'needs_input', 'recurrences': 1, 'source_status': 'ready'}
  [2026-10-15 14:15] commented {'author': 'default', 'len': 84}
  [2026-10-15 14:15] unblocked
  [2026-10-15 20:18] reprioritized {'priority': 9}
  [2026-10-15 20:18] [run 18699] claimed {'lock': 'Joaquim:38172', 'expires': 1792107206, 'run_id': 18699}
  [2026-10-15 20:18] [run 18699] spawned {'pid': 31180, 'started_at': '|179210630613'}
  [2026-10-15 20:18] [run 18699] heartbeat
  [2026-10-15 20:19] [run 18699] heartbeat
  [2026-10-15 20:20] [run 18699] heartbeat
  [2026-10-15 20:21] [run 18699] heartbeat
  [2026-10-15 20:22] [run 18699] heartbeat
  [2026-10-15 20:23] [run 18699] heartbeat
  [2026-10-15 20:24] [run 18699] heartbeat
  [2026-10-15 20:25] [run 18699] heartbeat
  [2026-10-15 20:26] [run 18699] heartbeat
  [2026-10-15 20:27] [run 18699] heartbeat
  [2026-10-15 20:28] [run 18699] heartbeat
  [2026-10-15 20:29] [run 18699] heartbeat

Runs (2):
  #18244 blocked      @semisenior  1642s  2026-10-15 01:30
        → Refazer pronto (commit 5dd127bb09, 18 testes verdes) mas hermes-tarefa-fechar está CONGELADO no modo V2; trabalho estacionado no workspace, relato em comentário
  #18699 running      @semisenior  active  2026-10-15 20:18

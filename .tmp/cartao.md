Task t_1a6ea143: fix(chat): a retentativa do áudio gravado reaproveita o upload e o mesmo identificador de mensagem
  status:    running
  assignee:  hugo
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_1a6ea143
  max-retries: 2 (default)
  created:   2026-10-13 08:19 by claude
  started:   2026-10-13 16:38

Body:
ESPECIALISTA DA ÁREA: hugo (hooks, estado e dados no front). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: hugo`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: segunda passada da auditoria de paridade V3 -> V2 do doc `docs/estado/06-features-inbox-hooks.md` (inbox: serviços, hooks e utils). Plano e relatórios: `~/arquitetura-v2/paridade-06/achados_*.md` (cópia para agentes em `~/hermes-workspaces/.assets/paridade-06/`). A V3 é só REFERÊNCIA (`~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída), exportar/importar/edição em massa de contatos, ciclo de vida de negócios, SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da cópia viva da V2 em 13/10/2026 (leitores + conferência do Claude em migrations e código); o BANCO REAL não foi consultado: confira no banco LOCAL o que o cartão mandar. A cópia lida não tem cartões `done` ainda não integrados: antes de editar, procure cartões irmãos em `~/hermes-workspaces/.v2-fila/*.json` e no quadro e, se algo já estiver feito, prove no relato em vez de refazer.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/supervisor/admin/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem; efeitos sutis respeitando reduzir movimento; cores só as do sistema.

PROBLEMA (evidência conferida)
O áudio gravado sobe um arquivo novo e cria um `client_message_id` novo a cada retentativa; se a resposta se perde, a nota de voz pode duplicar no WhatsApp do cliente. O `FileUploader` já evita isso com `pendingUploadsRef`; o áudio não. PD-94 cobre só nome/tipo do arquivo.

O QUE FAZER
1. Guarde, por gravação, o caminho do upload já feito e o `client_message_id`; a retentativa reusa ambos (idempotência do servidor deduplica).
2. Descarte o estado quando a mensagem é aceita ou o usuário cancela.
3. Testes: falha na resposta e retentativa não cria novo upload nem novo id; cancelamento limpa.

ARQUIVOS QUE PODE TOCAR
- src/hooks/chat/ (envio de áudio)
- testes

CRITÉRIO DE PRONTO
1. Retentativa não duplica nota de voz.
2. Teste prova mesmo id e um só upload.
3. `zapp-verify . --rapido` verde.


Latest summary:
Guard V2 fora do ar: o marcador ~/.local/libexec/hermes-guard/MODO_V2 sumiu (dir tocado 14/10 10:45). `hermes-tarefa-iniciar` e `hermes-tarefa-fechar` saem exit 75 CONGELADO; sem workspace não dá para começar o cartão. Fábrica inteira parada (último workspace 10:39). Não recriei o marcador (ação de guarda proibida). Decisão registrada: 20261014-112121-64ba-sem-tarefa (detalhes em ~/hermes-workspaces/.tmp/decisao-t_1a6ea143.md); já há duplicatas desde 11:13 (20261014-111329-2607). Precisa do Joaquim restaurar o MODO_V2 ou confirmar congelamento intencional.

Comments (3):
  [2026-10-14 11:21] hugo: **BLOQUEIO DE INFRA (14/10 ~11:20) — nada feito no cartão, nada alterado fora dele.**

`hermes-tarefa-iniciar Zapp_Web_V2 audio-retentativa-idempotente` sai com **exit 75 / CONGELADO** ("o modo V1 está suspenso… estacione e pare"). Sem workspace não há como editar, testar nem rodar `hermes-tarefa-fechar` (mesmo guard).

**Causa apurada (somente leitura):**
- O guard exige o marcador `~/.local/libexec/hermes-guard/MODO_V2` (checado em `hermes-tarefa-iniciar` linhas 5‑10 e no `hermes-tarefa-fechar`).
- Esse arquivo **não existe mais**: `ls ~/.local/libexec/hermes-guard/ | grep -i modo` → vazio; só resta `CONGELADO` (04/10). Diretório do guard tocado em **14/10 10:45:15**.
- Último workspace criado em `.por-cartao/` é de **10:39** (t_4128d906) → a fábrica inteira parou, não só este cartão.
- Este cartão não tem workspace em `~/hermes-workspaces/Zapp_Web_V2` nem índice `.por-cartao/t_1a6ea143`.

**Não contornei:** não recriei o MODO_V2 (escrita em `~/.local/` é ação de guarda proibida; recriar o marcador desligaria a proteção).

**Registrado:** decisão `20261014-112121-64ba-sem-tarefa` (detalhes em `~/hermes-workspaces/.tmp/decisao-t_1a6ea143.md`). Já há decisões idênticas de outros agentes desde 11:13 (a mais antiga `20261014-111329-2607`).

**Pedido:** restaurar `MODO_V2` (ou confirmar congelamento intencional). Assim que voltar, abro `v2/audio-retentativa-idempotente-<id>` e sigo o fluxo normal.
  [2026-10-15 14:14] default: UNBLOCK: guarda restaurada (MODO_V2 voltou): retomar a abertura/fechamento do cartao
  [2026-10-15 16:32] hugo: Fora da minha área (componentes/Íris), registrado para não se perder:

- `src/components/inbox/AudioRecorder.tsx` / `ChatPanel.tsx`: o cancelamento da gravação (swipe/lixeira) deveria chamar `discardPendingAudioSend()`, que este cartão expõe no retorno de `useRealtimeInbox` — enquanto isso, o estado de retentativa só é limpo por envio aceito, gravação nova ou troca de conversa.
- Limpeza de objeto órfão no bucket: quando uma gravação falha e é abandonada, o arquivo já subido fica sem referência (tema de outro cartão).

Events (198):
  [2026-10-15 16:26] [run 18580] heartbeat
  [2026-10-15 16:27] [run 18580] heartbeat
  [2026-10-15 16:28] [run 18580] heartbeat
  [2026-10-15 16:29] [run 18580] heartbeat
  [2026-10-15 16:30] [run 18580] heartbeat
  [2026-10-15 16:31] [run 18580] heartbeat
  [2026-10-15 16:32] [run 18580] heartbeat
  [2026-10-15 16:32] commented {'author': 'hugo', 'len': 523}
  [2026-10-15 16:34] [run 18580] heartbeat
  [2026-10-15 16:35] [run 18580] heartbeat
  [2026-10-15 16:36] [run 18580] heartbeat
  [2026-10-15 16:37] [run 18580] heartbeat
  [2026-10-15 16:38] [run 18580] heartbeat
  [2026-10-15 16:39] [run 18580] heartbeat
  [2026-10-15 16:40] [run 18580] heartbeat
  [2026-10-15 16:41] [run 18580] heartbeat
  [2026-10-15 16:42] [run 18580] heartbeat
  [2026-10-15 16:43] [run 18580] heartbeat
  [2026-10-15 16:44] [run 18580] heartbeat
  [2026-10-15 16:45] [run 18580] heartbeat

Runs (20):
  #12803 rate_limited @hugo  34s  2026-10-13 16:38
        ! pid 44624 exited rate-limited (quota wall) — requeued without counting a failure
  #13007 rate_limited @hugo  34s  2026-10-13 16:45
        ! pid 41676 exited rate-limited (quota wall) — requeued without counting a failure
  #13181 rate_limited @hugo  35s  2026-10-13 16:51
        ! pid 19040 exited rate-limited (quota wall) — requeued without counting a failure
  #13362 rate_limited @hugo  23s  2026-10-13 16:57
        ! pid 34872 exited rate-limited (quota wall) — requeued without counting a failure
  #13543 rate_limited @hugo  39s  2026-10-13 17:03
        ! pid 16504 exited rate-limited (quota wall) — requeued without counting a failure
  #13720 rate_limited @hugo  37s  2026-10-13 17:10
        ! pid 25244 exited rate-limited (quota wall) — requeued without counting a failure
  #13908 rate_limited @hugo  37s  2026-10-13 17:16
        ! pid 30704 exited rate-limited (quota wall) — requeued without counting a failure
  #14075 rate_limited @hugo  34s  2026-10-13 17:21
        ! pid 44064 exited rate-limited (quota wall) — requeued without counting a failure
  #14300 rate_limited @hugo  34s  2026-10-13 17:29
        ! pid 27788 exited rate-limited (quota wall) — requeued without counting a failure
  #14475 rate_limited @hugo  25s  2026-10-13 17:35
        ! pid 30076 exited rate-limited (quota wall) — requeued without counting a failure
  #14653 rate_limited @hugo  34s  2026-10-13 17:41
        ! pid 44096 exited rate-limited (quota wall) — requeued without counting a failure
  #14850 rate_limited @hugo  33s  2026-10-13 17:47
        ! pid 36296 exited rate-limited (quota wall) — requeued without counting a failure
  #15033 rate_limited @hugo  34s  2026-10-13 17:53
        ! pid 39856 exited rate-limited (quota wall) — requeued without counting a failure
  #15203 rate_limited @hugo  23s  2026-10-13 17:59
        ! pid 33128 exited rate-limited (quota wall) — requeued without counting a failure
  #15376 rate_limited @hugo  71s  2026-10-13 18:05
        ! pid 36964 exited rate-limited (quota wall) — requeued without counting a failure
  #15555 rate_limited @hugo  44s  2026-10-13 18:11
        ! pid 10984 exited rate-limited (quota wall) — requeued without counting a failure
  #15753 rate_limited @hugo  24s  2026-10-13 18:18
        ! pid 42724 exited rate-limited (quota wall) — requeued without counting a failure
  #15931 rate_limited @hugo  34s  2026-10-13 18:23
        ! pid 38488 exited rate-limited (quota wall) — requeued without counting a failure
  #16576 blocked      @hugo  221s  2026-10-14 11:17
        → Guard V2 fora do ar: o marcador ~/.local/libexec/hermes-guard/MODO_V2 sumiu (dir tocado 14/10 10:45). `hermes-tarefa-iniciar` e `hermes-tarefa-fechar` saem exit
  #18580 running      @hugo  active  2026-10-15 16:18

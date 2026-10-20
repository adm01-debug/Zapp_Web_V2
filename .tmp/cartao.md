Task t_a8b2a47f: fix(chat): áudios da conversa tocam um por vez e guardam posição e velocidade ao sair da tela
  status:    running
  assignee:  hugo
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_a8b2a47f
  max-retries: 2 (default)
  created:   2026-10-13 07:51 by claude
  started:   2026-10-13 16:33
  children:  t_a3cf8912

Body:
ESPECIALISTA DA ÁREA: hugo (hooks, estado e dados no front). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: hugo`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: segunda passada da auditoria de paridade V3 -> V2 do doc docs/estado/06-features-inbox-hooks.md (hooks do inbox) (plano em `docs/plans/PLANO_PARIDADE_V3_HOOKS_INBOX_PASSADA2_2026-10-13.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-docs/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 13/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

PROBLEMA (evidência conferida)
CONFIRMADO em 13/10: `useExclusiveAudio` só é usado em `tabs/AudioPlayButton.tsx` (aba Arquivos); `useAudioPlayer.ts` não o usa, e `ChatMessagesArea.tsx:~144-149` virtualiza com `overscan: 10`: rolar um áudio em reprodução para fora da janela desmonta o `<audio>` (para o som) e, ao voltar, começa do zero com a velocidade em 1x (`useAudioPlayer.ts:~72` guarda a velocidade só em `useState`). Na V3 isto também não funcionava de fato: o que se pede é o EFEITO, não a cópia do módulo.

O QUE FAZER
1. `useAudioPlayer` registra o elemento em `useExclusiveAudio`: tocar um áudio do chat (ou da aba Arquivos) pausa o outro.
2. Store em módulo `src/lib/audioPlayerState.ts` (chave = `messageId`; `currentTime`, `playbackRate`, `paused`; TTL 30 min; GC acima de 200 entradas), lido ao montar e escrito em `timeupdate`/`ratechange`/desmontagem; desmontar tocando pausa sem perder o ponto (sem som fantasma).
3. Reaplique `playbackRate` depois de `audio.load()` ao reassinar a URL e escute `play`/`pause` para o botão acompanhar pausa externa.
4. Testes: dois players (play no B pausa o A); desmontar e remontar o mesmo `messageId` restaura posição e velocidade; entradas expiram.

ARQUIVOS QUE PODE TOCAR
- src/hooks/communication/useAudioPlayer.ts
- src/hooks/chat/useExclusiveAudio.ts
- src/lib/audioPlayerState.ts (novo)
- src/hooks/communication/__tests__/
- src/lib/__tests__/audioPlayerState.test.ts (novo)

CRITÉRIO DE PRONTO
1. Os testes acima passam; o botão acompanha pausa externa.
2. `zapp-verify . --rapido` verde.


Events (420):
  [2026-10-14 08:09] [run 16407] heartbeat
  [2026-10-14 08:10] [run 16407] heartbeat
  [2026-10-14 08:11] [run 16407] heartbeat
  [2026-10-14 08:12] [run 16407] heartbeat
  [2026-10-14 08:13] [run 16407] heartbeat
  [2026-10-14 08:14] [run 16407] heartbeat
  [2026-10-14 08:15] [run 16407] heartbeat
  [2026-10-14 08:16] [run 16407] heartbeat
  [2026-10-14 08:17] [run 16407] heartbeat
  [2026-10-14 08:18] [run 16407] heartbeat
  [2026-10-14 08:19] [run 16407] heartbeat
  [2026-10-14 08:21] [run 16407] heartbeat
  [2026-10-14 08:22] [run 16407] heartbeat
  [2026-10-14 08:23] [run 16407] heartbeat
  [2026-10-14 08:24] [run 16407] heartbeat
  [2026-10-14 08:25] [run 16407] heartbeat
  [2026-10-14 08:26] [run 16407] heartbeat
  [2026-10-14 08:27] [run 16407] heartbeat
  [2026-10-14 08:28] [run 16407] heartbeat
  [2026-10-14 08:29] [run 16407] heartbeat

Runs (22):
  #12674 rate_limited @hugo  33s  2026-10-13 16:33
        ! pid 28396 exited rate-limited (quota wall) — requeued without counting a failure
  #12815 rate_limited @hugo  35s  2026-10-13 16:38
        ! pid 41136 exited rate-limited (quota wall) — requeued without counting a failure
  #12972 rate_limited @hugo  36s  2026-10-13 16:44
        ! pid 30548 exited rate-limited (quota wall) — requeued without counting a failure
  #13135 rate_limited @hugo  24s  2026-10-13 16:50
        ! pid 24948 exited rate-limited (quota wall) — requeued without counting a failure
  #13311 rate_limited @hugo  23s  2026-10-13 16:55
        ! pid 44284 exited rate-limited (quota wall) — requeued without counting a failure
  #13477 rate_limited @hugo  36s  2026-10-13 17:01
        ! pid 43624 exited rate-limited (quota wall) — requeued without counting a failure
  #13634 rate_limited @hugo  35s  2026-10-13 17:07
        ! pid 42996 exited rate-limited (quota wall) — requeued without counting a failure
  #13815 rate_limited @hugo  34s  2026-10-13 17:13
        ! pid 25204 exited rate-limited (quota wall) — requeued without counting a failure
  #13995 rate_limited @hugo  34s  2026-10-13 17:19
        ! pid 23896 exited rate-limited (quota wall) — requeued without counting a failure
  #14162 rate_limited @hugo  34s  2026-10-13 17:24
        ! pid 42788 exited rate-limited (quota wall) — requeued without counting a failure
  #14333 rate_limited @hugo  36s  2026-10-13 17:30
        ! pid 43512 exited rate-limited (quota wall) — requeued without counting a failure
  #14505 rate_limited @hugo  36s  2026-10-13 17:36
        ! pid 31692 exited rate-limited (quota wall) — requeued without counting a failure
  #14674 rate_limited @hugo  35s  2026-10-13 17:41
        ! pid 38128 exited rate-limited (quota wall) — requeued without counting a failure
  #14843 rate_limited @hugo  22s  2026-10-13 17:47
        ! pid 45052 exited rate-limited (quota wall) — requeued without counting a failure
  #15022 rate_limited @hugo  22s  2026-10-13 17:52
        ! pid 41192 exited rate-limited (quota wall) — requeued without counting a failure
  #15186 rate_limited @hugo  34s  2026-10-13 17:58
        ! pid 17384 exited rate-limited (quota wall) — requeued without counting a failure
  #15358 rate_limited @hugo  37s  2026-10-13 18:04
        ! pid 42652 exited rate-limited (quota wall) — requeued without counting a failure
  #15510 rate_limited @hugo  26s  2026-10-13 18:10
        ! pid 33924 exited rate-limited (quota wall) — requeued without counting a failure
  #15684 rate_limited @hugo  23s  2026-10-13 18:15
        ! pid 25396 exited rate-limited (quota wall) — requeued without counting a failure
  #15863 rate_limited @hugo  34s  2026-10-13 18:21
        ! pid 40980 exited rate-limited (quota wall) — requeued without counting a failure
  #16039 rate_limited @hugo  35s  2026-10-13 18:27
        ! pid 37920 exited rate-limited (quota wall) — requeued without counting a failure
  #16407 running      @hugo  active  2026-10-14 07:51

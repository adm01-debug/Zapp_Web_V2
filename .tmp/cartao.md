Task t_6c5eb46e: fix(voz): áudio do Voice Changer não vai mais para o bucket PÚBLICO `audio-memes` (usa o caminho privado do áudio gravado)
  status:    running
  assignee:  iris
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_6c5eb46e
  max-retries: 2 (default)
  created:   2026-10-13 09:05 by claude
  started:   2026-10-14 12:10

Body:
ESPECIALISTA DA ÁREA: iris (telas e componentes). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: iris`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: segunda passada da auditoria de paridade V3 -> V2 do doc `docs/estado/11-features-inbox-components-raiz-m-z.md` (inbox/components raiz M-Z). Plano e relatórios: `docs/plans/PLANO_PARIDADE_V3_DOC_11_SEGUNDA_PASSADA_2026-10-13.md` e `docs/audits/` (enquanto não integrados: `~/hermes-workspaces/.assets/paridade-11/`). A V3 é só REFERÊNCIA (`~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída), exportar/importar/edição em massa de contatos, ciclo de vida de negócios, SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da cópia viva da V2 em 13/10/2026; o BANCO REAL não foi consultado: confira no banco LOCAL o que o cartão mandar. A cópia lida não tem cartões `done` ainda não integrados: antes de editar, procure cartões irmãos em `~/hermes-workspaces/.v2-fila/*.json` e no quadro e, se algo já estiver feito, prove no relato em vez de refazer.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/supervisor/admin/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem; efeitos sutis respeitando reduzir movimento; cores só as do sistema.

PROBLEMA (evidência conferida)
LEIA O ITEM INTEIRO no relatório `~/hermes-workspaces/.assets/paridade-11/achados_2_ia_voz.md` (evidência arquivo:linha, o que implementar, critério de pronto e o que o Claude conferiu): item G2. CONFERIDO PELO CLAUDE: `VoiceChangerPicker.tsx:207-213` sobe para `audio-memes/voice-changer/<ts>.mp3` e usa `getPublicUrl` (URL pública permanente com áudio de conversa de cliente). As policies de INSERT do bucket só deixam admin/supervisor ou pasta do próprio usuário. O banco real NÃO foi consultado: a prova é no banco LOCAL.

O QUE FAZER
1. O Voice Changer entrega o Blob ao mesmo caminho do áudio gravado do chat (bucket privado `audio-messages`, pasta por contato/usuário, URL assinada na leitura); `audio-memes` fica só para memes.
2. No chat interno, mesmo caminho do áudio do chat interno.
3. Se a falha de envio ocorrer, a prévia é mantida e há mensagem pt-BR com tentar de novo.
4. Teste do picker; prova no banco local com papel `authenticated` NÃO admin: upload ok no caminho novo e negado no antigo.

ARQUIVOS QUE PODE TOCAR
- src/components/inbox/VoiceChangerPicker.tsx
- src/components/inbox/VoiceChanger.tsx (se usar o mesmo caminho)
- hooks de upload de áudio (somente reutilizar)
- testes

CRITÉRIO DE PRONTO
1. Nenhuma chamada `getPublicUrl('audio-memes','voice-changer/…')` no `src`.
2. Atendente comum envia áudio transformado.
3. `zapp-verify . --rapido` verde.


Latest summary:
Guardas congeladas: falta o marcador MODO_V2 em ~/.local/libexec/hermes-guard, então `hermes-tarefa-iniciar` recusa com "CONGELADO" e não cria workspace (nenhum workspace novo desde 10:39; dir da guarda alterado 10:45). Sem workspace não dá para trabalhar sem contornar a guarda (proibido). Decisão registrada: 20261014-121423-0cf1-sem-tarefa — o Joaquim precisa restaurar o MODO_V2/destravar para eu retomar o t_6c5eb46e.

Comments (3):
  [2026-10-14 12:14] iris: Bloqueio de ambiente (não é do cartão). O `hermes-tarefa-iniciar Zapp_Web_V2 ...` recusa com:

```
CONGELADO: o modo V1 (push/PR/merge/migration/deploy por tarefa) está suspenso pela Arquitetura V2.
```

Causa medida: o marcador `~/.local/libexec/hermes-guard/MODO_V2` NÃO existe e o `CONGELADO` existe (04/10). Sem o MODO_V2 a guarda de entrada congela todo agente. Prova:
- `stat ~/.local/libexec/hermes-guard/MODO_V2` → No such file or directory
- dir da guarda alterado hoje 10:45; último workspace de cartão criado 10:39 (`INICIO=` mais recente). Nenhum workspace nasce desde então.
- não existe comando alternativo de início no `~/.local/bin`.

Sem workspace não há onde editar com segurança (o `~/projetos/Zapp_Web_V2` é somente leitura e cirandar a guarda é proibido). Não criei pasta de trabalho nem toquei na guarda.

Decisão registrada para o Joaquim: `20261014-121423-0cf1-sem-tarefa` (como destravar; restaurar o MODO_V2). Deixei o cartão parado para não gastar tentativa.
  [2026-10-15 14:15] default: UNBLOCK: guarda restaurada (MODO_V2 voltou): retomar a abertura/fechamento do cartao
  [2026-10-15 23:09] iris: Fora da minha área — registro, não corrijo. Com o áudio do Voice Changer passando pelo caminho do áudio gravado do inbox, o Blob (mp3, `audio/mpeg`) chega a `src/services/chat.service.ts:111 uploadAudio`, que grava sempre `<contato>/<ts>.webm` com `contentType: 'audio/webm'` (a gravação do microfone é webm, e por isso o hardcode). O mp3 fica rotulado como webm no bucket privado do inbox; no chat interno o caminho equivalente (`useTeamChatPanel.resolveAudioUploadFormat`) resolve mp3 corretamente. Se o rótulo errado atrapalhar a reprodução/entrega no inbox, a correção é derivar extensão/contentType do Blob em `chat.service.ts` (e no `useAudioRecorder.uploadAudio`, mesmo hardcode) — área de worker (hooks/services), com `src/services/__tests__/chat.service.test.ts`.

Events (83):
  [2026-10-15 23:15] [run 18896] heartbeat
  [2026-10-15 23:16] [run 18896] heartbeat
  [2026-10-15 23:17] [run 18896] heartbeat
  [2026-10-15 23:18] [run 18896] heartbeat
  [2026-10-15 23:19] [run 18896] heartbeat
  [2026-10-15 23:20] [run 18896] heartbeat
  [2026-10-15 23:21] [run 18896] heartbeat
  [2026-10-15 23:22] [run 18896] heartbeat
  [2026-10-15 23:23] [run 18896] heartbeat
  [2026-10-15 23:24] [run 18896] heartbeat
  [2026-10-15 23:25] [run 18896] heartbeat
  [2026-10-15 23:26] [run 18896] heartbeat
  [2026-10-15 23:27] [run 18896] heartbeat
  [2026-10-15 23:28] [run 18896] heartbeat
  [2026-10-15 23:29] [run 18896] heartbeat
  [2026-10-15 23:30] [run 18896] heartbeat
  [2026-10-15 23:31] [run 18896] heartbeat
  [2026-10-15 23:32] [run 18896] heartbeat
  [2026-10-15 23:33] [run 18896] heartbeat
  [2026-10-15 23:34] [run 18896] heartbeat

Runs (3):
  #16816 blocked      @iris  228s  2026-10-14 12:10
        → Guardas congeladas: falta o marcador MODO_V2 em ~/.local/libexec/hermes-guard, então `hermes-tarefa-iniciar` recusa com "CONGELADO" e não cria workspace (nenhum
  #18809 rate_limited @iris  43s  2026-10-15 22:39
        ! pid 45580 exited rate-limited (quota wall) — requeued without counting a failure
  #18896 running      @iris  active  2026-10-15 22:45

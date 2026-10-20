Task t_f2ee7a9a: feat(chat): gravador de áudio com pausa, recuperação, desfazer descarte e reenvio
  status:    running
  assignee:  iris
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_f2ee7a9a
  max-retries: 2 (default)
  created:   2026-10-12 11:16 by claude
  started:   2026-10-13 06:00
  parents:   t_65b3779c

Body:
ESPECIALISTA DA ÁREA: iris (telas e componentes). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: iris`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs docs/estado 10 a 12 e 17 a 40 (inbox components, team-chat, security/queues, layout/talkx, email/voice, shared, hooks, integrations, services, lib, backend, infra, testes) (plano em `docs/plans/PLANO_PARIDADE_V3_DOCS_10_A_40_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-resto/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

DEPENDÊNCIA: este cartão parte do trabalho dos cartões pai, que podem estar done mas NÃO integrados. Se o que eles fazem não estiver no seu workspace, ache o commit em `~/hermes-workspaces/.v2-fila/*.json` (campo `cartao` = id do pai) e traga a FAIXA inteira: `git cherry-pick --empty=drop $(git rev-list --reverse --no-merges <base_dia do JSON do pai>..<sha do pai>)`; se `git merge-base --is-ancestor <sha> HEAD` já for verdade, não traga. Só bloqueie se houver conflito que você não resolva, dizendo o arquivo.

PROBLEMA (evidência conferida)
A V3 (`useAudioRecorderUI.ts:79-163,188-236`) tem pausar/retomar (barra de espaço), recuperar gravação após recarregar (`restoreRecording`), 'Desfazer descarte' por alguns segundos e reenvio automático com recuo exponencial (3 tentativas); a V2 (`AudioRecorder.tsx`) não tem nenhum; a waveform usa alturas fixas (decorativa). A V2 já mantém o gravador aberto se o envio falhar (R2-INB-022). Os limites de duração/tamanho são o PE-24 (leia: não duplique). AU1 cobre só o som.

O QUE FAZER
1. Pausar/retomar com teclado e `aria-live`, nível real do microfone (AnalyserNode) na waveform, recuperação da gravação pendente (IndexedDB com expiração, por usuário: veja PD-63), desfazer descarte (5 s) e reenvio com recuo; testes e captura.

ARQUIVOS QUE PODE TOCAR
- src/components/inbox/AudioRecorder.tsx
- src/hooks/communication/useAudioRecorder.ts (somente o necessário)
- testes

CRITÉRIO DE PRONTO
1. Gravação nunca se perde por engano.
2. Waveform real.
3. `zapp-verify . --rapido` verde.


Events (25):
  [2026-10-13 06:00] [run 12155] heartbeat
  [2026-10-13 06:01] [run 12155] heartbeat
  [2026-10-13 06:02] [run 12155] heartbeat
  [2026-10-13 06:03] [run 12155] heartbeat
  [2026-10-13 06:04] [run 12155] heartbeat
  [2026-10-13 06:05] [run 12155] heartbeat
  [2026-10-13 06:07] [run 12155] heartbeat
  [2026-10-13 06:08] [run 12155] heartbeat
  [2026-10-13 06:09] [run 12155] heartbeat
  [2026-10-13 06:10] [run 12155] heartbeat
  [2026-10-13 06:11] [run 12155] heartbeat
  [2026-10-13 06:12] [run 12155] heartbeat
  [2026-10-13 06:13] [run 12155] heartbeat
  [2026-10-13 06:14] [run 12155] heartbeat
  [2026-10-13 06:15] [run 12155] heartbeat
  [2026-10-13 06:16] [run 12155] heartbeat
  [2026-10-13 06:17] [run 12155] heartbeat
  [2026-10-13 06:19] [run 12155] heartbeat
  [2026-10-13 06:20] [run 12155] heartbeat
  [2026-10-13 06:21] [run 12155] heartbeat

Runs (1):
  #12155 running      @iris  active  2026-10-13 06:00

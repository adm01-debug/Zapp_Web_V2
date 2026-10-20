Task t_90d387e2: fix(a11y): documento e vídeo do balão abrem pelo teclado; `VideoFullscreen` vira diálogo (Esc, foco, papel)
  status:    running
  assignee:  iris
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_90d387e2
  max-retries: 2 (default)
  created:   2026-10-13 09:06 by claude
  started:   2026-10-14 12:14

Body:
ESPECIALISTA DA ÁREA: iris (telas e componentes). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: iris`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: segunda passada da auditoria de paridade V3 -> V2 do doc `docs/estado/11-features-inbox-components-raiz-m-z.md` (inbox/components raiz M-Z). Plano e relatórios: `docs/plans/PLANO_PARIDADE_V3_DOC_11_SEGUNDA_PASSADA_2026-10-13.md` e `docs/audits/` (enquanto não integrados: `~/hermes-workspaces/.assets/paridade-11/`). A V3 é só REFERÊNCIA (`~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída), exportar/importar/edição em massa de contatos, ciclo de vida de negócios, SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da cópia viva da V2 em 13/10/2026; o BANCO REAL não foi consultado: confira no banco LOCAL o que o cartão mandar. A cópia lida não tem cartões `done` ainda não integrados: antes de editar, procure cartões irmãos em `~/hermes-workspaces/.v2-fila/*.json` e no quadro e, se algo já estiver feito, prove no relato em vez de refazer.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/supervisor/admin/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem; efeitos sutis respeitando reduzir movimento; cores só as do sistema.

PROBLEMA (evidência conferida)
LEIA O ITEM INTEIRO no relatório `~/hermes-workspaces/.assets/paridade-11/achados_4_upload_inventario_testes.md` (evidência arquivo:linha, o que implementar, critério de pronto e o que o Claude conferiu): item U2. 

O QUE FAZER
1. `DocumentPreview` e o contêiner do `VideoPreview`: `role="button"`, `tabIndex={0}`, `aria-label`, Enter/Espaço, `focus-visible:ring`.
2. `VideoFullscreen`: `role="dialog" aria-modal="true" aria-label`, foco inicial em Fechar, Esc fecha (com cleanup), devolve o foco ao gatilho, `aria-label` com a velocidade; remover o `onClick` do Baixar desabilitado.
3. Testes de Tab+Enter, Esc e axe do `VideoFullscreen`; movimento reduzido respeitado.

ARQUIVOS QUE PODE TOCAR
- src/components/inbox/MediaPreview.tsx
- src/components/inbox/VideoFullscreen.tsx
- src/components/inbox/__tests__/

CRITÉRIO DE PRONTO
1. Documento e vídeo abrem por teclado.
2. Esc fecha o vídeo e o foco volta.
3. `zapp-verify . --rapido` verde.


Latest summary:
hermes-tarefa-iniciar rc=75 "CONGELADO": o marcador global ~/.local/libexec/hermes-guard/MODO_V2 sumiu (~10:45) e, com CONGELADO presente, nenhum agente cria workspace nem fecha cartão. Sem workspace não há onde editar (a cópia em ~/projetos é somente leitura) e o fechamento também ficaria travado. Não recriei o MODO_V2 (seria contornar a guarda). Decisão registrada: 20261014-122032-08e8-sem-tarefa. Mesmo bloqueio já atingiu t_4128d906 e t_cca276de hoje. Com o marcador de volta, o cartão roda normal do zero (item U2, src/components/inbox/MediaPreview.tsx e VideoFullscreen.tsx + testes).

Comments (2):
  [2026-10-14 12:21] iris: **Bloqueio de ambiente — o cartão não pôde começar.**

`hermes-tarefa-iniciar Zapp_Web_V2 a11y-balao-teclado-videofullscreen-dialogo` respondeu **rc=75**:

```
CONGELADO: o modo V1 (push/PR/merge/migration/deploy por tarefa) está suspenso pela Arquitetura V2.
```

Causa (conferida agora, 12:20 de 14/10): existe `/home/joaquim_ataides/.local/libexec/hermes-guard/CONGELADO` e **não existe** `/home/joaquim_ataides/.local/libexec/hermes-guard/MODO_V2` (o diretório do guard foi mexido às 10:45). Com o CONGELADO presente e o MODO_V2 ausente, `hermes-tarefa-iniciar` e `hermes-tarefa-fechar` recusam para **todos** os agentes — é o interruptor global do modo V2 que sumiu, não falha deste cartão.

Sem workspace não há onde editar (a cópia em `~/projetos/Zapp_Web_V2` é somente leitura para mim) e, mesmo com o código pronto, o `hermes-tarefa-fechar` continuaria travado. Não recriei o MODO_V2: recriar arquivo de guarda para destravar a própria entrega seria contornar bloqueio de guarda (proibido). Mesmo bloqueio já atingiu os cartões t_4128d906 (hugo) e t_cca276de hoje.

Decisão registrada: `20261014-122032-08e8-sem-tarefa`. Com o marcador de volta, este cartão roda normalmente do zero (U2 do relatório `~/hermes-workspaces/.assets/paridade-11/achados_4_upload_inventario_testes.md`, arquivos `src/components/inbox/MediaPreview.tsx`, `src/components/inbox/VideoFullscreen.tsx` e seus testes).
  [2026-10-15 14:15] default: UNBLOCK: guarda restaurada (MODO_V2 voltou): retomar a abertura/fechamento do cartao

Events (110):
  [2026-10-16 01:52] [run 19188] heartbeat
  [2026-10-16 01:53] [run 19188] heartbeat
  [2026-10-16 01:54] [run 19188] heartbeat
  [2026-10-16 01:56] [run 19188] heartbeat
  [2026-10-16 01:57] [run 19188] heartbeat
  [2026-10-16 01:58] [run 19188] heartbeat
  [2026-10-16 01:59] [run 19188] heartbeat
  [2026-10-16 02:00] [run 19188] heartbeat
  [2026-10-16 02:01] [run 19188] heartbeat
  [2026-10-16 02:02] [run 19188] heartbeat
  [2026-10-16 02:03] [run 19188] heartbeat
  [2026-10-16 02:04] [run 19188] heartbeat
  [2026-10-16 02:05] [run 19188] heartbeat
  [2026-10-16 02:06] [run 19188] heartbeat
  [2026-10-16 02:07] [run 19188] heartbeat
  [2026-10-16 02:08] [run 19188] heartbeat
  [2026-10-16 02:09] [run 19188] heartbeat
  [2026-10-16 02:10] [run 19188] heartbeat
  [2026-10-16 02:11] [run 19188] heartbeat
  [2026-10-16 02:12] [run 19188] heartbeat

Runs (7):
  #16832 blocked      @iris  415s  2026-10-14 12:14
        → hermes-tarefa-iniciar rc=75 "CONGELADO": o marcador global ~/.local/libexec/hermes-guard/MODO_V2 sumiu (~10:45) e, com CONGELADO presente, nenhum agente cria wo
  #18817 rate_limited @iris  70s  2026-10-15 22:40
        ! pid 26172 exited rate-limited (quota wall) — requeued without counting a failure
  #18967 rate_limited @iris  340s  2026-10-15 23:51
        ! pid 51408 exited rate-limited (quota wall) — requeued without counting a failure
  #19045 rate_limited @iris  43s  2026-10-16 00:28
        ! pid 14100 exited rate-limited (quota wall) — requeued without counting a failure
  #19108 rate_limited @iris  31s  2026-10-16 01:04
        ! pid 27884 exited rate-limited (quota wall) — requeued without counting a failure
  #19165 rate_limited @iris  74s  2026-10-16 01:34
        ! pid 7188 exited rate-limited (quota wall) — requeued without counting a failure
  #19188 running      @iris  active  2026-10-16 01:41

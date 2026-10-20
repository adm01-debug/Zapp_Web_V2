Task t_d50c6f5f: fix(anexos): progresso do upload visível, falhas não somem sozinhas e agendar com anexo avisa quando o upload falha
  status:    running
  assignee:  iris
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_d50c6f5f
  max-retries: 2 (default)
  created:   2026-10-13 08:19 by claude
  started:   2026-10-13 16:46
  children:  t_b0c6e804

Body:
ESPECIALISTA DA ÁREA: iris (telas e componentes). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: iris`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: segunda passada da auditoria de paridade V3 -> V2 do doc `docs/estado/06-features-inbox-hooks.md` (inbox: serviços, hooks e utils). Plano e relatórios: `~/arquitetura-v2/paridade-06/achados_*.md` (cópia para agentes em `~/hermes-workspaces/.assets/paridade-06/`). A V3 é só REFERÊNCIA (`~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída), exportar/importar/edição em massa de contatos, ciclo de vida de negócios, SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da cópia viva da V2 em 13/10/2026 (leitores + conferência do Claude em migrations e código); o BANCO REAL não foi consultado: confira no banco LOCAL o que o cartão mandar. A cópia lida não tem cartões `done` ainda não integrados: antes de editar, procure cartões irmãos em `~/hermes-workspaces/.v2-fila/*.json` e no quadro e, se algo já estiver feito, prove no relato em vez de refazer.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/supervisor/admin/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem; efeitos sutis respeitando reduzir movimento; cores só as do sistema.

COORDENAÇÃO: PH-23 e PD-94 tocam o mesmo código; verifique o quadro.

PROBLEMA (evidência conferida)
A barra de progresso do `FileUploader` é código morto; o toast some em 30 s e as falhas da fila de arquivos somem em 1 s; a falha de upload ao agendar mensagem com anexo não mostra aviso. PH-23 (hooks06) cobre agendar áudio/imagem/arquivo: leia-o e não duplique.

O QUE FAZER
1. Ligue a barra de progresso ao evento real de progresso do upload (acessível: `role="progressbar"`, valor atual).
2. Falhas ficam na lista até o usuário dispensar ou tentar de novo; o toast de erro fica visível por pelo menos 8 s e tem ação 'Tentar de novo'.
3. No agendamento com anexo, falha de upload mostra erro claro e não cria o agendamento pela metade.
4. Testes de componente.

ARQUIVOS QUE PODE TOCAR
- componentes de upload (FileUploader e agendador)
- testes

CRITÉRIO DE PRONTO
1. Progresso e falhas visíveis.
2. Agendamento não fica pela metade.
3. `zapp-verify . --rapido` verde.


Latest summary:
Marcador MODO_V2 ausente em ~/.local/libexec/hermes-guard/ (só existe CONGELADO) faz hermes-tarefa-iniciar devolver exit 75 (CONGELADO) — nenhum worker abre workspace desde ~10:45 de hoje. Sem workspace não consigo executar o cartão e sem o mesmo guard o hermes-tarefa-fechar também devolve 75. Não recriei o marcador (contornaria a guarda). Restaurar ~/.local/libexec/hermes-guard/MODO_V2 (Joaquim/Claude) e reenviar o cartão. Já há pedidos de decisão duplicados: 20261014-111329-2607 (11:13–11:22).

Comments (3):
  [2026-10-14 11:23] iris: Bloqueio global da fábrica — nenhum worker abre workspace.

Medido agora (14/10/2026 11:23 -03):
- `hermes-tarefa-iniciar Zapp_Web_V2 anexos-progresso-upload-aviso` -> exit 75, "CONGELADO: o modo V1 ... está suspenso pela Arquitetura V2".
- `~/.local/libexec/hermes-guard/`: existe `CONGELADO` (criado 04/10), NÃO existe `MODO_V2`. O diretório teve mtime 14/10 10:45. O script congela quando CONGELADO existe E MODO_V2 não existe (hermes-tarefa-iniciar linhas 5-10 / hermes-tarefa-fechar linhas 5-8).
- Nenhum workspace novo em ~/hermes-workspaces/ depois de ~10:39 de hoje.

Consequência neste cartão: sem workspace, não edito nada; sem o mesmo guard, `hermes-tarefa-fechar` também devolve 75. Não recriei o marcador (seria contornar a guarda). Os runs anteriores deste cartão (exit 75) atribuídos a "quota wall" podem, em parte, ser esta mesma parada.

Já registrado por outros agentes (não duplico): decisão 20261014-111329-2607 e duplicatas 11:13–11:22 ("MODO_V2 sumiu — restaurar ou manter o congelamento?"). Bloqueio com kind=capability até o marcador voltar.
  [2026-10-15 14:14] default: UNBLOCK: guarda restaurada (MODO_V2 voltou): retomar a abertura/fechamento do cartao
  [2026-10-15 17:05] iris: hotspot: src/components/inbox/useFileUploadLogic.ts — o cartão `t_6b6f73ca` (hugo, **rodando agora**) declara o MESMO arquivo em "ARQUIVOS QUE PODE TOCAR" (scanner de upload + avisos com `toastId`/"Tentar novamente"), e o PK-27 acabou de mexer no corpo do upload (stream + `duplex: 'half'`) e nos toasts de falha (`duration: 8000` + ação 'Tentar de novo'). Quem integrar por último deve reconciliar: o aviso do scanner deve reaproveitar o `id: 'file-upload'`/ação já existentes em vez de criar um segundo canal de toast. Também os testes `useFileUploadLogic*.test.tsx`/`FileUploader.*.test.tsx` são o ponto de colisão.

Events (125):
  [2026-10-15 16:48] [run 18583] heartbeat
  [2026-10-15 16:50] [run 18583] heartbeat
  [2026-10-15 16:51] [run 18583] heartbeat
  [2026-10-15 16:52] [run 18583] heartbeat
  [2026-10-15 16:53] [run 18583] heartbeat
  [2026-10-15 16:54] [run 18583] heartbeat
  [2026-10-15 16:55] [run 18583] heartbeat
  [2026-10-15 16:56] [run 18583] heartbeat
  [2026-10-15 16:57] [run 18583] heartbeat
  [2026-10-15 16:58] [run 18583] heartbeat
  [2026-10-15 16:59] [run 18583] heartbeat
  [2026-10-15 17:00] [run 18583] heartbeat
  [2026-10-15 17:01] [run 18583] heartbeat
  [2026-10-15 17:02] [run 18583] heartbeat
  [2026-10-15 17:03] [run 18583] heartbeat
  [2026-10-15 17:04] [run 18583] heartbeat
  [2026-10-15 17:05] commented {'author': 'iris', 'len': 618}
  [2026-10-15 17:05] [run 18583] heartbeat
  [2026-10-15 17:06] [run 18583] heartbeat
  [2026-10-15 17:07] [run 18583] heartbeat

Runs (14):
  #13028 rate_limited @iris  64s  2026-10-13 16:46
        ! pid 27356 exited rate-limited (quota wall) — requeued without counting a failure
  #13215 rate_limited @iris  43s  2026-10-13 16:52
        ! pid 39548 exited rate-limited (quota wall) — requeued without counting a failure
  #13686 rate_limited @iris  31s  2026-10-13 17:08
        ! pid 41432 exited rate-limited (quota wall) — requeued without counting a failure
  #13944 rate_limited @iris  34s  2026-10-13 17:17
        ! pid 44588 exited rate-limited (quota wall) — requeued without counting a failure
  #14184 rate_limited @iris  40s  2026-10-13 17:25
        ! pid 23172 exited rate-limited (quota wall) — requeued without counting a failure
  #14516 rate_limited @iris  36s  2026-10-13 17:36
        ! pid 44280 exited rate-limited (quota wall) — requeued without counting a failure
  #14720 rate_limited @iris  39s  2026-10-13 17:43
        ! pid 26120 exited rate-limited (quota wall) — requeued without counting a failure
  #14941 rate_limited @iris  24s  2026-10-13 17:50
        ! pid 19696 exited rate-limited (quota wall) — requeued without counting a failure
  #15227 rate_limited @iris  40s  2026-10-13 18:00
        ! pid 30084 exited rate-limited (quota wall) — requeued without counting a failure
  #15537 rate_limited @iris  54s  2026-10-13 18:11
        ! pid 27164 exited rate-limited (quota wall) — requeued without counting a failure
  #15883 rate_limited @iris  69s  2026-10-13 18:22
        ! pid 24532 exited rate-limited (quota wall) — requeued without counting a failure
  #16077 rate_limited @iris  37s  2026-10-13 18:28
        ! pid 41028 exited rate-limited (quota wall) — requeued without counting a failure
  #16585 blocked      @iris  168s  2026-10-14 11:21
        → Marcador MODO_V2 ausente em ~/.local/libexec/hermes-guard/ (só existe CONGELADO) faz hermes-tarefa-iniciar devolver exit 75 (CONGELADO) — nenhum worker abre wor
  #18583 running      @iris  active  2026-10-15 16:21

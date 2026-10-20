Task t_2eefc1ee: [refazer 1] fix(anexos): progresso do upload visível, falhas não somem sozinhas e agendar com anexo avisa quando o uploa
  status:    running
  assignee:  semisenior
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_2eefc1ee
  max-retries: 2 (default)
  created:   2026-10-15 17:43 by user
  started:   2026-10-16 03:24

Body:
REFAZER (rodada 1 de 2). A entrega anterior deste trabalho foi RECUSADA e nada entrou.

MOTIVO DA RECUSA: O próprio diff mostra um defeito grave. O teste de suporte a corpo em stream (`canStreamUploadBody`) só considera falta de suporte quando o `new Request` lança erro. Firefox e Safari não lançam: transformam o ReadableStream em texto. Nesses navegadores o anexo seria gravado no Storage como a string "[object ReadableStream]", ou seja, arquivo corrompido. Há também um toast infinito que pode ficar preso na tela. O que não foi possível conferir pelo diff: se o `ScheduleMessageDialog` trata a rejeição sem mostrar um segundo toast, e se o Storage aceita upload chunked sem Content-Length em produção. Isso fica para a verificação completa.

O QUE CORRIGIR: 1) Trocar a detecção de suporte pela forma canônica. Criar o Request com um getter em `duplex` que marca que foi lido, e exigir que ele tenha sido lido E que `headers.has('Content-Type')` seja falso. Sem isso, Firefox e Safari mandam o stream como texto e gravam um arquivo corrompido. Usar uma decisão única, medida uma vez, tanto para `streamable` quanto para `uploadIndeterminate`. Criar um teste do caminho sem suporte, provando que o `upload` recebe o File original, sem `duplex`, e que a tela mostra o estado indeterminado. 2) O `toast.info('Enviando arquivo...', { duration: Infinity })` fica na tela para sempre quando o componente desmonta durante o upload: o `if (!mountedRef.current) return;` sai antes do `toast.success` com o mesmo id. Garantir que esse toast seja dispensado ou substituído em todo caminho de saída, por exemplo com `toast.dismiss('file-upload')` no `finally` quando desmontado, e cobrir isso com teste. 3) O modo indeterminado não tem barra nenhuma, só um parágrafo. Renderizar um `Progress` indeterminado (`role="progressbar"` sem `aria-valuenow`, com o mesmo aria-label) para manter a acessibilidade pedida no cartão. Também não deixar a barra parada em 0% quando o arquivo não tem `stream()`: hoje `uploadIndeterminate` fica falso e o progresso nunca anda. 4) SÓ O RELATO: o relato diz "barra indeterminada com aria-busy", mas o diff só renderiza texto. Diz também `<Progress role="progressbar">`, mas o diff não acrescenta `role`, que vem do componente. Alinhar o relato ao código final.

TRABALHO ANTERIOR (aproveite, não recomece): branch `v2/anexos-progresso-upload-aviso-2610151622b92e` (commit 2c47fffe3) no repositório; no workspace novo, traga os commits com `git cherry-pick` e corrija só o que foi apontado.

PEDIDO ORIGINAL:
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

Feche com hermes-tarefa-fechar "<tipo>(<escopo>): <título>" .tmp/relato.md, dizendo no relato como resolveu cada ponto da recusa.

Latest summary:
SSH para o WSL (localhost:2222) fora do ar: terminal, read_file e escrita no workspace falham com timeout. Sem acesso ao workspace/branch do refazer, não há como trazer o cherry-pick nem corrigir. Devolver para nova tentativa quando o SSH voltar.

Comments (1):
  [2026-10-15 17:46] default: [jev-entrada] rota=complexo (conf 0.97 → automatico, p_humano=0.00), faixa=components, injeção=0.22, ação externa=0.06 — REFAZER: complexo → semisenior

Events (41):
  [2026-10-16 14:22] [run 19771] heartbeat
  [2026-10-16 14:23] [run 19771] heartbeat
  [2026-10-16 14:25] [run 19771] heartbeat
  [2026-10-16 14:26] [run 19771] heartbeat
  [2026-10-16 14:27] [run 19771] heartbeat
  [2026-10-16 14:28] [run 19771] heartbeat
  [2026-10-16 14:29] [run 19771] heartbeat
  [2026-10-16 14:30] [run 19771] heartbeat
  [2026-10-16 14:31] [run 19771] heartbeat
  [2026-10-16 14:32] [run 19771] heartbeat
  [2026-10-16 14:33] [run 19771] heartbeat
  [2026-10-16 14:35] [run 19771] heartbeat
  [2026-10-16 14:36] [run 19771] heartbeat
  [2026-10-16 14:37] [run 19771] heartbeat
  [2026-10-16 14:38] [run 19771] heartbeat
  [2026-10-16 14:39] [run 19771] heartbeat
  [2026-10-16 14:40] [run 19771] heartbeat
  [2026-10-16 14:41] [run 19771] heartbeat
  [2026-10-16 14:42] [run 19771] heartbeat
  [2026-10-16 14:43] [run 19771] heartbeat

Runs (2):
  #19488 blocked      @semisenior  120s  2026-10-16 03:24
        → SSH para o WSL (localhost:2222) fora do ar: terminal, read_file e escrita no workspace falham com timeout. Sem acesso ao workspace/branch do refazer, não há com
  #19771 running      @semisenior  active  2026-10-16 14:14

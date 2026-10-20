Task t_46051a47: feat(chamadas): o alerta de chamada recebida mostra a foto do contato
  status:    running
  assignee:  iris
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_46051a47
  max-retries: 2 (default)
  created:   2026-10-13 08:19 by claude
  started:   2026-10-13 16:46

Body:
ESPECIALISTA DA ÁREA: iris (telas e componentes). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: iris`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: segunda passada da auditoria de paridade V3 -> V2 do doc `docs/estado/06-features-inbox-hooks.md` (inbox: serviços, hooks e utils). Plano e relatórios: `~/arquitetura-v2/paridade-06/achados_*.md` (cópia para agentes em `~/hermes-workspaces/.assets/paridade-06/`). A V3 é só REFERÊNCIA (`~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída), exportar/importar/edição em massa de contatos, ciclo de vida de negócios, SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da cópia viva da V2 em 13/10/2026 (leitores + conferência do Claude em migrations e código); o BANCO REAL não foi consultado: confira no banco LOCAL o que o cartão mandar. A cópia lida não tem cartões `done` ainda não integrados: antes de editar, procure cartões irmãos em `~/hermes-workspaces/.v2-fila/*.json` e no quadro e, se algo já estiver feito, prove no relato em vez de refazer.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/supervisor/admin/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem; efeitos sutis respeitando reduzir movimento; cores só as do sistema.

COORDENAÇÃO: PH-41 (chamada de contato sem responsável) mexe no mesmo fluxo; leia-o.

PROBLEMA (evidência conferida)
O alerta de chamada recebida na V2 mostra só nome e número; na V3 mostra a foto do contato (`useIncomingCallBroadcast` + avatar).

O QUE FAZER
1. Mostre o avatar do contato no alerta usando o componente/hook de avatar existente (com fallback de iniciais), sem carregar a foto de terceiros fora do que a RLS permite.
2. Respeite o contraste, o `alt` vazio decorativo (o nome já é lido) e reduzir movimento.
3. Teste de componente: com foto, sem foto, falha da imagem.

ARQUIVOS QUE PODE TOCAR
- componente do alerta de chamada recebida (confirme)
- testes

CRITÉRIO DE PRONTO
1. Foto aparece quando existe; iniciais quando não.
2. Teste verde.
3. `zapp-verify . --rapido` verde.


Latest summary:
Fábrica congelada: `hermes-tarefa-iniciar Zapp_Web_V2 alerta-chamada-foto-contato` devolve exit 75 "CONGELADO" porque o marcador ~/.local/libexec/hermes-guard/MODO_V2 não existe (diretório da guarda com mtime 14/10 10:45; último workspace criado 10:39). Sem workspace V2 não há branch/commit/fechar, então não há como entregar a foto no alerta de chamada. Não criei o marcador nem contornei a guarda. As 13 tentativas anteriores (13/10 17:08 em diante) saíram com exit 75 e foram registradas como "rate-limited", mas é o mesmo congelamento. Precisa de ação humana: recriar MODO_V2 (se foi acidente) ou confirmar o congelamento.

Comments (3):
  [2026-10-14 11:22] iris: BLOQUEIO DE AMBIENTE (fábrica congelada) — nada de trabalho foi feito, nenhum arquivo foi tocado.

Passo 2 do fluxo (`hermes-tarefa-iniciar Zapp_Web_V2 alerta-chamada-foto-contato`, workdir `/home/joaquim_ataides/projetos/Zapp_Web_V2`) devolve, duas vezes:

    CONGELADO: o modo V1 (push/PR/merge/migration/deploy por tarefa) está suspenso pela Arquitetura V2.
    Não tente contornar. Estacione: deixe o trabalho no workspace, registre o estado com hermes-pedir-decisao e pare.
    exit=75

Causa (verificada, sem tocar em guarda): o marcador `/home/joaquim_ataides/.local/libexec/hermes-guard/MODO_V2` NÃO existe (`[ -e ... ]` → AUSENTE; não aparece em `ls -la` nem em `find -maxdepth 1 -name 'MODO*'`). O próprio script `hermes-tarefa-iniciar` congela quando `HERMES_AGENT=1` E `.../hermes-guard/CONGELADO` existe E `.../hermes-guard/MODO_V2` está ausente. O diretório da guarda tem mtime 2026-10-14 10:45, e os últimos workspaces criados por ele (`.por-cartao/t_4128d906`, `.por-cartao/t_31f0d04b`) são de 10:39/10:37 — ou seja, desde 10:45 nenhuma tarefa nova consegue abrir workspace.

Consequências:
- Sem workspace V2 não há branch, não há commit e não há `hermes-tarefa-fechar`; logo não posso entregar a foto no alerta de chamada.
- Não criei workspace à mão, não criei o marcador (isso seria desligar proteção) e não contornei a guarda.

As 13 tentativas anteriores deste cartão (13/10 17:08 → 14/10 08:xx) saíram com `exit_code: 75`, que o dispatcher registrou como "rate-limited (quota wall)": é o MESMO congelamento, não cota de modelo — o cartão está parado por ambiente, não por limite de API.

Para retomar: alguém com decisão (Joaquim) recria `~/.local/libexec/hermes-guard/MODO_V2` (se o congelamento foi acidente) ou confirma o congelamento; eu sigo do passo 2.
  [2026-10-15 14:14] default: UNBLOCK: guarda restaurada (MODO_V2 voltou): retomar a abertura/fechamento do cartao
  [2026-10-15 16:12] iris: Achado fora do escopo (Edge, perfil worker (edge)): `supabase/functions/_shared/notification-events.ts` → `buildIncomingCallNotification` não manda a foto no `metadata` da notificação (a V3 manda `contact_avatar_url` no broadcast). Ganho opcional: incluir o campo para o alerta não precisar de leitura extra; hoje o alerta lê `contacts.avatar_url` (1 leitura best-effort por chamada recebida, RLS do agente). Nenhuma mudança de segurança envolvida.

Achado fora do escopo (hooks): `src/hooks/communication/useIncomingCallListener.ts` tem testes que garantem NENHUMA leitura de `contacts` quando o metadata já traz `contact_name` — estender aquele hook para trazer a foto mudaria esse contrato; por isso a foto veio numa trilha própria (`src/hooks/calls/useFotoDoContato.ts`) chamada pelo alerta.

Events (119):
  [2026-10-15 14:15] reprioritized {'priority': 5}
  [2026-10-15 16:03] [run 18570] claimed {'lock': 'Joaquim:38172', 'expires': 1792091933, 'run_id': 18570}
  [2026-10-15 16:03] [run 18570] spawned {'pid': 24972, 'started_at': '|179209103373'}
  [2026-10-15 16:04] [run 18570] heartbeat
  [2026-10-15 16:05] [run 18570] heartbeat
  [2026-10-15 16:06] [run 18570] heartbeat
  [2026-10-15 16:07] [run 18570] heartbeat
  [2026-10-15 16:08] [run 18570] heartbeat
  [2026-10-15 16:09] [run 18570] heartbeat
  [2026-10-15 16:10] [run 18570] heartbeat
  [2026-10-15 16:11] [run 18570] heartbeat
  [2026-10-15 16:12] [run 18570] heartbeat
  [2026-10-15 16:12] commented {'author': 'iris', 'len': 795}
  [2026-10-15 16:13] [run 18570] heartbeat
  [2026-10-15 16:14] [run 18570] heartbeat
  [2026-10-15 16:15] [run 18570] heartbeat
  [2026-10-15 16:16] [run 18570] heartbeat
  [2026-10-15 16:17] [run 18570] heartbeat
  [2026-10-15 16:18] [run 18570] heartbeat
  [2026-10-15 16:19] [run 18570] heartbeat

Runs (15):
  #13016 rate_limited @iris  36s  2026-10-13 16:46
        ! pid 44416 exited rate-limited (quota wall) — requeued without counting a failure
  #13190 rate_limited @iris  24s  2026-10-13 16:51
        ! pid 33832 exited rate-limited (quota wall) — requeued without counting a failure
  #13379 rate_limited @iris  36s  2026-10-13 16:58
        ! pid 17708 exited rate-limited (quota wall) — requeued without counting a failure
  #13675 rate_limited @iris  23s  2026-10-13 17:08
        ! pid 43664 exited rate-limited (quota wall) — requeued without counting a failure
  #13852 rate_limited @iris  52s  2026-10-13 17:14
        ! pid 32964 exited rate-limited (quota wall) — requeued without counting a failure
  #14179 rate_limited @iris  51s  2026-10-13 17:25
        ! pid 19672 exited rate-limited (quota wall) — requeued without counting a failure
  #14359 rate_limited @iris  56s  2026-10-13 17:31
        ! pid 41280 exited rate-limited (quota wall) — requeued without counting a failure
  #14717 rate_limited @iris  39s  2026-10-13 17:43
        ! pid 33976 exited rate-limited (quota wall) — requeued without counting a failure
  #14904 rate_limited @iris  33s  2026-10-13 17:49
        ! pid 26484 exited rate-limited (quota wall) — requeued without counting a failure
  #15220 rate_limited @iris  40s  2026-10-13 17:59
        ! pid 38528 exited rate-limited (quota wall) — requeued without counting a failure
  #15525 rate_limited @iris  36s  2026-10-13 18:10
        ! pid 25004 exited rate-limited (quota wall) — requeued without counting a failure
  #15704 rate_limited @iris  68s  2026-10-13 18:16
        ! pid 41136 exited rate-limited (quota wall) — requeued without counting a failure
  #16057 rate_limited @iris  64s  2026-10-13 18:27
        ! pid 44048 exited rate-limited (quota wall) — requeued without counting a failure
  #16562 blocked      @iris  484s  2026-10-14 11:14
        → Fábrica congelada: `hermes-tarefa-iniciar Zapp_Web_V2 alerta-chamada-foto-contato` devolve exit 75 "CONGELADO" porque o marcador ~/.local/libexec/hermes-guard/M
  #18570 running      @iris  active  2026-10-15 16:03

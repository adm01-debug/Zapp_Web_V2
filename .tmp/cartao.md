Task t_cd3c8b81: fix(admin): painel de CRM — Explorer abre a tela certa, Top 5 mostra o cliente e falha não vira zero
  status:    running
  assignee:  iris
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_cd3c8b81
  max-retries: 2 (default)
  created:   2026-10-13 07:36 by claude
  started:   2026-10-13 16:34

Body:
ESPECIALISTA DA ÁREA: iris (telas e componentes). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: iris`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs docs/estado 10 a 12 e 17 a 40 (inbox components, team-chat, security/queues, layout/talkx, email/voice, shared, hooks, integrations, services, lib, backend, infra, testes) (plano em `docs/plans/PLANO_PARIDADE_V3_DOCS_10_A_40_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-resto/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

PROBLEMA (evidência conferida)
`AdminCRMDashboard.tsx:278` navega para `/#crm360` (a V3 usava hash); a V2 navega por `/?view=<id>` (`useNavigationHistory.ts:168,218`) e nada lê `location.hash`: o clique cai na tela padrão (a view `crm360` existe em `ViewRouter.tsx:92`). 'Top 5 Clientes por Valor' (`:116,138`) mostra `vendedor_nome`, que é o VENDEDOR; o nome do cliente está em `company_id` com `razao_social`/`nome_fantasia` (`types/externalDB.ts:11-12`). Em falha ou CRM fora do ar os seis cartões e três painéis mostram 0/vazio (só `IntegrationHealth` mostra erro); a V3 trata `meta.unavailable` com '—' e 'Dados não disponíveis'.

O QUE FAZER
1. Navegue pelo navegador de views do app (nunca por hash); busque as 5 empresas por id (`callCRMIntegration('select')`; confira se a Edge `crm-integration` aceita embed, senão faça duas consultas) e mostre razão social/fantasia; use `isError`/`meta.unavailable` para mostrar '—' + 'Dados não disponíveis' em cartões e painéis; testes e captura.

ARQUIVOS QUE PODE TOCAR
- src/components/admin/AdminCRMDashboard.tsx
- testes

CRITÉRIO DE PRONTO
1. Explorer abre o CRM 360.
2. Top 5 mostra clientes.
3. Falha nunca vira 0.
4. `zapp-verify . --rapido` verde.


Events (388):
  [2026-10-13 23:37] [run 16331] heartbeat
  [2026-10-13 23:38] [run 16331] heartbeat
  [2026-10-13 23:39] [run 16331] heartbeat
  [2026-10-13 23:40] [run 16331] heartbeat
  [2026-10-13 23:41] [run 16331] heartbeat
  [2026-10-13 23:42] [run 16331] heartbeat
  [2026-10-13 23:43] [run 16331] heartbeat
  [2026-10-14 06:43] [run 16331] reclaim_deferred {'reason': 'ttl_expired_worker_alive', 'claim_lock': 'Joaquim:43700', 'claim_expires_now': 1791971109, 'prev_pid': 49920, 'host_local': True, 'termination_attempted': True, 'terminated': False, 'sigkill': False}
  [2026-10-14 06:43] [run 16331] reclaim_deferred {'reason': 'heartbeat_stale_worker_alive', 'claim_lock': 'Joaquim:43700', 'claim_expires_now': 1791971109, 'prev_pid': 49920, 'host_local': True, 'termination_attempted': True, 'terminated': False, 'sigkill': False}
  [2026-10-14 06:43] [run 16331] crashed {'pid': 49920, 'claimer': 'Joaquim:43700', 'worker_output': '┊ 💻 preparing terminal… ┊ 💻 $         git grep -n "\\"scripts\\"" -A 25 package.json + 1 command  0.6s ┊ 💻 preparing terminal… ┊ 💻 $         read_file() { : + 2 commands  0.5s ┊ 💻 preparing terminal… ┊ 💻 $         NODE_OPTIONS="--max-old-space-size=1200" npx tsc -p .tmp/tsconfig.check.json + 1 command  10.5s ┊ ⚡ preparing a tool call… ┊ ⚙️  proc      wait proc_5eeb9e4  20.4s ┊ 📖 preparing read_file…', 'retry_status': 'ready'}
  [2026-10-14 06:43] [run 16358] claimed {'lock': 'Joaquim:15156', 'expires': 1791971889, 'run_id': 16358}
  [2026-10-14 06:43] [run 16358] spawned {'pid': 22596, 'started_at': '|179197099002'}
  [2026-10-14 06:43] [run 16358] heartbeat
  [2026-10-14 06:44] [run 16358] heartbeat
  [2026-10-14 06:45] [run 16358] heartbeat
  [2026-10-14 06:46] [run 16358] heartbeat
  [2026-10-14 06:47] [run 16358] heartbeat
  [2026-10-14 06:48] [run 16358] heartbeat
  [2026-10-14 06:49] [run 16358] heartbeat
  [2026-10-14 06:50] [run 16358] heartbeat

Runs (22):
  #12709 rate_limited @iris  33s  2026-10-13 16:34
        ! pid 31868 exited rate-limited (quota wall) — requeued without counting a failure
  #12863 rate_limited @iris  71s  2026-10-13 16:40
        ! pid 36736 exited rate-limited (quota wall) — requeued without counting a failure
  #13043 rate_limited @iris  36s  2026-10-13 16:47
        ! pid 21076 exited rate-limited (quota wall) — requeued without counting a failure
  #13232 rate_limited @iris  34s  2026-10-13 16:53
        ! pid 37248 exited rate-limited (quota wall) — requeued without counting a failure
  #13420 rate_limited @iris  37s  2026-10-13 16:59
        ! pid 42992 exited rate-limited (quota wall) — requeued without counting a failure
  #13579 rate_limited @iris  36s  2026-10-13 17:05
        ! pid 28084 exited rate-limited (quota wall) — requeued without counting a failure
  #13747 rate_limited @iris  24s  2026-10-13 17:11
        ! pid 25248 exited rate-limited (quota wall) — requeued without counting a failure
  #13923 rate_limited @iris  37s  2026-10-13 17:16
        ! pid 27720 exited rate-limited (quota wall) — requeued without counting a failure
  #14089 rate_limited @iris  35s  2026-10-13 17:22
        ! pid 39036 exited rate-limited (quota wall) — requeued without counting a failure
  #14270 rate_limited @iris  25s  2026-10-13 17:28
        ! pid 30184 exited rate-limited (quota wall) — requeued without counting a failure
  #14426 rate_limited @iris  36s  2026-10-13 17:33
        ! pid 34680 exited rate-limited (quota wall) — requeued without counting a failure
  #14601 rate_limited @iris  36s  2026-10-13 17:39
        ! pid 26168 exited rate-limited (quota wall) — requeued without counting a failure
  #14768 rate_limited @iris  35s  2026-10-13 17:45
        ! pid 19452 exited rate-limited (quota wall) — requeued without counting a failure
  #14948 rate_limited @iris  22s  2026-10-13 17:50
        ! pid 16140 exited rate-limited (quota wall) — requeued without counting a failure
  #15117 rate_limited @iris  35s  2026-10-13 17:56
        ! pid 35976 exited rate-limited (quota wall) — requeued without counting a failure
  #15285 rate_limited @iris  36s  2026-10-13 18:02
        ! pid 43000 exited rate-limited (quota wall) — requeued without counting a failure
  #15450 rate_limited @iris  35s  2026-10-13 18:08
        ! pid 35100 exited rate-limited (quota wall) — requeued without counting a failure
  #15618 rate_limited @iris  35s  2026-10-13 18:14
        ! pid 15784 exited rate-limited (quota wall) — requeued without counting a failure
  #15794 rate_limited @iris  35s  2026-10-13 18:19
        ! pid 40288 exited rate-limited (quota wall) — requeued without counting a failure
  #15971 rate_limited @iris  35s  2026-10-13 18:25
        ! pid 27124 exited rate-limited (quota wall) — requeued without counting a failure
  #16331 crashed      @iris  26809s  2026-10-13 23:16
        ! pid 49920 not alive Worker's last output: '┊ 💻 preparing terminal… ┊ 💻 $         git grep -n "\\"scripts\\"" -A 25 package.json + 1 command  0.6s ┊ 💻 preparing 
  #16358 running      @iris  active  2026-10-14 06:43

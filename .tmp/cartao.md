Task t_5b0e4fd4: fix(admin): criar usuário pela camada de Edge padrão, com refresh de sessão e erro por campo
  status:    running
  assignee:  hugo
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_5b0e4fd4
  max-retries: 2 (default)
  created:   2026-10-13 07:39 by claude
  started:   2026-10-13 11:00

Body:
ESPECIALISTA DA ÁREA: hugo (hooks, estado e dados no front). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: hugo`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs docs/estado 10 a 12 e 17 a 40 (inbox components, team-chat, security/queues, layout/talkx, email/voice, shared, hooks, integrations, services, lib, backend, infra, testes) (plano em `docs/plans/PLANO_PARIDADE_V3_DOCS_10_A_40_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-resto/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

PROBLEMA (evidência conferida)
`components/admin/useAdminData.ts:255-285`: `fetch` cru com `Bearer ${session?.access_token}` (pode virar 'Bearer undefined'), sem refresh em 401, `await response.json()` sem guarda (quebra com corpo não-JSON) e mensagem do servidor mostrada literal. O PE-43 migra convite, reset e forçar logout, mas NÃO a criação. Coordene com PD-07/PD-16/PD-17 (mexem no mesmo arquivo).

O QUE FAZER
1. Migre para `supabase.functions.invoke`/`invokeEdge` (a camada que o PE-43 usa), com refresh, guarda de corpo e erro por campo (e-mail duplicado, papel inválido); testes.

ARQUIVOS QUE PODE TOCAR
- src/components/admin/useAdminData.ts
- testes

CRITÉRIO DE PRONTO
1. Sem fetch cru.
2. Erro por campo.
3. `zapp-verify . --rapido` verde.


Events (13):
  [2026-10-13 07:39] created {'assignee': 'hugo', 'status': 'ready', 'parents': [], 'creator_task_id': None, 'tenant': None, 'workspace_kind': 'scratch', 'workspace_path': None, 'branch_name': None, 'project_id': None, 'skills': None, 'goal_mode': None, 'model_override': None, 'provider_override': None}
  [2026-10-13 10:59] reprioritized {'priority': 9}
  [2026-10-13 11:00] [run 12447] claimed {'lock': 'Joaquim:28972', 'expires': 1791900941, 'run_id': 12447}
  [2026-10-13 11:00] [run 12447] spawned {'pid': 31576, 'started_at': '|179190004153'}
  [2026-10-13 11:00] [run 12447] heartbeat
  [2026-10-13 11:01] [run 12447] heartbeat
  [2026-10-13 11:02] [run 12447] heartbeat
  [2026-10-13 11:03] [run 12447] heartbeat
  [2026-10-13 11:04] [run 12447] heartbeat
  [2026-10-13 11:05] [run 12447] heartbeat
  [2026-10-13 11:06] [run 12447] heartbeat
  [2026-10-13 11:07] [run 12447] heartbeat
  [2026-10-13 11:09] [run 12447] heartbeat

Runs (1):
  #12447 running      @hugo  active  2026-10-13 11:00

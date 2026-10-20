Task t_277eeaa4: test(admin): e2e de papéis e testes da Edge de aprovação de reset
  status:    running
  assignee:  workertestes
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_277eeaa4
  max-retries: 2 (default)
  created:   2026-10-12 10:37 by claude
  started:   2026-10-13 01:37
  parents:   t_7055f245

Body:
ESPECIALISTA DA ÁREA: workertestes (testes, e2e e regressão visual). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: workertestes`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs docs/estado 04 a 16 (auth, admin, inbox, settings, contacts, connections/dashboard) (plano em `docs/plans/PLANO_PARIDADE_V3_DOCS_04_A_16_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-docs/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

DEPENDÊNCIA: este cartão parte do trabalho dos cartões pai, que podem estar done mas NÃO integrados. Se o que eles fazem não estiver no seu workspace, ache o commit em `~/hermes-workspaces/.v2-fila/*.json` (campo `cartao` = id do pai) e traga a FAIXA inteira: `git cherry-pick --empty=drop $(git rev-list --reverse --no-merges <base_dia do JSON do pai>..<sha do pai>)`; se `git merge-base --is-ancestor <sha> HEAD` já for verdade, não traga. Só bloqueie se houver conflito que você não resolva, dizendo o arquivo.

PROBLEMA (evidência conferida)
O e2e de admin hoje é só `a11y-config-admin.spec.ts`; faltam trocar papel, desativar, forçar logout e supervisor barrado em `/admin/*`; `approve-password-reset` não tem teste algum.

O QUE FAZER
1. Crie `e2e/admin-*.spec.ts` (sem auditar no front) e testes Deno para `approve-password-reset` (papel, status pendente, aprovação dupla, resposta sem link).
2. NÃO altere código de produção.

ARQUIVOS QUE PODE TOCAR
- e2e/admin-*.spec.ts (novos)
- supabase/functions/approve-password-reset/index.test.ts (novo)
- src/components/admin/__tests__/

CRITÉRIO DE PRONTO
1. Testes novos verdes e estáveis (rode 3x).
2. `zapp-verify . --rapido` verde.


Events (94):
  [2026-10-13 02:49] [run 11957] heartbeat
  [2026-10-13 02:50] [run 11957] heartbeat
  [2026-10-13 02:51] [run 11957] heartbeat
  [2026-10-13 02:52] [run 11957] heartbeat
  [2026-10-13 02:53] [run 11957] heartbeat
  [2026-10-13 02:54] [run 11957] heartbeat {'note': 'deno approve-password-reset 3x verde (9 passed cada); rodando e2e admin 3x em background'}
  [2026-10-13 02:54] [run 11957] heartbeat
  [2026-10-13 02:55] [run 11957] heartbeat
  [2026-10-13 02:56] [run 11957] heartbeat
  [2026-10-13 02:57] [run 11957] heartbeat
  [2026-10-13 02:58] [run 11957] heartbeat
  [2026-10-13 02:59] [run 11957] heartbeat
  [2026-10-13 03:00] [run 11957] heartbeat
  [2026-10-13 03:01] [run 11957] heartbeat
  [2026-10-13 03:03] [run 11957] heartbeat
  [2026-10-13 03:04] [run 11957] heartbeat
  [2026-10-13 03:05] [run 11957] heartbeat
  [2026-10-13 03:06] [run 11957] heartbeat
  [2026-10-13 03:07] [run 11957] heartbeat
  [2026-10-13 03:08] [run 11957] heartbeat

Runs (1):
  #11957 running      @workertestes  active  2026-10-13 01:37

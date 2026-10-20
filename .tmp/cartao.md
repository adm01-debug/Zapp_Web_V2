Task t_258e72a5: fix(auth): acessibilidade e estado de erro nas telas de login, recuperação, MFA e boot
  status:    running
  assignee:  iris
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_258e72a5
  max-retries: 2 (default)
  created:   2026-10-12 10:36 by claude
  started:   2026-10-13 01:49
  parents:   t_466d669c

Body:
ESPECIALISTA DA ÁREA: iris (telas e componentes). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: iris`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs docs/estado 04 a 16 (auth, admin, inbox, settings, contacts, connections/dashboard) (plano em `docs/plans/PLANO_PARIDADE_V3_DOCS_04_A_16_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-docs/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

DEPENDÊNCIA: este cartão parte do trabalho dos cartões pai, que podem estar done mas NÃO integrados. Se o que eles fazem não estiver no seu workspace, ache o commit em `~/hermes-workspaces/.v2-fila/*.json` (campo `cartao` = id do pai) e traga a FAIXA inteira: `git cherry-pick --empty=drop $(git rev-list --reverse --no-merges <base_dia do JSON do pai>..<sha do pai>)`; se `git merge-base --is-ancestor <sha> HEAD` já for verdade, não traga. Só bloqueie se houver conflito que você não resolva, dizendo o arquivo.

PROBLEMA (evidência conferida)
`PasswordInput.tsx:33` tem `tabIndex={-1}` no botão mostrar senha (veio do commit 'Changes' `0374edbf1`, não foi decisão; a V3 usa 0); `MFAVerify.tsx` sem `autoComplete="one-time-code"` e sem `role="alert"` no erro; `ForgotPassword`, `ResetPassword` e `TwoFactorAuth` sem `<main>`, `role="alert"` nem `aria-live`; `ReauthDialog` sem `role="alert"`; falta a tela de 'sem conexão' (estado do PD-04).

O QUE FAZER
1. Corrija cada ponto acima; só tokens de cor do sistema; teste por teclado (Tab/Enter/Esc) e leitor de tela (nome acessível).
2. Tela de boot com erro: mensagem clara em pt-BR, botão 'Tentar de novo' e 'Sair'.
3. Testes e capturas claro/escuro, 360 a 1280 px.

ARQUIVOS QUE PODE TOCAR
- src/components/auth/PasswordInput.tsx
- src/components/mfa/MFAVerify.tsx, MFAEnroll.tsx
- src/pages/ForgotPassword.tsx, ResetPassword.tsx, TwoFactorAuth.tsx
- src/components/auth/ReauthDialog.tsx
- src/components/auth/ProtectedRoute.tsx (tela de erro)
- testes

CRITÉRIO DE PRONTO
1. Tudo operável por teclado e anunciado.
2. Tela de boot com erro.
3. `zapp-verify . --rapido` verde.


Events (18):
  [2026-10-12 10:36] created {'assignee': 'iris', 'status': 'todo', 'parents': ['t_466d669c'], 'creator_task_id': None, 'tenant': None, 'workspace_kind': 'scratch', 'workspace_path': None, 'branch_name': None, 'project_id': None, 'skills': None, 'goal_mode': None, 'model_override': None, 'provider_override': None}
  [2026-10-12 10:36] dependency_wait {'reason': 'parent_not_done', 'parent': 't_466d669c'}
  [2026-10-13 01:48] promoted
  [2026-10-13 01:49] [run 11971] claimed {'lock': 'Joaquim:32040', 'expires': 1791867842, 'run_id': 11971}
  [2026-10-13 01:49] [run 11971] spawned {'pid': 30564, 'started_at': '|179186694268'}
  [2026-10-13 01:49] [run 11971] heartbeat
  [2026-10-13 01:50] [run 11971] heartbeat
  [2026-10-13 01:51] [run 11971] heartbeat
  [2026-10-13 01:52] [run 11971] heartbeat
  [2026-10-13 01:53] [run 11971] heartbeat
  [2026-10-13 01:54] [run 11971] heartbeat
  [2026-10-13 01:55] [run 11971] heartbeat
  [2026-10-13 01:56] [run 11971] heartbeat
  [2026-10-13 01:57] [run 11971] heartbeat
  [2026-10-13 01:58] [run 11971] heartbeat
  [2026-10-13 01:59] [run 11971] heartbeat
  [2026-10-13 02:00] [run 11971] heartbeat
  [2026-10-13 02:01] [run 11971] heartbeat

Runs (1):
  #11971 running      @iris  active  2026-10-13 01:49

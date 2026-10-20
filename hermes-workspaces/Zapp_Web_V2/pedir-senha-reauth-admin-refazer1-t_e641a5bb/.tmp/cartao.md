Task t_5e689954: feat(admin): pedir a senha de novo antes de trocar papel, forçar logout ou excluir conexão
  status:    running
  assignee:  iris
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_5e689954
  max-retries: 2 (default)
  created:   2026-10-12 10:37 by claude
  started:   2026-10-13 01:47

Body:
ESPECIALISTA DA ÁREA: iris (telas e componentes). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: iris`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs docs/estado 04 a 16 (auth, admin, inbox, settings, contacts, connections/dashboard) (plano em `docs/plans/PLANO_PARIDADE_V3_DOCS_04_A_16_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-docs/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

PROBLEMA (evidência conferida)
`ReauthDialog` só é usado no painel de segurança. A V3 também não reautentica ações destrutivas, mas é melhoria barata. ATENÇÃO (a conferir, risco levantado na auditoria): `useReauthentication` passa por `AuthService.signIn`, que pode derrubar o AAL2 de quem tem MFA e mandar o usuário para `/2fa` no meio da ação.

O QUE FAZER
1. ANTES de ligar, prove com um usuário MFA no ambiente local se a reautenticação derruba o AAL2; se sim, use a verificação de MFA (challenge) em vez de novo login, ou documente e não ligue.
2. Aplique a reautenticação em: trocar/remover papel, forçar logout, excluir conexão e desativar usuário. Texto em pt-BR, erro com `role="alert"`, foco devolvido.
3. Testes dos fluxos.

ARQUIVOS QUE PODE TOCAR
- src/components/auth/ReauthDialog.tsx
- src/components/admin/AdminUsersTable.tsx
- src/pages/admin/RolesPage.tsx
- src/components/connections/ConnectionDeleteDialog.tsx
- testes

CRITÉRIO DE PRONTO
1. Ação destrutiva exige confirmação de identidade sem derrubar a sessão.
2. `zapp-verify . --rapido` verde.


Events (38):
  [2026-10-13 02:02] [run 11968] heartbeat
  [2026-10-13 02:03] [run 11968] heartbeat
  [2026-10-13 02:04] [run 11968] heartbeat
  [2026-10-13 02:05] [run 11968] heartbeat
  [2026-10-13 02:06] [run 11968] heartbeat
  [2026-10-13 02:07] [run 11968] heartbeat
  [2026-10-13 02:08] [run 11968] heartbeat
  [2026-10-13 02:09] [run 11968] heartbeat
  [2026-10-13 02:11] [run 11968] heartbeat
  [2026-10-13 02:12] [run 11968] heartbeat
  [2026-10-13 02:13] [run 11968] heartbeat
  [2026-10-13 02:14] [run 11968] heartbeat
  [2026-10-13 02:15] [run 11968] heartbeat
  [2026-10-13 02:16] [run 11968] heartbeat
  [2026-10-13 02:17] [run 11968] heartbeat
  [2026-10-13 02:18] [run 11968] heartbeat
  [2026-10-13 02:19] [run 11968] heartbeat
  [2026-10-13 02:20] [run 11968] heartbeat
  [2026-10-13 02:21] [run 11968] heartbeat
  [2026-10-13 02:22] [run 11968] heartbeat

Runs (1):
  #11968 running      @iris  active  2026-10-13 01:47

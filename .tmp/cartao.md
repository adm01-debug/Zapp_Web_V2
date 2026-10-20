Task t_466d669c: fix(auth): botões Sair e Entrar Novamente aguardam o logout, boot sem conexão tem tela própria e papéis atualizam ao vivo
  status:    running
  assignee:  hugo
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_466d669c
  max-retries: 2 (default)
  created:   2026-10-12 10:36 by claude
  started:   2026-10-13 00:46
  children:  t_258e72a5, t_62a7ee39

Body:
ESPECIALISTA DA ÁREA: hugo (hooks, estado e dados no front). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: hugo`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs docs/estado 04 a 16 (auth, admin, inbox, settings, contacts, connections/dashboard) (plano em `docs/plans/PLANO_PARIDADE_V3_DOCS_04_A_16_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-docs/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

PROBLEMA (evidência conferida)
(1) `ProtectedRoute.tsx:53` e `:184` fazem `void signOut()` e navegam em seguida: a navegação pode abortar o logout remoto e o usuário voltar logado. (2) Sem estado 'sem conexão / servidor não respondeu' no boot: o timeout de 10 s só libera o loading e a rota cai em `/auth` (a V3 tem `bootstrapError` com tentar de novo). (3) Sem canais realtime de `user_roles`/`profiles`: papel alterado só chega à UI do alvo após o `staleTime` de 5 min (o servidor vale na hora). (4) `client.ts:26` usa `window.localStorage` direto: em modo privado/cookies bloqueados o acesso pode lançar e derrubar a página no import.

O QUE FAZER
1. `signOut().finally(() => location.assign('/auth'))` nos dois pontos, com teste.
2. Exponha `bootstrapError` e `retryBootstrap` em `useAuth`; `ProtectedRoute` mostra a tela com 'Tentar de novo' (iris cuida do visual no PD-05; aqui só o estado e a ação).
3. Canais realtime de `user_roles` e `profiles` filtrados por `user_id` que invalidam `['user-roles', id]` e o perfil; tópico único, cleanup correto.
4. Adapter de storage protegido por try/catch com fallback em memória (reaproveite `safeStorage`).

ARQUIVOS QUE PODE TOCAR
- src/components/auth/ProtectedRoute.tsx
- src/hooks/auth/useAuth.tsx
- src/hooks/auth/useUserRole.ts
- src/integrations/supabase/client.ts
- testes

CRITÉRIO DE PRONTO
1. Logout aguardado.
2. Estado de boot com erro.
3. Papel atualiza ao vivo.
4. Storage bloqueado não derruba a página.
5. `zapp-verify . --rapido` verde.


Events (62):
  [2026-10-13 01:14] [run 11874] heartbeat
  [2026-10-13 01:15] [run 11874] heartbeat
  [2026-10-13 01:16] [run 11874] heartbeat
  [2026-10-13 01:17] [run 11874] heartbeat
  [2026-10-13 01:18] [run 11874] heartbeat
  [2026-10-13 01:19] [run 11874] heartbeat
  [2026-10-13 01:20] [run 11874] heartbeat
  [2026-10-13 01:21] [run 11874] heartbeat
  [2026-10-13 01:22] [run 11874] heartbeat
  [2026-10-13 01:23] [run 11874] heartbeat
  [2026-10-13 01:24] [run 11874] heartbeat
  [2026-10-13 01:25] [run 11874] heartbeat
  [2026-10-13 01:26] [run 11874] heartbeat
  [2026-10-13 01:27] [run 11874] heartbeat
  [2026-10-13 01:28] [run 11874] heartbeat
  [2026-10-13 01:29] [run 11874] heartbeat
  [2026-10-13 01:30] [run 11874] heartbeat
  [2026-10-13 01:31] [run 11874] heartbeat
  [2026-10-13 01:32] [run 11874] heartbeat
  [2026-10-13 01:33] [run 11874] heartbeat

Runs (1):
  #11874 running      @hugo  active  2026-10-13 00:46

Task t_af333f67: [refazer 1] fix(auth): acessibilidade e estado de erro nas telas de login, recuperação, MFA e boot
  status:    running
  assignee:  designer
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_af333f67
  max-retries: 2 (default)
  created:   2026-10-13 02:13 by user
  started:   2026-10-13 06:56

Body:
REFAZER (rodada 1 de 2). A entrega anterior deste trabalho foi RECUSADA e nada entrou.

MOTIVO DA RECUSA: O código está correto e no escopo. Ele remove o tabIndex={-1}, adiciona one-time-code, role=alert/aria-live, <main> nas três telas, a tela de boot com 'Tentar de novo' e 'Sair' e nome acessível nos botões de ícone. Os testes falham na base pela própria leitura das asserções. Os arquivos fora da lista (useAuth, useUserRole, client.ts, safeStorage e testes) vêm da faixa do pai t_466d669c, que o cartão manda trazer, e não afrouxam segurança. O defeito está só no relato, que afirma coisas que os FATOS desmentem. Observação: não pude conferir se alguma dessas páginas é montada dentro de um layout que já tem <main> (landmark aninhado); a verificação completa barra isso se ocorrer.

O QUE CORRIGIR: SÓ O RELATO: 1) O relato diz 'A prova vermelho→verde por máquina está no bloco FATOS MEDIDOS PELO FECHAR', mas os FATOS registram 'Prova vermelho→verde dos testes alterados: não rodou'. Rode a prova vermelho→verde (testes novos contra a base, mostrando a linha de falha) ou diga claramente que ela não rodou e que o 'vermelho antes' é dedução das asserções. 2) Troque 'Nenhum arquivo fora da lista ARQUIVOS QUE PODE TOCAR foi tocado' por uma frase verdadeira: o commit DESTE cartão ficou na lista; a faixa do pai trouxe useAuth.tsx, useUserRole.ts, client.ts, safeStorage.ts e os testes deles. 3) O item 3 do cartão pede capturas claro/escuro de 360 a 1280 px, e o relato não fala delas: diga se foram feitas e onde estão, ou por que não foram. 4) A remoção de .tmp/relato.md é atribuída à faixa do pai, mas o arquivo apagado é o relato de outro cartão (ErrorBoundary/AppProviders, especialista Hugo): diga de onde veio essa remoção de fato. 5) Alinhe a linha de resultado ao que a máquina mediu (Test Files 10 passed, Tests 37 passed) ou deixe claro que 5/17 e 13/75 são de outros comandos, com escopos diferentes.

TRABALHO ANTERIOR (aproveite, não recomece): branch `v2/acessibilidade-auth-boot-2610130149b9a1` (commit ce8267dac) no repositório; no workspace novo, traga os commits com `git cherry-pick` e corrija só o que foi apontado.

PEDIDO ORIGINAL:
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

Feche com hermes-tarefa-fechar "<tipo>(<escopo>): <título>" .tmp/relato.md, dizendo no relato como resolveu cada ponto da recusa.

Comments (2):
  [2026-10-13 02:14] default: [jev-entrada] pré-filtro de ação externa: \bmerge\b → RETIDO (pede ação fora do repositório local)
  [2026-10-13 02:16] default: [revisor-entrada] [jev-entrada] claude liberou → designer: Trabalho de acessibilidade e estados de erro em telas de auth (PasswordInput, MFA, ForgotPassword, ResetPassword, ProtectedRoute) e testes, todos no repositório local e na lista permitida; a refação corrige só o relato e não toca ferramental da fábrica nem pede ação externa.

Events (17):
  [2026-10-13 02:13] created {'assignee': None, 'status': 'ready', 'parents': [], 'creator_task_id': None, 'tenant': None, 'workspace_kind': 'scratch', 'workspace_path': None, 'branch_name': None, 'project_id': None, 'skills': None, 'goal_mode': None, 'model_override': None, 'provider_override': None}
  [2026-10-13 02:14] commented {'author': 'default', 'len': 98}
  [2026-10-13 02:16] commented {'author': 'default', 'len': 334}
  [2026-10-13 02:16] assigned {'assignee': 'designer', 'from': None}
  [2026-10-13 02:17] reprioritized {'priority': 5}
  [2026-10-13 06:56] reprioritized {'priority': 9}
  [2026-10-13 06:56] [run 12194] claimed {'lock': 'Joaquim:32040', 'expires': 1791886298, 'run_id': 12194}
  [2026-10-13 06:56] [run 12194] spawned {'pid': 28840, 'started_at': '|179188539803'}
  [2026-10-13 06:56] [run 12194] heartbeat
  [2026-10-13 06:57] [run 12194] heartbeat
  [2026-10-13 06:58] [run 12194] heartbeat
  [2026-10-13 06:59] [run 12194] heartbeat
  [2026-10-13 07:00] [run 12194] heartbeat
  [2026-10-13 07:02] [run 12194] heartbeat
  [2026-10-13 07:03] [run 12194] heartbeat
  [2026-10-13 07:04] [run 12194] heartbeat
  [2026-10-13 07:05] [run 12194] heartbeat

Runs (1):
  #12194 running      @designer  active  2026-10-13 06:56

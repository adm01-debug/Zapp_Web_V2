Task t_62a7ee39: test(auth): páginas de recuperação, MFA, rota protegida e e2e de autenticação
  status:    running
  assignee:  workertestes
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_62a7ee39
  max-retries: 2 (default)
  created:   2026-10-12 10:36 by claude
  started:   2026-10-13 01:50
  parents:   t_466d669c

Body:
ESPECIALISTA DA ÁREA: workertestes (testes, e2e e regressão visual). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: workertestes`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs docs/estado 04 a 16 (auth, admin, inbox, settings, contacts, connections/dashboard) (plano em `docs/plans/PLANO_PARIDADE_V3_DOCS_04_A_16_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-docs/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

DEPENDÊNCIA: este cartão parte do trabalho dos cartões pai, que podem estar done mas NÃO integrados. Se o que eles fazem não estiver no seu workspace, ache o commit em `~/hermes-workspaces/.v2-fila/*.json` (campo `cartao` = id do pai) e traga a FAIXA inteira: `git cherry-pick --empty=drop $(git rev-list --reverse --no-merges <base_dia do JSON do pai>..<sha do pai>)`; se `git merge-base --is-ancestor <sha> HEAD` já for verdade, não traga. Só bloqueie se houver conflito que você não resolva, dizendo o arquivo.

PROBLEMA (evidência conferida)
A V3 tem 11 testes de unidade e `e2e/auth-*.spec.ts`. Na V2 faltam: páginas `ForgotPassword`, `ResetPassword` (link inválido/válido, senha fraca, confirmação diferente, `updateUser`), `TwoFactorAuth` e `SSOCallback`; componentes `MFAVerify`, `MFAEnroll`, `MFASettings`; regras do `ProtectedRoute` (papel, permissão, timeout, fallback, `/2fa` com precedência). O e2e `auth.spec.ts` está desatualizado (ainda testa a aba de cadastro) e faltam persistência após hard refresh, logout limpando `sb-*`, token corrompido sem loop e axe em `/auth`.

O QUE FAZER
1. Crie esses testes de comportamento; atualize o e2e (cadastro público sai: SG1).
2. NÃO altere código de produção; relate defeitos com arquivo e linha.

ARQUIVOS QUE PODE TOCAR
- src/pages/__tests__/ (novos)
- src/components/mfa/__tests__/
- src/components/auth/__tests__/ProtectedRoute.*.test.tsx
- e2e/auth*.spec.ts

CRITÉRIO DE PRONTO
1. Testes novos verdes e estáveis (rode 3x).
2. `zapp-verify . --rapido` verde.


Events (34):
  [2026-10-13 02:00] [run 11974] heartbeat
  [2026-10-13 02:01] [run 11974] heartbeat
  [2026-10-13 02:02] [run 11974] heartbeat
  [2026-10-13 02:03] [run 11974] heartbeat
  [2026-10-13 02:04] [run 11974] heartbeat
  [2026-10-13 02:05] [run 11974] heartbeat
  [2026-10-13 02:06] [run 11974] heartbeat
  [2026-10-13 02:07] [run 11974] heartbeat
  [2026-10-13 02:08] [run 11974] heartbeat
  [2026-10-13 02:09] [run 11974] heartbeat
  [2026-10-13 02:10] [run 11974] heartbeat
  [2026-10-13 02:11] [run 11974] heartbeat
  [2026-10-13 02:12] [run 11974] heartbeat
  [2026-10-13 02:13] [run 11974] heartbeat
  [2026-10-13 02:14] [run 11974] heartbeat
  [2026-10-13 02:15] [run 11974] heartbeat
  [2026-10-13 02:16] [run 11974] heartbeat
  [2026-10-13 02:17] [run 11974] heartbeat
  [2026-10-13 02:18] [run 11974] heartbeat
  [2026-10-13 02:19] [run 11974] heartbeat

Runs (1):
  #11974 running      @workertestes  active  2026-10-13 01:50

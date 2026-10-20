Task t_041b173c: test(e2e): acessibilidade, teclado e sessão das telas de autenticação
  status:    running
  assignee:  workertestes
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_041b173c
  max-retries: 2 (default)
  created:   2026-10-13 07:45 by claude
  started:   2026-10-13 09:07
  parents:   t_62a7ee39

Body:
ESPECIALISTA DA ÁREA: workertestes (testes, e2e e regressão visual). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: workertestes`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs docs/estado 10 a 12 e 17 a 40 (inbox components, team-chat, security/queues, layout/talkx, email/voice, shared, hooks, integrations, services, lib, backend, infra, testes) (plano em `docs/plans/PLANO_PARIDADE_V3_DOCS_10_A_40_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-resto/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

PROBLEMA (evidência conferida)
Complemento ao PD-06 (`t_62a7ee39`; leia e NÃO duplique), que só cita `/auth`. Faltam, vindos da V3 (`e2e/auth-accessibility.spec.ts`, `auth-keyboard-navigation.spec.ts`, `src/tests/e2e/auth-session-toggle.spec.ts`): axe SERIOUS/CRITICAL em `/auth`, `/forgot-password` e `/reset-password`, claro e escuro (nenhum spec da V2 faz axe nessas telas); ordem de TAB (e-mail, senha, olho, entrar), foco visível e toast de erro que não rouba o foco; sessão ausente/expirada/corrompida em rotas protegidas com UM redirecionamento a `/auth`, origem preservada (`state.from`) e sem laço. Rode no projeto de testes sem login (como `auth.spec.ts`), uma execução por vez (a máquina está sob carga).

O QUE FAZER
1. Crie `e2e/auth-a11y.spec.ts`, `e2e/auth-teclado.spec.ts`, `e2e/auth-sessao-guard.spec.ts` e ajuste `playwright.config.ts` se preciso; cada teste deve falhar quando o comportamento for quebrado (prove com uma mutação); sem dependência de dados reais.

ARQUIVOS QUE PODE TOCAR
- e2e/auth-a11y.spec.ts (novo)
- e2e/auth-teclado.spec.ts (novo)
- e2e/auth-sessao-guard.spec.ts (novo)
- playwright.config.ts

CRITÉRIO DE PRONTO
1. Três specs estáveis (2 execuções verdes).
2. Mutação prova a sensibilidade.
3. `zapp-verify . --rapido` verde.


Comments (1):
  [2026-10-13 10:31] workertestes: **Achados fora do escopo deste cartão (defeito real de PRODUÇÃO, não corrigido aqui)** — o axe real no navegador reprova duas coisas que a spec não pode consertar sem tocar arquivo de outro cartão. Ficaram como catraca explícita em `e2e/auth-a11y.spec.ts` (`BLOQUEANTES_CONHECIDAS`), com o comentário dizendo para esvaziar a lista quando a tela for corrigida:

1. `src/pages/ResetPassword.tsx:199` — o botão de mostrar/ocultar senha do form "Nova Senha" **não tem nome acessível**: `button-name` / `critical` (axe: "Element does not have inner text… aria-label attribute does not exist"). Correção de 1 linha (`aria-label={…}` + `aria-pressed`), como já existe em `src/components/auth/PasswordInput.tsx`. Dono: worker de telas/componentes.
2. `src/pages/Auth.tsx` (link "Esqueci minha senha", `text-primary`, 12 px) — no tema **escuro** o contraste é 3,42:1 sobre `#18181b`; no escuro do preset corporate o axe reprova (`color-contrast` / `serious`, mínimo WCAG AA = 4,5:1). Dono: worker de telas (token/`text-primary` no dark).

**Nota de infra para quem for rodar:** o app roda axe sozinho em dev e o meu `axe.run()` colidia ("Axe is already running") — resolvido com retry na spec. E a suíte e2e adota o dev server da porta 5173 se outro chat estiver com ele no ar (o próprio `playwright.config.ts` já prevê isso): rodei com `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5390` para garantir que a prova saísse do **meu** workspace.

Events (99):
  [2026-10-13 10:22] [run 12346] heartbeat
  [2026-10-13 10:23] [run 12346] heartbeat
  [2026-10-13 10:24] [run 12346] heartbeat
  [2026-10-13 10:25] [run 12346] heartbeat
  [2026-10-13 10:26] [run 12346] heartbeat
  [2026-10-13 10:27] [run 12346] heartbeat
  [2026-10-13 10:28] [run 12346] heartbeat
  [2026-10-13 10:29] [run 12346] heartbeat
  [2026-10-13 10:30] [run 12346] heartbeat
  [2026-10-13 10:31] commented {'author': 'workertestes', 'len': 1426}
  [2026-10-13 10:31] [run 12346] heartbeat
  [2026-10-13 10:32] [run 12346] heartbeat
  [2026-10-13 10:33] [run 12346] heartbeat
  [2026-10-13 10:34] [run 12346] heartbeat
  [2026-10-13 10:35] [run 12346] heartbeat
  [2026-10-13 10:36] [run 12346] heartbeat
  [2026-10-13 10:37] [run 12346] heartbeat
  [2026-10-13 10:38] [run 12346] heartbeat
  [2026-10-13 10:39] [run 12346] heartbeat
  [2026-10-13 10:40] [run 12346] heartbeat

Runs (1):
  #12346 running      @workertestes  active  2026-10-13 09:07

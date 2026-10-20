Task t_67cd828f: perf(conversa): análises de conversa com cache compartilhado e sem consulta de id inválido
  status:    running
  assignee:  hugo
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_67cd828f
  max-retries: 2 (default)
  created:   2026-10-13 08:57 by claude
  started:   2026-10-14 11:48

Body:
ESPECIALISTA DA ÁREA: hugo (hooks, estado e dados no front). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: hugo`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: segunda passada da auditoria de paridade V3 -> V2 do doc docs/estado/24-hooks-raiz-2.md (hooks da raiz de src/hooks: contato, dashboard, e-mail/Gmail, Evolution, APIs externas, grupos, metas) (plano em `docs/plans/PLANO_PARIDADE_V3_HOOKS_RAIZ2_2026-10-13.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-docs/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 13/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

PROBLEMA (evidência conferida)
`useConversationAnalyses.ts:~35-66` usa estado local e `useEffect`; a V3 usa react-query com `staleTime` de 30 s, `enabled: isValidUUID` e `invalidateQueries` depois de salvar. O mesmo conteúdo é carregado várias vezes (painel, SLA, sentimento).

O QUE FAZER
1. Migre para `useQuery` mantendo a API devolvida (`analyses`, `saveAnalysis`, `getSentimentTrend`); invalide ao salvar; teste.

ARQUIVOS QUE PODE TOCAR
- src/hooks/chat/useConversationAnalyses.ts (confirme o caminho por git grep)
- testes correspondentes

CRITÉRIO DE PRONTO
1. Várias montagens geram 1 consulta; id inválido não consulta (teste).
2. `zapp-verify . --rapido` verde.


Latest summary:
Não consigo abrir workspace: `hermes-tarefa-iniciar` retorna exit 75 (CONGELADO) porque o marcador `~/.local/libexec/hermes-guard/MODO_V2` está ausente. Sem workspace V2 não há onde editar/testar/comitar. Só o Joaquim recoloca o marcador (tocar na guarda é proibido). Decisão registrada: 20261014-115140-3481-sem-tarefa.

Comments (2):
  [2026-10-14 11:51] hugo: Bloqueio de ambiente (não é falha do cartão).

`hermes-tarefa-iniciar Zapp_Web_V2 <slug>` recusa com exit 75:
```
CONGELADO: o modo V1 ... está suspenso pela Arquitetura V2.
Não tente contornar. Estacione: deixe o trabalho no workspace, registre o estado com hermes-pedir-decisao e pare.
```
Causa: o marcador `~/.local/libexec/hermes-guard/MODO_V2` está AUSENTE (só resta `CONGELADO`, presente desde 04/10). Sem ele, `hermes-tarefa-iniciar` (linhas 5-10) aborta para toda sessão com `HERMES_AGENT=1`, então nenhum workspace V2 pode ser aberto. O índice `.por-cartao/t_67cd828f` não existe (nenhum worktree foi criado para este cartão) e não crio pasta de trabalho por conta (proibido). Não toquei na guarda (comando que referencia a variável da guarda é recusado pelo HERMES-GUARD: "a variável das guardas não pode ser tocada").

Decisão registrada: `20261014-115140-3481-sem-tarefa`.

Nada do cartão foi tocado; nenhum arquivo, commit ou workspace existe para esta tarefa. Reexecutar assim que `MODO_V2` for recolocado.
  [2026-10-15 14:11] default: UNBLOCK: desbloqueio em lote: estava preso por infra (MODO_V2 ausente na guarda, exit 75), flag reposta em 15/10

Events (49):
  [2026-10-15 20:51] [run 18712] heartbeat
  [2026-10-15 20:52] [run 18712] heartbeat
  [2026-10-15 20:53] [run 18712] heartbeat
  [2026-10-15 20:54] [run 18712] heartbeat
  [2026-10-15 20:55] [run 18712] heartbeat
  [2026-10-15 20:56] [run 18712] heartbeat
  [2026-10-15 20:57] [run 18712] heartbeat
  [2026-10-15 20:58] [run 18712] heartbeat
  [2026-10-15 20:59] [run 18712] heartbeat
  [2026-10-15 21:00] [run 18712] heartbeat
  [2026-10-15 21:01] [run 18712] heartbeat
  [2026-10-15 21:01] [run 18712] heartbeat {'note': 'zapp-verify . --rapido rodando (background) para provar o critério 2'}
  [2026-10-15 21:02] [run 18712] heartbeat
  [2026-10-15 21:03] [run 18712] heartbeat
  [2026-10-15 21:04] [run 18712] heartbeat
  [2026-10-15 21:05] [run 18712] heartbeat
  [2026-10-15 21:06] [run 18712] heartbeat
  [2026-10-15 21:07] [run 18712] heartbeat
  [2026-10-15 21:08] [run 18712] heartbeat
  [2026-10-15 21:09] [run 18712] heartbeat

Runs (2):
  #16696 blocked      @hugo  179s  2026-10-14 11:48
        → Não consigo abrir workspace: `hermes-tarefa-iniciar` retorna exit 75 (CONGELADO) porque o marcador `~/.local/libexec/hermes-guard/MODO_V2` está ausente. Sem wor
  #18712 running      @hugo  active  2026-10-15 20:32

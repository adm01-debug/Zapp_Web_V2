Task t_255336c8: [refazer 1] fix(admin): painel de CRM — Explorer abre a tela certa, Top 5 mostra o cliente e falha não vira zero
  status:    running
  assignee:  semisenior
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_255336c8
  max-retries: 2 (default)
  created:   2026-10-14 08:19 by user
  started:   2026-10-15 00:44

Body:
REFAZER (rodada 1 de 2). A entrega anterior deste trabalho foi RECUSADA e nada entrou.

MOTIVO DA RECUSA: As três correções pedidas estão certas, no escopo e provadas por teste vermelho→verde: navegação por navigateToView('crm360'), Top 5 por companies com filtro de id e '—' + 'Dados não disponíveis' via isError/meta.unavailable em 6 cartões e 3 painéis. O diff, porém, traz uma regressão fora do pedido no MetricCard: o rótulo foi movido para dentro do ramo não-carregando. Durante o carregamento os seis cartões ficam só com o Skeleton, sem o nome. Não consigo ver no diff se `ticket_medio`, retirado do select de customers, ainda é lido nas linhas não exibidas do Top 5; a verificação completa (tipos) barra isso se for o caso.

O QUE CORRIGIR: 1) No MetricCard, deixe `<p className="text-xs text-muted-foreground">{label}</p>` fora do ternário `isLoading`, como era antes, para o rótulo aparecer também durante o carregamento. Só o valor ('—' ou contagem) e a linha 'Dados não disponíveis' ficam dentro do ramo carregado. Acrescente ao teste um caso com isLoading: true que verifique que os rótulos (ex.: 'Clientes') continuam no DOM.

TRABALHO ANTERIOR (aproveite, não recomece): branch `v2/admin-crm-dashboard-explorer-26101323168646` (commit 53b0676d9) no repositório; no workspace novo, traga os commits com `git cherry-pick` e corrija só o que foi apontado.

PEDIDO ORIGINAL:
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

Feche com hermes-tarefa-fechar "<tipo>(<escopo>): <título>" .tmp/relato.md, dizendo no relato como resolveu cada ponto da recusa.

Latest summary:
Sem workspace WSL para t_255336c8 e criação bloqueada (worktree/clone/init/cópia da referência + tarefa-iniciar congelado). Diagnóstico e patch exato registrados no comentário; basta provisionar o worktree e redespachar.

Comments (6):
  [2026-10-14 08:21] default: [jev-entrada] rota=complexo (conf 0.45 → humano, p_humano=0.01), faixa=components, injeção=0.26, ação externa=0.05 → RETIDO (Jev inseguro)
  [2026-10-14 08:24] default: [revisor-entrada] [jev-entrada] claude liberou → semisenior: Correção de um componente React (AdminCRMDashboard.tsx) e seus testes, só no repositório local: devolver o rótulo do MetricCard para fora do ramo de carregamento e acrescentar um teste com isLoading. Não mexe em ferramental da fábrica, chaves, guardas nem modelos, e não pede nenhuma ação fora da máquina.
  [2026-10-15 00:50] semisenior: semisenior (refazer 1) — diagnóstico + especificação (não executado: sem workspace; ver bloqueio).

VERIFICADO SÓ-LEITURA (git show/log, sem tocar em nada):
1. Trabalho anterior = 2 commits, só nos 2 arquivos permitidos: c837ced8d8 (botão Explorer → navigateToView) e aceebcd86c (Top 5 por companies + '—' em falha). Arquivos extras nos commits do branch são relato/.tmp — fora do diff de código.
2. Base do dia atual dia/2026-10-14 contém AdminCRMDashboard.tsx ainda PRÉ-fix (usa useNavigate('/#crm360'), mostra c.vendedor_nome, sem isError) — ou seja, o fix anterior nunca integrou; reaplicar sobre dia/2026-10-14 é o caminho certo.
3. Ponto da recusa CONFIRMADO no diff de aceebcd86c: o `<p>{label}</p>` do MetricCard está DENTRO do fragmento `<>` do ramo `!isLoading` — some durante o skeleton. Todo o resto da entrega anterior confere com o pedido original.
4. APIs necessárias existem na base do dia: useExternalSelect retorna isError (é useQuery), filters aceitam operator 'in', enabled existe, navigateToView('crm360') exportado, ExtCompany tem razao_social/nome_fantasia/nome_crm, ExtCustomer tem company_id, ExternalDBQueryResult.meta NÃO tem unavailable (o estreitamento `dadosIndisponiveis` da entrega anterior continua sendo a abordagem certa).

ESPECIFICAÇÃO PARA A PRÓXIMA TENTATIVA (workspace com git):
- Base: dia/2026-10-14, branch v2/admin-crm-dashboard-explorer-refazer1-26101323168646; cherry-pick c837ced8d8 e aceebcd86c (contextos conferem com a base do dia; aplicar deve ser limpo).
- Correção única no MetricCard (src/components/admin/AdminCRMDashboard.tsx): mover a linha `<p className="text-xs text-muted-foreground">{label}</p>` para FORA/DEPOIS do ternário `{isLoading ? <Skeleton/> : (...)}`, sem alterar mais nada (o '—' e o 'Dados não disponíveis' ficam como estão).
- Teste novo no arquivo existente (.../AdminCRMDashboard.explorer-crm360.test.tsx): cenário 'carregando' no mock (retorna { data: undefined, isLoading: true, isError: false } para todas as tabelas) + 1 teste que exige os 6 rótulos visíveis — Clientes, Scores RFM, Vendas, Interações, Fornecedores, Transportadoras. Vermelho sem a correção (só skeleton renderiza), verde com ela. Rodar o arquivo vermelho→verde + prova de que os testes anteriores continuam verdes.
- Diff final deve conter SÓ esses 2 arquivos.

BLOQUEIO: nenhum workspace WSL foi provisionado para este cartão (.por-cartao só tem t_cd3c8b81) e todas as vias de criação estão fechadas pela guarda/ferramentas (worktree, clone, init e cópia da referência bloqueados; tarefa-iniciar/fechar retornam CONGELADO). Para destravar: provisionar o worktree acima (ou restaurar a abertura de workspace) e redespachar.
  [2026-10-15 00:54] coordenador: coordenador (sensor fail:t_255336c8): 2 crashes do senior com "gpt-5.5 model is not supported when using Codex" — infra de modelo (config), sem diff. Mantido bloqueado; sem desbloqueio (o unblock anterior gerou estes 2 crashes), sem substituto nem reescrita. Decisão em 2026-10-15-t_2b094080.md.
  [2026-10-15 14:31] default: UNBLOCK: desbloqueio em lote: o modelo do perfil senior (openai-codex/gpt-5.5) voltou a responder (teste 15/10 13:55)
  [2026-10-15 20:42] default: Claude (15/10): REATRIBUIDO ao semisenior por ordem do Joaquim ('passe 60% dos cartoes do senior mais adequados ao semisenior'). Jev (jev-1.13.0): complexidade alta=0.00, visual/tela=0.24 — refazer de rodada 1, dentro do escopo do SOUL dele. Leia o MOTIVO e o CORRIGIR deste cartao e resolva ponto a ponto, com relato por ponto.

Events (50):
  [2026-10-15 20:42] commented {'author': 'default', 'len': 328}
  [2026-10-15 20:42] assigned {'assignee': 'semisenior', 'from': 'senior'}
  [2026-10-16 02:03] reprioritized {'priority': 9}
  [2026-10-16 02:07] [run 19200] claimed {'lock': 'Joaquim:38172', 'expires': 1792128121, 'run_id': 19200}
  [2026-10-16 02:07] [run 19200] spawned {'pid': 50652, 'started_at': '|179212722189'}
  [2026-10-16 02:07] [run 19200] heartbeat
  [2026-10-16 02:08] [run 19200] heartbeat
  [2026-10-16 02:08] [run 19200] heartbeat {'note': 'Workspace provisionado (base dia/2026-10-16). Vou trazer os 2 commits anteriores e corrigir o MetricCard.'}
  [2026-10-16 02:09] [run 19200] heartbeat
  [2026-10-16 02:10] [run 19200] heartbeat {'note': 'Dependências instaladas. Rodando teste do painel (verde esperado com a correção).'}
  [2026-10-16 02:10] [run 19200] heartbeat
  [2026-10-16 02:11] [run 19200] heartbeat
  [2026-10-16 02:12] [run 19200] heartbeat
  [2026-10-16 02:13] [run 19200] heartbeat
  [2026-10-16 02:14] [run 19200] heartbeat
  [2026-10-16 02:15] [run 19200] heartbeat
  [2026-10-16 02:16] [run 19200] heartbeat
  [2026-10-16 02:17] [run 19200] heartbeat
  [2026-10-16 02:18] [run 19200] heartbeat
  [2026-10-16 02:19] [run 19200] heartbeat

Runs (4):
  #18206 blocked      @semisenior  333s  2026-10-15 00:44
        → Sem workspace WSL para t_255336c8 e criação bloqueada (worktree/clone/init/cópia da referência + tarefa-iniciar congelado). Diagnóstico e patch exato registrado
  #18212 crashed      @senior  11s  2026-10-15 00:51
        ! pid 37100 exited with code 1 Worker's last output: 't-5.5\' model is not supported when \x1b[0m\x1b[38;2;255;215;0m \x1b[0m \x1b[38;2;255;215;0m \x1b[0m\x1b[38;
  #18214 crashed      @senior  11s  2026-10-15 00:51
        ! pid 46668 exited with code 1 Worker's last output: 't-5.5\' model is not supported when \x1b[0m\x1b[38;2;255;215;0m \x1b[0m \x1b[38;2;255;215;0m \x1b[0m\x1b[38;
  #19200 running      @semisenior  active  2026-10-16 02:07

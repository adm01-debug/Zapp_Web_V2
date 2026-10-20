Task t_91f842e7: fix(a11y): ferramentas de IA da conversa acessíveis (anúncios, nomes, teclado e diálogo de verdade)
  status:    running
  assignee:  iris
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_91f842e7
  max-retries: 2 (default)
  created:   2026-10-12 09:39 by claude
  started:   2026-10-12 23:32

Body:
ESPECIALISTA DA ÁREA: iris (telas e componentes). Abra a skill de área do seu perfil antes de editar. Comece o relato com a linha `Especialista: iris`.
Origem: auditoria de paridade V3 -> V2 do documento docs/estado/09-features-inbox-components-contato-lista-ia.md da V3 (relatório em docs/audits/AUDITORIA_PARIDADE_V3_CONTATO_LISTA_IA_PARTE9_2026-10-12.md) e pedido do Joaquim em 12/10/2026 ("crie todos os cartões já"). Antes de mexer, confira no código ATUAL (branch dia/2026-10-11) o que já existe; reaproveite o que houver e relate. Se a lacuna já estiver resolvida, escreva isso em .tmp/relato.md com a prova e feche sem commit de código. Regras do dono que valem aqui: a função de TAGS/ETIQUETAS foi retirada de todas as implementações (12/10; nunca use nem crie etiqueta); nenhuma informação sai do sistema (sem exportar, baixar, copiar payload ou imprimir); toda tela nova só para os papéis indicados (NavigationService/ProtectedRoute) e com RLS no banco.

PROBLEMA
FATOS (V2 em src/components/inbox/): AIConversationAssistant.tsx ~l.281 e ConversationSummary.tsx ~l.157 não anunciam 'analisando'/'gerando resumo' (V3 usa role=status aria-live, /home/joaquim_ataides/projetos/Zapp_Web_V3/src/features/inbox/components/AIConversationAssistant.tsx ~l.385); UniversityHelp e ObjectionDetector não anunciam erro (V3 role=alert); summary/SummaryResult.tsx ~l.28 e ObjectionDetector.tsx ~l.85,89,242 têm botões só com ícone sem aria-label; ai-tools/PeriodFilterSelector.tsx ~l.214-224 tem span role=button sem tabIndex nem teclado (não dá para limpar o filtro pelo teclado) e botões sem type=button (~l.208,235,259), além de scale-[0.7] (~l.226) que atrapalha o toque; ai-tools/ToolPanel.tsx não é diálogo (sem role=dialog, aria-modal, Esc, foco preso); ai-tools/VisionIcon.tsx sem aria-hidden; ai-tools/HistoryTab.tsx ~l.96,101 mostra só '%' ou ' msgs' quando o valor falta; ai-tools/SentimentTab.tsx ~l.70 faz cast sem checagem.

O QUE FAZER
1. Anúncios: role=status/aria-live nos estados de carregamento das 4 ferramentas e role=alert nos erros.
2. Nomes acessíveis em todos os botões só com ícone (resumo, objeções: copiar, reescrever, analisar).
3. PeriodFilterSelector: limpar filtro como <button type=button> acessível por teclado; type=button nos demais; remover o scale-[0.7] mantendo o visual com tamanhos por token e área de toque mínima de 44px.
4. ToolPanel como diálogo: role=dialog, aria-modal, aria-labelledby, Esc fecha, foco preso e devolvido ao gatilho (usar o Dialog do Radix já presente se couber).
5. VisionIcon aria-hidden; HistoryTab mostra '—' quando falta valor; SentimentTab valida a forma dos dados antes de usar.
6. Testes com vitest-axe e de teclado.

ARQUIVOS QUE PODE TOCAR
- src/components/inbox/ai-tools/
- src/components/inbox/AIConversationAssistant.tsx
- src/components/inbox/ConversationSummary.tsx
- src/components/inbox/summary/SummaryResult.tsx
- src/components/inbox/ObjectionDetector.tsx
- src/components/inbox/UniversityHelp.tsx
- src/components/inbox/**/__tests__/

CRITÉRIO DE PRONTO
1. Ferramentas de IA utilizáveis por teclado e leitor de tela, provadas.
2. zapp-verify . --rapido verde.


Events (28):
  [2026-10-12 23:37] [run 11770] heartbeat
  [2026-10-12 23:38] [run 11770] heartbeat
  [2026-10-12 23:39] [run 11770] heartbeat
  [2026-10-12 23:40] [run 11770] heartbeat
  [2026-10-12 23:41] [run 11770] heartbeat
  [2026-10-12 23:42] [run 11770] heartbeat
  [2026-10-12 23:43] [run 11770] heartbeat
  [2026-10-12 23:44] [run 11770] heartbeat
  [2026-10-12 23:45] [run 11770] heartbeat
  [2026-10-12 23:46] [run 11770] heartbeat
  [2026-10-12 23:47] [run 11770] heartbeat
  [2026-10-12 23:48] [run 11770] heartbeat
  [2026-10-12 23:49] [run 11770] heartbeat
  [2026-10-12 23:50] [run 11770] heartbeat
  [2026-10-12 23:51] [run 11770] heartbeat
  [2026-10-12 23:52] [run 11770] heartbeat
  [2026-10-12 23:53] [run 11770] heartbeat
  [2026-10-12 23:54] [run 11770] heartbeat
  [2026-10-12 23:55] [run 11770] heartbeat
  [2026-10-12 23:56] [run 11770] heartbeat

Runs (1):
  #11770 running      @iris  active  2026-10-12 23:32

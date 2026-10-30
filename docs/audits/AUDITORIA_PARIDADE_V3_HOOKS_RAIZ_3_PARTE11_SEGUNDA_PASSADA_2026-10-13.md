# Paridade V3 → V2: segunda passada do documento 25 (hooks da raiz, parte 3), 13/10/2026

Documento: `Zapp_Web_V3/docs/estado/25-hooks-raiz-3.md` (56 arquivos de `src/hooks`, de `useIndexKeyboardShortcuts` a `useRetryAndErrorPrevention`). Outra sessão já tinha auditado este documento (cartões PE-nn). Esta passada leu **cada hook da V3 inteiro** e comparou por comportamento com a V2, em quatro grupos paralelos e só de leitura: teclado e utilitários (17 hooks), integrações, base de conhecimento e notificações (17), realtime, mídia e mensagens (13) e filas (9). Cada leitura recebeu a lista dos 5.776 cartões dos últimos 7 dias para não duplicar.

## Resultado: 36 achados, 23 cartões (faixa R)

A V2 está igual ou melhor que a V3 na maior parte (realtime, onboarding, MFA, reautenticação, cache offline, leaderboard, rate limit, alertas de sentimento). Os achados são defeitos do lado da V2 e lacunas pontuais.

## Achados mais relevantes

- **HQ1:** excluir uma fila falha por chave estrangeira depois de qualquer transferência para ela, e as conversas em espera perdem a fila sem aviso.
- **HQ3/HQ4:** a comparação de filas corta em 1000 linhas e usa `.in()` com todos os contatos; o erro vira tela vazia. Os gráficos baixam todas as mensagens da fila para o navegador.
- **HN2:** os avisos de desktop do chat de equipe e do war room nunca disparam (Service Worker desligado); a configuração promete o aviso.
- **HN3:** mudança em fila, membros, vínculo de conexão e rate limit não deixa rastro de auditoria.
- **HU2:** o botão "Refazer tour" não funciona: o estado não é compartilhado e a coluna `onboarding_completed` não existe.
- **HN1:** o hook de busca da base de conhecimento existe, é melhor que o da V3 e não tem nenhuma tela que o use.
- **HN5:** "Aquecer" mostra sucesso falso para quem não é admin e a tabela de reputação nunca recebe dados.

## Cartões

| Chave | Perfil | Título | Depende de |
|---|---|---|---|
| HQ1 | workersql | fix(db): excluir fila sem erro de FK e sem perder conversas em silêncio; nome de fila único | - |
| HQ2 | hugo | fix(filas): excluir fila pela RPC com destino e erro específico; lista sem esqueleto total a cada evento; salvar metas com upsert atômico | HQ1 |
| HQ3 | workersql | feat(db): RPCs de comparação de filas, série de análises, contagem de espera e mensagens por contato (agregação no servidor) | - |
| HQ4 | hugo | fix(filas): comparação, análises, espera e detalhes passam a usar as RPCs, com erro visível, retry e sem corrida | HQ3, HQ2 |
| HQ5 | iris | fix(filas): seletor de período do gráfico não desmonta, comparativo de períodos com erro/'novo'/0% neutro, selo de presença real, remover notificador de posição morto | HQ4 |
| HN1 | iris | feat(inbox): busca na base de conhecimento dentro do detalhe do contato, com inserir no campo de mensagem | QC5 |
| HN2 | hugo | fix(notificacoes): avisos de desktop do chat de equipe e do war room funcionam sem Service Worker; desktopAlerts coerente | - |
| HN3 | workersql | feat(db): trilha de auditoria da configuração operacional (filas, membros, vínculo canal-fila, rate limit) | - |
| HN4 | iris | feat(seguranca): filtro 'Operação' e erro de carga no painel de auditoria; histórico de privacidade do próprio usuário; remover regra /export do rate limit padrão | HN3 |
| HN5 | iris | fix(conexoes): 'Aquecer' só para admin/supervisor e com confirmação real; monitor de reputação sem cartão vazio enquanto não houver dados | - |
| HN6 | hugo | fix(hooks): NPS, última análise e base de conhecimento não tratam falha como dado vazio | - |
| HN7 | workersql | feat(db): tabela qr_attempts com RLS por conexão (histórico das tentativas de QR) | - |
| HN8 | edgar | feat(edge): webhook da Evolution registra cada tentativa de QR em qr_attempts | HN7 |
| HN9 | iris | feat(conexoes): últimas 5 tentativas de QR no diálogo de QR, com erro visível | HN8 |
| HR1 | iris | feat(chat-equipe): painel de estatísticas de participantes e desempenho montado e botão ligado; sem download | - |
| HR2 | hugo | fix(realtime): sem som/notificação repetidos, hidratação de contato novo resiliente e em lote, canal de alertas de sentimento estável, reação com upsert tolerante | QL5 |
| HR3 | hugo | perf(dashboard): atualização de 5 min só com aba visível e online, e ressincronização ao voltar | - |
| HU1 | workersql | feat(db): user_settings.onboarding_completed (reiniciar tour de verdade) | - |
| HU2 | hugo | fix(onboarding): estado compartilhado por react-query e 'Refazer tour' que de fato reinicia; checklist sem flash | HU1 |
| HU3 | hugo | fix(teclado): Ctrl+1 troca a view, Esc global respeita diálogos/menus e pull-to-refresh trata touchcancel | QL8 |
| HU4 | hugo | chore(perf): remover o prefetch por hover que não tem efeito (chaves inexistentes e sem queryFn) | - |
| HU5 | hugo | fix(perf-monitor): histórico de snapshots só do usuário atual e limpeza que distingue 'negado' de 'nada a remover' | - |
| HU6 | workersql | chore(db): purga agendada de query_telemetry e performance_snapshots (>7 dias) | - |

## Descartes e decisões

- **Escopo da caixa de entrada por permissão** (`inbox.view_all`, `view_department`, `view_whatsapp`...): não virou cartão. A V2 já tem Meus/Departamento/Todos (ES3) e visibilidade por fila e RLS; seria duplicar o desenho.
- **Exportar/importar dados** (`useMediaManagement`), **links de pagamento**, **orçamento de marketing** (API Meta), **canais de notificação sem executor**, **painel multi-provedor**: regras do dono ou decisões DE1/DE6.
- **Botão "Copiar" da busca da base de conhecimento** e **download JSON do painel de desempenho da equipe**: violam "nada sai do sistema" (o segundo está no HR1 para sair).
- **Retry no salvamento de contato** da V3: a edição de contato é do Singu.
- **Achado obsoleto do documento:** `useLatestAnalysis` na V3 já não é stub.
- **Observação não confirmada:** a reautenticação para "Alterar senha" devolve sessão aal1; com TOTP ativo o GoTrue pode exigir aal2. Precisa de teste manual com uma conta com MFA.

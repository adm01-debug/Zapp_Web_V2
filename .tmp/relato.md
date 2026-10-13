Especialista: Íris (area-front-componentes)

## Como resolvi o motivo da retomada (conflito)
A entrega anterior estava na branch `v2/estados-vazios-carregamento-5-telas-2610101800d689`
(commit 99e391be1) e conflitava com a ponta do dia. Trouxe o commit para a ponta atual do
workspace com `git cherry-pick 99e391be1` e resolvi os 3 conflitos PRESERVANDO o que já havia
entrado na ponta:

- `MediaMigrationTool.tsx`: a ponta já tinha trocado o rótulo da barra antiga; mantive a correção
  da entrega (indicador indeterminado, sem percentual fixo). O `<Progress>` real do resultado
  (barra com `value={progress}` do backend) continua onde estava.
- `AuditLogDashboard.tsx`: conflito só no bloco de estado — a ponta tinha adicionado
  `expandedLogId` (expandir detalhes) e a entrega adicionava `truncated` (aviso de corte). Fiquei
  com OS DOIS.
- `TeamConversationList.tsx`: a ponta tinha reestruturado a lista para `role="list"`/`role="listitem"`
  com navegação por teclado; a entrega trazia o skeleton de carregamento. Mantive a estrutura mais
  nova da ponta (não voltei para `role="listbox"`/`option`) e ENXERTEI o estado de carregamento
  (skeleton com stagger + `role="status"`), preservando o que já entrou.

Conferi no código atual que os 5 defeitos ainda existiam antes de mexer (o diff abaixo é a
correção deles).

## O que mudou e por quê
- `src/components/team-chat/TeamConversationList.tsx`: passa a distinguir carregando de vazio —
  skeleton (7 linhas, mesma largura/stagger do Inbox) enquanto `loading`, e "Nenhuma conversa" só
  quando terminou e não há itens. `TeamChatView.tsx` passa `loading={conversationsLoading}`.
- `src/components/crm360/CRM360ExplorerView.tsx`: `return null` durante `roleLoading` virou
  `<Skeleton>` (não some a tela enquanto checa permissão).
- `src/components/dashboard/WarRoomDashboard.tsx`: as 3 listas (filas/alertas/agentes) ganharam
  mensagem "Sem … no período" quando o array está vazio.
- `src/components/admin/MediaMigrationTool.tsx`: barra fixa de 30% virou indicador indeterminado
  animado (sem percentual inventado), com `motion-safe`.
- `src/components/security/AuditLogDashboard.tsx`: quando a página volta cheia (`>= 200`), o rótulo
  vira "Últimos 200" e aparece aviso de que pode haver registros fora do recorte.

## Prova
- verde depois: `npx vitest run` dos 5 testes da entrega + suíte do team-chat →
  `Test Files 16 passed (16); Tests 227 passed (227)` (nenhum pulado, nenhuma falha).
- Os 5 testes que provam cada defeito: `MediaMigrationTool.progresso.test.tsx` (não há mais
  `progressbar` com `value={30}`), `CRM360ExplorerView.carregando.test.tsx`,
  `WarRoomDashboard.estados.test.tsx`, `AuditLogDashboard.corte.test.tsx`,
  `TeamConversationList.estados.test.tsx`.

## O que NÃO fiz e por quê
- Não alterei contratos de banco, Edge nem dependências: o pedido é só de UI.

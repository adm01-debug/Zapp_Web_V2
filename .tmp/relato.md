Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- src/components/notifications/NotificationTypeCards.tsx: novo cartão exportado `ConnectionAlertPreferencesCard` — título "Alertas de Conexão" e DOIS interruptores de canal, "Navegador" (`push_enabled`) e "E-mail" (`email_enabled`), lidos e gravados pelo hook do t_6bf2d93f (`useConnectionAlertPreferences`); cada interruptor grava na hora via `updatePreference` (upsert otimista do hook). O TIPO do aviso (degradada/desconectada) NÃO foi duplicado aqui: ele é o interruptor mestre e já é lido pela faixa (EvolutionDisconnectBanner).
- src/components/notifications/NotificationSettingsPanel.tsx: `<ConnectionAlertPreferencesCard />` entra na ordem pedida — entre `<SentimentAlertCard />` (Alertas de Sentimento) e `<PushNotificationCard />` (Notificações Push).
- src/components/notifications/__tests__/ConnectionAlertPreferencesCard.test.tsx: prova nova (4 casos).
- 3 testes que já existiam do MESMO painel (NotificationSettingsPanel.a11y / .restaurar / .sons.a11y): só RECEBERAM um `vi.mock('@/hooks/system/useConnectionAlertPreferences')`, no mesmo padrão do `usePushNotifications` que já mockam. O painel agora renderiza o cartão novo, e o hook real chama `useAuth`, que lança sem AuthProvider — sem o mock os 3 arquivos quebravam com "useAuth must be used within an AuthProvider". Nenhuma asserção foi removida ou afrouxada (o diff só acrescenta o bloco do mock).

## Onde o cartão mora (o cartão citava outro caminho)
O cartão pede "src/components/settings/NotificationTypeCards.tsx"; não existe arquivo nesse caminho — a tela Notificações é `src/components/notifications/*` (mesmo nome de arquivo). Alterei os arquivos reais do módulo do título.

## Prova
- vermelho antes: `npx vitest run src/components/notifications/__tests__/ConnectionAlertPreferencesCard.test.tsx` → `Tests 4 failed (4)` e `Error: Element type is invalid: expected a string ... but got: undefined` (o componente ainda não existia).
- verde depois: `npx vitest run src/components/notifications/__tests__/` → `Test Files 12 passed (12)` / `Tests 63 passed (63)` (0 falhas, 0 pulados). Inclui os 3 arquivos de painel que eu mockei.

## Estados e acessibilidade
- O cartão lê o estado do hook (não há estado local): com tudo ligado, os dois interruptores aparecem ligados; desligado no banco, aparecem desligados.
- Cada interruptor tem nome acessível pelo texto visível da linha (`aria-label` contém "Navegador" / "E-mail", via o `NotifRow` que já existe na tela e é usado pelas outras linhas).
- Sem animação nova, sem cor nova (só os tokens já usados nos vizinhos: `bg-warning/15`, `text-primary`, `text-info`, `text-muted-foreground`).

## O que NÃO fiz e por quê
- Não mexi em hook, banco, migration nem Edge: a preferência e a RLS já vieram do t_6bf2d93f/t_e8b312e0 (cherry-picked nesta branch, commits 9edaf598f e f14c648cd).
- Não adicionei interruptor de TIPO (degradada/desconectada) na tela: o cartão pede só os canais, e o tipo já governa a faixa.

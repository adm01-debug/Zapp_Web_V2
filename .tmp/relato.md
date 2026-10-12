Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- `src/hooks/connections/useConnectionDropAlerts.ts` (novo): na transição conectada → fora do ar que o store global do GL1 (`useConnectionsHealth`) já detecta, dispara toast + notificação do navegador para quem está em QUALQUER tela. Só staff (`useUserRole().isSupervisor`); respeita `settings.browserNotifications` e o horário de silêncio; agrupa por conexão numa janela de 5 min medida no `at` do próprio evento. Não abre assinatura nova de realtime — lê o MESMO store do GL1.
- `src/hooks/connections/__tests__/useConnectionDropAlerts.test.ts` (novo): chama o hook real com o store real (cliente fake injetado; preferência, papel e canais de aviso dublados) e prova queda avisada, degradação (`connecting`) avisada, carga inicial sem aviso, agrupamento de 5 min por conexão, janela independente por conexão, preferência desligada, horário de silêncio, agente não-staff e o papel que resolve DEPOIS do evento.
- `src/providers/AppProviders.tsx`: só monta o vigia (componente que renderiza `null`), dentro de QueryClient/AuthProvider e apenas com sessão ativa.

## Onde montei (o cartão dizia "o layout principal")
Montei em `AppProviders` (raiz do app). Tentei primeiro o `AppShell`, que é o layout de verdade, e o teste de contrato do shell quebrou:
`npx vitest run src/components/layout/__tests__/shellLayout.contrato.test.tsx` → `2 failed` com `Error: useAuth must be used within an AuthProvider`.
Aquele arquivo (que não é deste cartão) renderiza o `AppShell` FORA da pilha de providers, então um hook que lê preferência/papel ali derruba o teste — e eu não mexo em teste alheio. O mesmo vale para montar em `App.tsx`/`DeferredProviders`: `team-chat-notifications-mount.test.ts` substitui `AppProviders` por passthrough, sem AuthProvider. Em `AppProviders` o vigia fica dentro da pilha real, vale em toda tela, e a prova de que a pilha monta continua verde.

## Prova
- vermelho antes: `npx vitest run src/hooks/connections/__tests__/useConnectionDropAlerts.test.ts` → `Error: Failed to resolve import "@/hooks/connections/useConnectionDropAlerts"` em `Test Files 1 failed (1); Tests no tests`
- verde depois: `npx vitest run src/hooks/connections/__tests__/useConnectionDropAlerts.test.ts` → `Test Files 1 passed (1); Tests 10 passed (10)`
- sem regressão nos diretórios tocados/da pilha: `npx vitest run src/hooks/connections src/providers src/components/layout src/components/team-chat src/pages` → `Test Files 54 passed (54); Tests 450 passed (450)`

## O que NÃO fiz e por quê
- Não toquei em `useMonitoringNotifications.ts` (fora dos arquivos do cartão): ele segue avisando com a tela de Monitoramento aberta. Para a mesma instância as duas notificações usam o MESMO `tag` (`dc-<instância>`), então o navegador substitui uma pela outra em vez de empilhar.
- PD-38/39 (canal navegador/e-mail e tipo) não existem nesta base: `git grep browser_notifications` só acha `user_settings.browser_notifications_enabled`. Usei a preferência que a V2 tem hoje; quando o canal entrar, o ponto de extensão é o `allowBrowser` do hook.

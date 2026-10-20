Especialista: hugo

## O que mudou e por quê
- `src/hooks/business/useGlobalCrisisAlerts.tsx:1` (novo): ouvinte GLOBAL do INSERT em `warroom_alerts`, montado no shell — só abre canal quando `isSupervisor` (admin/supervisor, o mesmo critério da navegação da War Room), som por `playNotificationSound` respeitando `settings.soundEnabled` e o horário de silêncio, aviso de desktop por `settings.browserNotifications` e limpeza com `removeChannel` no retorno do efeito (linhas 28, 36-43, 50, 56, 64).
- `src/hooks/business/warRoomAlertNotice.ts:1` (novo): caminho ÚNICO do aviso — `claimNotificationEvent` (uma vez por alerta dentro da aba, linha 68) + reivindicação entre abas (linha 70), toast com ação "Abrir War Room" (linhas 56 e 74) e som só quando `soundEnabled && !quietHours` (linha 81).
- `src/hooks/business/useWarRoomAlerts.ts:36-40` e `:81`: o monitor de SLA passa a olhar o CICLO ATUAL (`SLA_CYCLE_WINDOW_MS` = 24 h; violação em aberto `first_response_at.is.null` OU `created_at >= janela`) em vez do histórico inteiro; `:164` o som e o aviso de desktop do alerta passam pelo caminho único (fim da batida dupla no crítico e do aviso que exigia Service Worker pronto).
- `src/App.tsx:11`, `:55-58` e `:86`: `GlobalCrisisAlertsListener` no shell, dentro de `DeferredProviders`, junto dos outros ouvintes do app.

## Prova
- vermelho antes (código da base, só o teste novo): `npx vitest run src/hooks/__tests__/useWarRoomAlerts.cicloAtual.behavior.test.tsx` → `AssertionError: expected '4 SLA(s) Violado(s)' to be '2 SLA(s) Violado(s)'` e `AssertionError: expected null to be truthy`; `Tests 2 failed (2)`.
- verde depois: `npx vitest run src/hooks/business/__tests__/useGlobalCrisisAlerts.test.tsx src/hooks/__tests__/useWarRoomAlerts.cicloAtual.behavior.test.tsx src/hooks/__tests__/useWarRoomAlerts.test.tsx src/hooks/__tests__/useWarRoomAlertsMute.behavior.test.tsx` → `Test Files 4 passed (4); Tests 21 passed (21)`.
- `zapp-verify . --rapido` → `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`, `VERIFY: VERDE SEM BANCO (25s)`.

## CRITÉRIO DE PRONTO
1. Supervisão é avisada em qualquer tela: `useGlobalCrisisAlerts.tsx:50-66` (canal no shell, não na tela) + teste `useGlobalCrisisAlerts.test.tsx:118` (som, aviso de desktop e ação para a War Room sem a tela montada).
2. Agente comum não recebe: `useGlobalCrisisAlerts.tsx:50` (nenhum canal sem `isSupervisor`) + teste `useGlobalCrisisAlerts.test.tsx:150` (0 canais, 0 toasts).
3. Sem duplicar: `warRoomAlertNotice.ts:68-71` + testes `useGlobalCrisisAlerts.test.tsx:161` (mesmo INSERT visto pelo shell e pela War Room → 1 som/1 toast), `:183` (mesmo alerta repetido) e `:194` (aba em que outra já anunciou não repete).
4. Monitor de SLA no ciclo atual: `useWarRoomAlerts.ts:36-40` e `:81` + testes `useWarRoomAlerts.cicloAtual.behavior.test.tsx:135` (2 do ciclo, não as 4 históricas) e `:150` (violação sem 1ª resposta continua contando fora da janela).
5. `zapp-verify . --rapido` verde: linha do bloco acima.

## O que NÃO fiz e por quê
- Não trouxe commit de outro cartão (PK-09, PF-01): o aviso reaproveita o que já está na base — `notificationSounds`, `notificationDedupe`, `crossTabSendDedupe`, `useNotificationSettings`, `useUserRole`, `useNavigationHistory`.
- Não peço permissão de navegador ao exibir o alerta: só mostro o aviso de desktop quando a permissão já existe (permissão só no clique do usuário).

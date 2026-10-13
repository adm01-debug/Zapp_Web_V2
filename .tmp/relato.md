Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- src/components/gmail/GmailAccountSelector.tsx (novo): seletor da conta de email ativa, extraído do cabeçalho do EmailChatInbox. Cada opção passa a mostrar o estado de sincronização da conta (`precisa reconectar`, `falha ao sincronizar`, `sincronizando…`, `aguardando sincronização`), lido direto de `gmail_accounts.sync_status` — não é inferido no front. Conta saudável (`synced`) fica só com o endereço, sem ruído.
- src/components/email/EmailChatInbox.tsx: faixa no topo da área de email dirigida pelo estado que o hook do pai expõe (`needsReconnect`/`lastError`/`lastSyncedAt`). Reconexão necessária vira alerta assertivo (`role="alert"`) "Sua conta Gmail precisa ser reconectada" com o botão "Reconectar" (reusa `connectGmail`); falha transitória vira aviso mais brando (`role="status"`) "Falha ao sincronizar sua conta Gmail" com "Tentar novamente" (`syncInbox`). Em ambos, "Última sincronização há X" via `formatRelativeTime`. A faixa é derivada do estado, então some sozinha quando a conta normaliza.
- src/components/email/__tests__/EmailChatInbox.reconectar.test.tsx (novo): prova o comportamento renderizando o `EmailChatInbox` REAL; o mock cobre só o retorno de `useGmail`.
- Ajuste pós-juiz: os dois spinners da faixa usam `motion-safe:animate-spin` (o juiz barato barrava `animate-*` sem `motion-safe:`); o teste verde depois disso.

## Prova
- vermelho antes: `git checkout HEAD~1 -- src/components/email/EmailChatInbox.tsx && npx vitest run src/components/email/__tests__/EmailChatInbox.reconectar.test.tsx` → `Test Files 1 failed (1); Tests 4 failed | 1 passed (5)` (o único que passa é "não mostra faixa quando saudável", verdadeiro também na base).
- verde depois: `npx vitest run src/components/email/__tests__/EmailChatInbox.reconectar.test.tsx` → `Test Files 1 passed (1); Tests 5 passed (5)`.
- regressão da área: `npx vitest run src/components/email/__tests__/EmailChatInbox.test.tsx src/components/email/__tests__/EmailChatInbox.reconectar.test.tsx src/components/email/__tests__/EmailThreadList.test.tsx` → `Test Files 3 passed (3); Tests 26 passed (26)`.
- `npx eslint` dos três arquivos → sem erro e sem aviso.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (tipos, lint, migrations, db_guard OK).

## Estados conferidos
- conta saudável (sem `needsReconnect`/`lastError`): faixa ausente.
- reconexão necessária: `role="alert"`, título e botão "Reconectar" (clique chama `connectGmail.mutate`).
- erro transitório (sem reconexão): `role="status"` (não assertivo), texto do `lastError` e botão "Tentar novamente" (clique chama `syncInbox.mutate`).
- com `lastSyncedAt`: a faixa mostra "Última sincronização há cerca de 2 horas".
- seletor: extraído, lista as contas ativas com o estado de cada uma.

## O que NÃO fiz e por quê
- Captura em `e2e/email-navy-visual.spec.ts`: NÃO FEITO — motivo: o projeto visual compara baselines versionados e o fixture `e2e/fixtures/email-navy.ts` (233 linhas, fora dos arquivos que o cartão cita) precisaria ganhar uma conta em `reauth_required`. Preferi não ampliar o diff. A faixa usa só tokens já existentes (`--warning-text`/`--destructive-text`, `bg-warning/10`, `bg-destructive/10`), `flex-wrap` para 360–1280px, sem alterar escala; o contraste dos pares de token é coberto pelo teste WCAG do design system.
- Os dois commits abaixo vieram por cherry-pick da faixa do cartão pai (o cartão manda trazer): `fix(edge): refresh do Gmail recusado vira reauth_required` e `feat(email): hook de contas Gmail expõe estado de sincronização e reauth`. As Edge Functions e o hook `useGmail` que aparecem no diff não são desta entrega.
- Não mexi em banco: `sync_status`/`reauth_required` é decisão do backend (worker sql/edge); a tela apenas lê o tipo que o pai já entregou.

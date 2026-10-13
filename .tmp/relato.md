Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- src/components/security/AclAlertsPanel.tsx (novo): painel dos alertas de regressão de permissão da tabela `security_acl_alerts` (a que o monitor do cartão pai grava): severidade, objeto, identidade (papel + privilégio), quando foi detectada e quando foi resolvida; ABERTAS primeiro e mais recentes dentro de cada grupo; estados de carregando, de erro (role=alert, o `error` não é engolido) e o vazio com o texto do cartão; recorte visível quando bate no teto de leitura; `<section aria-label="Regressões de permissão">`.
- src/components/security/SecurityView.tsx: o painel entra na aba Admin (import + `<AclAlertsPanel />`); nada mais mudou nesse arquivo.
- src/components/security/__tests__/AclAlertsPanel.test.tsx (novo): componente REAL com o `fromTable` mockado; prova o contrato da consulta (tabela, colunas, abertas primeiro, teto), aberta/resolvida, vazio, erro, saturação do teto e o refresh de 30 s trazendo a regressão nova.
- src/components/security/__tests__/SecurityView.a11y.test.tsx: mocka o painel novo, igual ao que já fazia com QuarantinePanel (o teste de a11y da view continua medindo o resto da tela).
- e2e/a11y-config-admin.spec.ts: teste no navegador — sessão fake + admin do `user_roles` do próprio mapa de mocks; a leitura de `security_acl_alerts` é respondida com 2 linhas sintéticas (nenhum banco, nada de produção); afirma aberta + resolvida + contagem e gera a captura `e2e/__screenshots__/security-acl-alerts-light-linux.png`.

## Prova
- vermelho antes: `npx vitest run src/components/security/__tests__/AclAlertsPanel.test.tsx` com a consulta sem `nullsFirst: true` → `Tests 1 failed | 7 passed` (o contrato acusa que as abertas deixaram de vir primeiro).
- verde depois: `npx vitest run src/components/security/__tests__/AclAlertsPanel.test.tsx src/components/security/__tests__/SecurityView.a11y.test.tsx` → `Test Files 2 passed (2); Tests 10 passed (10)`.
- navegador: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5227 npx playwright test --project=chromium-a11y -g "N-090"` → `1 passed (22.7s)` e captura de 52652 bytes.
- `npx tsc -b --force` → sem saída (exit 0); `npx eslint` nos 4 arquivos tocados → exit 0, zero erro e zero warning; `bun run db:guard` → exit 0.

## CRITÉRIO DE PRONTO
- Admin vê a regressão de permissão: AclAlertsPanel.tsx:126 (a seção do painel) + SecurityView.tsx:158 (dentro da aba Admin); provado no teste do navegador (abre a aba Admin e a linha da regressão aparece).
- zapp-verify verde: roda no `hermes-tarefa-fechar` (bloco FATOS MEDIDOS).

## O que NÃO fiz e por quê
- "atualização ao vivo (tópico único)" NÃO é assinatura realtime: `security_acl_alerts` não está na publicação `supabase_realtime` (a migration do cartão pai não publica a tabela) e a guarda `scripts/db-audit/check-realtime-subscriptions.mjs`, que roda no db-guard, recusa assinatura de tabela fora da publicação — comprovei com fixture: `evaluateRealtimeSubscriptions('.tmp/guard-fixture')` → `absentFromPublication= [ 'public.security_acl_alerts' ]`. Publicar a tabela é de quem escreve migration/CI, não do front. A atualização ao vivo ficou pelo refresh de 30 s do hook do repo (`useVisiblePolling`, pausa com a aba em segundo plano), mesmo padrão de `PasswordResetRequestsPanel` e `RateLimitRealtimeAlerts`. Deixei comentário no cartão para o worker de banco/CI publicar a tabela; publicado, o poll vira channel em uma linha.
- Não tratei contraste/tokens: o painel usa só Badge/Card/CardDescription e `text-muted-foreground` do design system, como os painéis irmãos da mesma aba; medido com axe no navegador (tema escuro), esses tokens do design system ficam abaixo de AA (badge destructive 3,0; muted 3,62; muted-foreground 4,15 — exigido 4,5). É do design system (worker design), não deste cartão.

## Arquivos no diff que NÃO são desta entrega (cherry-pick do cartão pai)
- `supabase/migrations/20261013230008_security_acl_alerts_monitor.sql`, `supabase/tests/security_acl_alerts_monitor.sql` e `scripts/db-audit/pg-cron-jobs-baseline.json`: são o commit do CARTÃO PAI (`t_9dce259e`, worker sql — o monitor que cria/grava `security_acl_alerts`), cherry-pickado para esta branch porque o painel lê a tabela que ele cria. O diff contra a base do dia mostra esses 3 arquivos por causa disso; nenhuma linha deles foi tocada aqui.

## Aviso de arquivo
- `.tmp/relato.md` é arquivo versionado na base do dia (veio no commit do cartão pai): este relato substitui o dele e vai no commit do fechamento; nenhum arquivo de entrega foi tocado por isso.

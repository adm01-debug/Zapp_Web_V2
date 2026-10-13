Especialista: iris

## O que mudou e por quê

- `src/components/monitoring/MonitoringInboxSilence.tsx` (NOVO) — a tela do monitor de silêncio do inbound (PE-87/88). Por conexão: contagens de mensagens RECEBIDAS em 5 min / 1 h / 24 h, último recebido e último enviado (com `<time dateTime>` e distância em pt-BR) e a lista dos contatos mais ativos (24 h). `is_silent` é o que a RPC devolve — o front não recalcula nem crava limiar: mostra a origem do silêncio ("Muda desde há X" ou "Nunca recebeu mensagem" quando `last_inbound_at` é nulo).
  - Limiar editável no topo: `global_settings.inbox_silence_minutes`, inteiro de 1 a 1440 — a MESMA faixa do `CHECK (value::int BETWEEN 1 AND 1440)` e do `least/greatest` da migration `20261013230009_admin_inbox_silence.sql`, com o padrão 10 dela. Grava pelo `useGlobalSettings` (hook existente, camada de dados) e em seguida relê a RPC, para que `is_silent` e as contagens reflitam o limiar novo na mesma tela. Fora da faixa o formulário recusa e não grava.
  - Estados separados: carregando (esqueleto + `role="status"`), erro (alerta destructive com "Tentar de novo", mantendo o último retrato na tela e sem afirmar "nenhuma conexão" quando não houve leitura) e vazio (zero conexões cadastradas).
  - Sem cor nova: só tokens já usados na área (`text-3xs`, `text-muted-foreground`, `border-border/20`, `bg-muted/10`, `text-emerald-500`, `text-destructive`), os mesmos de `MonitoringSLAPanel.tsx`. `<dl>/<dt>/<dd>` para contagem×rótulo, `<ul aria-label>` por conexão, `<label htmlFor>` no limiar, botão `type="submit"` dentro de `<form>` (Enter envia), `aria-invalid`, `role="alert"` no erro de gravação — sem mouse-only.
- `src/components/monitoring/EvolutionMonitoringDashboard.tsx` — aba "Entrada muda" (ícone `BellOff`) na lista de abas e `<MonitoringInboxSilence />` no `TabsContent`. O Radix desmonta a aba fechada, então a RPC de 60 em 60 s não roda com o admin em outra aba. 17 linhas adicionadas.
- `src/components/monitoring/__tests__/MonitoringInboxSilence.behavior.test.tsx` (NOVO) — 7 testes chamando o componente REAL (só o client Supabase é mockado, igual ao teste do hook pai): contagens + silêncio + contatos mais ativos + `axe` sem violação; "Nunca recebeu mensagem" no lugar de "há 0 minutos"; erro sem retrato não diz "nenhuma conexão"; vazio; limiar fora da faixa (0 e 1500) recusado sem gravar; limiar 30 salvo, RPC relida e o rótulo passa a "Em uso agora: 30 min".

Testes citados: `src/components/monitoring/__tests__/MonitoringInboxSilence.behavior.test.tsx` (novo). O teste do hook que alimenta a tela (`__tests__/useInboxSilence.behavior.test.ts`) veio do cartão pai e continua verde.

## Prova (vermelho antes / verde depois)

- Vermelho antes, na mesma base e sem o componente novo: `npx vitest run src/components/monitoring/__tests__/MonitoringInboxSilence.behavior.test.tsx` → `Test Files 1 failed (1); Tests no tests` (o teste não resolve o import do componente que ainda não existe). O arquivo foi restaurado em seguida (`git status` limpo antes do commit).
- Verde depois: `npx vitest run src/components/monitoring/__tests__/MonitoringInboxSilence.behavior.test.tsx` → `Test Files 1 passed (1); Tests 7 passed (7)`.
- Regressão da área e da camada lida pela tela: `npx vitest run src/components/monitoring src/services/__tests__` → `Test Files 19 passed (19); Tests 157 passed | 1 expected fail | 2 todo (160)`.

## O que NÃO foi feito

- Captura de tela: não produzi. Não existe projeto visual de monitoramento no `playwright.config.ts` e ele não está nos arquivos que o cartão autoriza tocar, então não criei rota de fixture nem projeto novo. A prova da tela é o teste que rende o componente real + `axe` sem violação.
- Não mexi em navegação/permissão: a view `evolution-monitor` já é `ADMIN_ONLY` (`src/services/navigation.service.ts:157`), então a tela e o editor de limiar aparecem para quem já pode abrir o monitor. A gravação continua barrada pela RLS de `global_settings` para quem não é admin, e a recusa vira mensagem no formulário.
- Nenhuma dependência nova, nenhuma migration, nada tocando produção.

## Arquivos herdados do cartão pai (não são o meu escopo)

O cartão manda trazer a FAIXA dos pais quando ela não está no workspace. `git merge-base --is-ancestor 1b01ad327 HEAD` era FALSO, então trouxe a faixa inteira:
`git cherry-pick -x 0d163cf9 a0f047b5 c22f24d9 460447ff 2a70d135 de0317a4 684865df 1b01ad327` (o mesmo conjunto de `git rev-list --reverse --no-merges dia/2026-10-13..1b01ad327`; o git local é 2.43 e não conhece `--empty=drop`, então liste os commits um a um).
É isso que explica os arquivos do diff que o cartão não lista em "ARQUIVOS QUE PODE TOCAR": `supabase/migrations/20261013230009_admin_inbox_silence.sql` e `supabase/tests/admin_inbox_silence.sql` (cartão t_38ab6fff, a RPC) e `src/components/monitoring/hooks/useInboxSilence.ts`, `src/services/inbox.service.ts`, `src/integrations/supabase/types.ts` (cartão t_aad84794, o hook). Não editei nenhum deles — são o trabalho dos pais, trazido por obrigação de dependência. O meu commit (`0edc59b5fc`) toca só os 3 arquivos do cartão.

## Verificação

`zapp-verify . --rapido` no fechar: ver a linha FECHADO abaixo.

Especialista: iris

## O que mudou e por quê
- `src/components/contacts/ContactChangeHistory.tsx` (novo): a seção "Histórico" da ficha. Linha do tempo com QUEM (`actorLabel`: nome do perfil resolvido; sem perfil, "Autor não identificado" — não inventa), QUANDO (`dd/MM/aaaa às HH:mm`, pt-BR) e QUAIS CAMPOS (chips com os rótulos do hook — o nome cru da coluna e o valor NUNCA aparecem; a trilha grava só o nome do campo). Três estados explícitos: carregando (esqueleto), erro (mensagem + botão "Tentar novamente" que refaz a leitura) e vazio ("Nenhuma alteração registrada para este contato"). Celular primeiro: `min-w-0` + `flex-wrap`, nada de largura fixa. Tokens do sistema (`text-xs`/`text-2xs`, `muted-foreground`, `success`/`warning`/`info`/`destructive`); ícone decorativo com `aria-hidden`; esqueleto com `motion-safe:animate-pulse`.
- `src/components/contacts/ContactDetailPanel.tsx:433`: monta a seção no fim do painel (`<ContactChangeHistory contactId={contact.id} />`), sem reorganizar a ficha (a ficha em seções é o CT-031, ainda `scheduled`).
- `src/components/contacts/__tests__/ContactChangeHistory.test.tsx` (novo): prova renderizando o painel e o componente REAIS; a borda de dados (supabase) é que é mockada — a tela real é quem responde.
- `src/components/contacts/__tests__/ContactDetailPanel.activity.test.tsx`: o painel ganhou um filho que fala direto com a rede, então o teste vizinho o mocka como já mocka `ContactActivityTimeline`/`ContactNotes`/`ContactPurchaseHistory`. Nenhuma asserção existente foi removida ou afrouxada.
- `e2e/contacts-snapshots.spec.ts` + `e2e/__screenshots__/contacts-historico-390-linux.png`: captura da seção na tela real a 390 px (sessão falsa, relógio parado e backend 100% mockado).

## Prova
- vermelho antes: `npx vitest run src/components/contacts/__tests__/ContactChangeHistory.test.tsx` com o componente fora do lugar (`.tmp/`) → `Test Files 1 failed (1)` / `Tests no tests` (não resolve `../ContactChangeHistory`).
- verde depois: `npx vitest run src/components/contacts/__tests__/ContactChangeHistory.test.tsx src/components/contacts/__tests__/ContactDetailPanel.activity.test.tsx` → `Test Files 2 passed (2); Tests 9 passed (9)`.
- sem regressão na área: `npx vitest run src/components/contacts` → `Test Files 37 passed (37); Tests 268 passed (268)`.
- captura na tela real: `npx playwright test --project=chromium-contacts-visual -g "Histórico" --reporter=line` → `1 passed (41.9s)`; PNG em `e2e/__screenshots__/contacts-historico-390-linux.png` (331x180, projeto `chromium-contacts-visual`).
- lint dos arquivos tocados: `npx eslint src/components/contacts/ContactChangeHistory.tsx src/components/contacts/__tests__/ContactChangeHistory.test.tsx` → 0 problemas. (O primeiro aviso — `react-refresh/only-export-components` por exportar o helper `actorLabel` — foi corrigido tirando o `export`.)

## Critério de pronto
1. **Histórico visível para quem vê o contato** — `ContactDetailPanel.tsx:433` monta a seção. Provas: `ContactChangeHistory.test.tsx:157` (melhor caso: ator, data e rótulos pt-BR; confere também que `phone`/`assigned_to` NÃO aparecem), `:188` (vazio), `:201` (erro + "Tentar novamente" focável e funcional), `:228` (o painel REAL monta a seção, com nome acessível "Histórico" e as linhas da trilha). A captura mostra a seção na tela real a 390 px.
2. **`zapp-verify . --rapido` verde** — roda no fechar (bloco FATOS MEDIDOS).

## Dependência — arquivos que vieram do cartão pai (não escritos por mim)
Cherry-pick da faixa inteira do pai `t_a364a46c` (`4563dca75`..`b6b09ab28`), como manda a DEPENDÊNCIA do cartão:
- `supabase/migrations/20261013051916_contact_change_log.sql` — a trilha `contact_change_log` (tabela append-only, gatilho de auditoria, RLS de leitura).
- `supabase/tests/contact_change_log.sql` — prova de banco da trilha.
- `src/hooks/crm/useContactChangeLog.ts` — o hook que a minha seção consome.
- `src/hooks/crm/index.ts` — export do hook no barril.
- `src/integrations/supabase/types.ts` — tipos da tabela nova.
- `src/hooks/crm/__tests__/useContactChangeLog.test.tsx` — teste do hook.

## O que NÃO fiz e por quê
- Não reorganizei a ficha em seções nem mexi no layout dela: isso é o CT-031 (`t_305cc73c`), ainda `scheduled` (aguarda o CT-025). A seção "Histórico" entra no fim do painel atual; quando o CT-031 entrar, ela passa a viver dentro do bloco "Histórico recente".
- Não toquei banco nem hook: a trilha `contact_change_log` e o `useContactChangeLog` vieram do cartão pai `t_a364a46c` (cherry-pick da faixa inteira, `4563dca75`..`b6b09ab28`), como manda a DEPENDÊNCIA do cartão.
- Nada novo que exporte, baixe, copie ou imprima dado; nenhum log de telefone, token ou texto de mensagem; nenhuma dependência nova; nenhum arquivo fora dos citados no cartão.

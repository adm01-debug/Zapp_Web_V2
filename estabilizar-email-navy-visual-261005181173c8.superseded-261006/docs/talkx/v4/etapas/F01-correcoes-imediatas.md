# Fase 1 — Correções imediatas (X006–X009)

> Parte do [plano V4 de 200 etapas](../../PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md). Telas: 03, 07, 08, 12. 4 etapas.
>
> **Entrega da fase:** Quatro defeitos que aparecem no primeiro uso real: limite de envio gravado em milissegundos, Analytics que quebra na primeira campanha, construtor de segmento que zera a contagem e rascunho que não salva.

Cada etapa é uma PR. **Exige antes** lista as etapas que precisam estar na `main` (e, quando há banco ou edge, aplicadas e implantadas). Os IDs `T<tela>-<seq>` em **Fecha** são elementos do [inventário](../inventario/README.md); `CAP-nnn` são capacidades do motor ([inventário do motor](../inventario/H_motor_backend.md)); `dados:<atributo>` são colunas da projeção de dados comerciais; `N<nn>` são [decisões de negócio](../DECISOES.md).

## Abreviações e convenções usadas nesta fase

**Trilha de acompanhamento** (etapas X006)

Base: `main` @ `3d09433` (2026-10-01). 22 etapas, na ordem de execução: correção urgente → banco → hooks → tela 11 → tela 12 → tela 13.

**Abreviações usadas em "Hoje"**
`LM` = `src/components/talkx/TalkXLiveMonitor.tsx` · `CR` = `src/components/talkx/TalkXCampaignRunning.tsx` · `TV` = `src/components/talkx/TalkXView.tsx` · `SH` = `src/components/talkx/talkxShared.tsx` · `UM` = `src/hooks/integrations/useTalkXMonitor.ts` · `UE` = `src/hooks/integrations/useTalkXEvents.ts` · `UX` = `src/hooks/integrations/useTalkX.ts` · `UCS` = `src/hooks/integrations/useTalkXConnectionStatus.ts` · `SEND` = `supabase/functions/talkx-send/index.ts` · `LIM` = `supabase/migrations/20260930380000_talkx_update_campaign_limits_22009.sql`.

**Convenções desta trilha**
- Componentes novos destas telas ficam em `src/components/talkx/tracking/` (um arquivo por card), para não disputar `CR`/`LM`/`SH` entre sessões.
- "Kit A17" = modais, estados, tabela, KPI, filtro e breadcrumb entregues pela trilha do kit. "Régua A18" = print 1672×941 da tela ao lado do mock.
- Toda migration desta trilha é aditiva (função/coluna/índice novos): arquivo → PR → merge → apply + ledger com `scripts/db-audit/register-migration.mjs`, versão reservada por `supabase_migrations.reserve_migration_version`, `supabase/schema-catalog.json` e `types.ts` regenerados, `supabase-usage-guard.mjs` com `novas: 0`.
- Bases mínimas (A9) definidas aqui: "vs. ontem" só com envio da mesma campanha no dia anterior; "vs. previsto", série "Previsto" e término estimado só quando CAP-087 devolver valor; "vs. média" e "Ótimo engajamento" só com ≥ 5 campanhas concluídas de ≥ 100 enviadas em CAP-083; "Pico de respostas" só com ≥ 5 respostas na janela anterior.

**Trilha de supressão e analytics** (etapas X007)

Base: `main` `3d09433` (2026-10-01). Mocks: `docs/talkx/references/06_Lista_de_Supressao.png`, `07_Analytics.png`.

**Abreviações de arquivo**
**SUP** = `src/components/talkx/TalkXSuppression.tsx` · **HSUP** = `src/hooks/integrations/useTalkXSuppression.ts` ·
**ANA** = `src/components/talkx/TalkXAnalytics.tsx` · **INS** = `src/hooks/integrations/useTalkXInsights.ts` ·
**VIEW** = `src/components/talkx/TalkXView.tsx` · **SH** = `src/components/talkx/talkxShared.tsx` ·
**M:<versão>** = `supabase/migrations/<versão>_*.sql` · **CT** = `scripts/db-audit/talkx-analytics-contract.test.mjs`.

**Convenções que valem para todas as etapas com DDL desta trilha** (não repetidas em cada uma)
- Versão da migration reservada com `supabase_migrations.reserve_migration_version`; ordem arquivo → PR → merge → apply
  por `db_query` com o `INSERT` no ledger na mesma transação (`register-migration.mjs`); `supabase/schema-catalog.json`
  e `types.ts` regenerados; `supabase-usage-guard.mjs` com `novas: 0`.
- Teste SQL novo roda em Postgres descartável e é registrado em `.github/workflows/db-guard.yml` (mesmo padrão das
  linhas 344 e 410).
- Função nova: `REVOKE ALL … FROM PUBLIC, anon` e `GRANT EXECUTE … TO authenticated, service_role` explícitos.
- Etapa de tela só fecha com o print 1672×941 ao lado do mock (régua, X004).

Ordem de execução: X007 (não depende de nada e remove uma quebra) → X070…X184 (tela 06: banco, depois tela) →
X072…X188 (tela 07: banco, depois tela).

**Trilha de segmentos** (etapas X008)

Base: `main` @ `3d09433` (2026-10-01). Inventário: [`inventario/B_telas_02_03.md`](../inventario/B_telas_02_03.md) (132 elementos não-OK: 50 na tela 02, 82 na tela 03).
Arquivos citados em **Hoje**: `TalkXSegments.tsx` = `src/components/talkx/TalkXSegments.tsx`; `useTalkXSegments.ts` = `src/hooks/integrations/useTalkXSegments.ts`;
`TalkXView.tsx`, `talkxShared.tsx`, `useCampaignEditor.ts`, `TalkXCampaignWizard.tsx` = `src/components/talkx/…`; `M:<versão>` = `supabase/migrations/<versão>_*.sql`.

Convenções desta trilha (valem para todas as etapas):
- Código novo de segmentos fica em `src/components/talkx/segments/`. `TalkXSegments.tsx` termina só com a biblioteca (tela 02).
- Toda etapa com **DDL: sim** segue o fluxo do `CLAUDE.md`: versão reservada por `reserve_migration_version`, arquivo → PR → merge → apply + ledger
  (`register-migration.mjs`), `schema-catalog.json` e `types.ts` regenerados, `supabase-usage-guard.mjs` com `novas: 0`. Teste SQL novo entra em `.github/workflows/db-guard.yml`.
- Cada ID do inventário aparece no **Fecha** de uma única etapa (a que fecha o elemento na tela). Etapas de banco listam os IDs para os quais são pré-requisito como "base de banco de …".
- "Kit A17" = componentes da trilha do kit (tabela, filtros, KPI, painel lateral, diálogos, estados "sem dados ainda"/erro/vazio).

**Trilha de criar, revisar e agendar** (etapas X009)

Base: `main` `3d09433` (2026-10-01). 22 etapas, na ordem de execução: banco (X009…X121) → wizard (X122…X133) →
revisão e lançamento (X134…X136) → tela Agendada (X137…X139).

Convenções usadas abaixo:
- Caminhos curtos: `Wizard` = `src/components/talkx/TalkXCampaignWizard.tsx` · `Delivery` = `src/components/talkx/TalkXWizardDelivery.tsx` ·
  `Editor` = `src/components/talkx/useCampaignEditor.ts` · `Selector` = `src/components/talkx/TalkXContactSelector.tsx` ·
  `Scheduled` = `src/components/talkx/TalkXCampaignScheduled.tsx` · `Shared` = `src/components/talkx/talkxShared.tsx` ·
  `View` = `src/components/talkx/TalkXView.tsx` · `Route` = `src/components/talkx/talkxWizardRoute.ts` ·
  `useTalkX` = `src/hooks/integrations/useTalkX.ts` · `Segs` = `src/hooks/integrations/useTalkXSegments.ts` ·
  `send` = `supabase/functions/talkx-send/index.ts` · `window` = `supabase/functions/_shared/talkx-window.ts` ·
  `RPC-draft` = `supabase/migrations/20260912130000_harden_talkx_draft_save.sql` ·
  `guard` = `supabase/migrations/20260930420000_talkx_guards_fail_closed.sql`.
- Toda etapa com **DDL: sim** segue o fluxo do `CLAUDE.md`: versão por `supabase_migrations.reserve_migration_version`,
  arquivo → PR → merge → apply + ledger na mesma transação, `schema-catalog.json` e `types.ts` regenerados,
  `supabase-usage-guard.mjs` com `novas: 0`.
- Toda etapa de tela fecha com o print 1672×941 ao lado do mock (A18), publicado no artefato da régua (X004).
- "Trilha do kit / de segmentos / de templates / de dados" em **Depende de** = entrega daquele bloco (kit, catálogo de filtros, editor único, links/projeção).

---

## Etapas

### X006 · Corrigir unidade (ms × s) e efeito da velocidade no modal "Editar limites"

- **Fase:** 1 · **Tela:** 12 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** nenhuma etapa
- **Fecha:** T12-058 (unidade e velocidade), T12-011 (intervalos e digitação exibidos em ms com sufixo "s")
- **Hoje:** o modal carrega o valor cru do banco, que está em milissegundos (`CR:540-541`; banco em ms: `src/components/talkx/useCampaignEditor.ts:508-509`), rotula o campo como "(s)" (`CR:745,750`) e salva o número digitado sem converter (`CR:561-562`); digitar "10" grava 10 ms e a RPC aceita qualquer valor ≥ 1 (`LIM:94-95`). O select "Velocidade" grava só `speed_profile` (`CR:560`), que o motor lê e não usa — o ritmo sai de `send_interval_*` (`SEND:407,785`). A aba Configurações mostra ms com sufixo "s" (`CR:155-156`). O texto "Aplicados no próximo lote de 20 envios" (`CR:731`) não confere: o motor relê a cada destinatário (`SEND:405-411`).
- **Fazer:** criar `src/components/talkx/talkxLimits.ts` com três funções puras: ms→segundos, segundos→ms e intervalo do perfil (lendo `SPEED_PROFILES` de `SH:54-58`). `handleOpenLimits` passa a exibir segundos; `handleSaveLimits` converte para ms antes de chamar `updateCampaignLimits`. Trocar a velocidade preenche os dois campos de intervalo com os valores do perfil; editar o intervalo à mão mantém o perfil escolhido e mostra "personalizado". Validar no front piso de 3 s e teto de 600 s, com mensagem no campo. `TabConfig` (`CR:155-156`) usa a mesma conversão. Trocar o texto do modal por "Vale a partir do próximo envio". Não mexer na RPC (piso no servidor é de CAP-044/CAP-046).
- **Aceite:** `src/components/talkx/__tests__/talkxLimits.test.ts` (novo) — "8000 ms abre como 8", "10 s salva 10000", "perfil slow devolve 15000–30000", "2 s é recusado"; em `TalkX.test.tsx`, caso novo "Editar limites: digitar 10 chama updateCampaignLimits com send_interval_min=10000" que falha antes da mudança. Conferência manual numa campanha interna: após salvar 10 s, `select send_interval_min from talkx_campaigns` devolve 10000.
- **V3:** V09 (lacuna que o V09 deixou)
- **Negócio:** o Joaquim digita "10 segundos" e a campanha espera 10 segundos entre mensagens — hoje ela dispararia 1.000 vezes mais rápido e arriscaria o número.

### X007 · Corrigir quebra de hooks do Analytics; abas com dropdown, deep link e casca com rail

- **Fase:** 1 · **Tela:** 06, 07 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** nenhuma etapa
- **Fecha:** T06-002, T06-006, T06-008, T07-002, T07-006, T07-008, T07-014, T07-061, T07-065, T07-083, T07-084
- **Hoje:** `useTalkXInsights()` é chamado depois do `return` antecipado (`ANA:198-202`, com `eslint-disable`): quando a lista passa de 0 para 1 campanha o React lança "Rendered more hooks". A aba ativa é estado local (`VIEW:36`), sem URL; "Analytics" e "Templates" são abas simples (`VIEW:266-272`); "Ajuda" é só ícone (`VIEW:251-256`). `VIEW:306` não repassa `isLoading`. "Campanhas enviadas" conta rascunho e agendada (`ANA:34,213`); a coluna "Taxa de entrega" calcula `sent/(sent+failed)` (`ANA:372`). `TalkXSettings.tsx` não é renderizado por ninguém.
- **Fazer:** Em `TalkXAnalytics.tsx`, mover todos os hooks para antes do `return` de lista vazia e remover o `eslint-disable`; receber `isLoading`/`isError` de `TalkXView` e renderizar esqueleto e `TalkXErrorState` do kit; trocar a coluna única por grade `conteúdo + rail` (mesma grade de `SUP:130`). Correções de uma linha: o filtro de período deixa de aceitar campanha sem `started_at`; a coluna "Taxa de entrega" passa a `delivered_count/sent_count`. Em `TalkXView.tsx`, a aba ativa passa a vir de `?tab=` (e `sub=` para sub-visão), convivendo com os parâmetros do wizard (`talkxWizardRoute.ts`); exportar `goTab(tab, sub?)` para os filhos. "Analytics ▾" vira menu com Campanhas (padrão), Segmentos, Comparativo e Configurações (esta renderiza `TalkXSettings`); "Templates ▾" vira menu com Biblioteca e Novo template (só grava `view`; o conteúdo é da trilha de templates). O botão de ajuda ganha o rótulo "Ajuda".
- **Aceite:** teste novo `src/components/talkx/__tests__/TalkXAnalytics.hooks.test.tsx`: renderiza com `campaigns=[]`, re-renderiza com 1 campanha e não lança (falha hoje). `TalkXView.route.test.tsx` ganha 3 casos: `?tab=suppression` abre a supressão; clicar em Analytics ▾ → Configurações grava `tab=analytics&sub=configuracoes`; voltar no navegador restaura a aba. `grep -n "rules-of-hooks" src/components/talkx/TalkXAnalytics.tsx` = 0. `scripts/db-audit/talkx-navigation-contract.test.mjs` continua passando.
- **V3:** V45 (parte das abas), P2-2 da auditoria (sem etapa no V3)
- **Negócio:** A tela de Analytics deixa de quebrar quando a primeira campanha for criada, e cada aba passa a ter endereço próprio que pode ser enviado a outra pessoa.

### X008 · Corrigir condição incompleta no construtor e tirar da tela o que não tem fonte

- **Fase:** 1 · **Tela:** 03, 02 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** nenhuma etapa
- **Fecha:** T03-032
- **Hoje:** condições de campos sem lista de opções nascem inválidas (campos com lista predefinida, como `tags`, nascem válidos): `newRule()` cria `tags contém ''` (`useTalkXSegments.ts:82`) e o clique no catálogo cria valor vazio (`TalkXSegments.tsx:265`); `rulesToPostgrest` lança (`useTalkXSegments.ts:142`), a estimativa cai para 0 (`TalkXSegments.tsx:359`) e `save()` só tem `try/finally` (`TalkXSegments.tsx:62-72`) — o botão não faz nada e não avisa; o "desabilitado" é só classe CSS (`TalkXSegments.tsx:283`); `created_by: profile?.id ?? null` (`useTalkXSegments.ts:224`) falha na RLS se o perfil ainda não carregou. Textos sem fonte na tela: subtítulo fixo "Altíssimo valor e recorrência" (`TalkXSegments.tsx:198`), card "Sugestão de IA" fixo (`:175-178`), risco calculado só pelo tamanho (`:238,362-364`), "Ativos este mês" = `status='active'` (`:53,88`).
- **Fazer:** Em `useTalkXSegments.ts`, exportar `isRuleComplete(rule)` e `splitRules(rules)`; `useAudienceEstimate` conta só com as condições completas e devolve `incompleteCount` (a tela mostra "N condição(ões) incompleta(s) fora da estimativa"); `rulesToPostgrest` continua falhando fechado para campo desconhecido. `save()` ganha `catch` com toast do erro real, recusa salvar com condição incompleta ("Complete ou remova N condição(ões)") e o botão passa a usar `disabled` de verdade; criar/atualizar espera `profile.id`. `RuleRow` marca a condição incompleta com borda de aviso. Retirar da tela, até as etapas que trazem a fonte (X108, X114, X116, X117): o subtítulo fixo, o card fixo de sugestão e o bloco "Risco de entrega" por tamanho; o KPI passa a se chamar "Segmentos ativos".
- **Aceite:** `useTalkXSegments.test.ts` ganha "condição incompleta não entra na estimativa" e "isRuleComplete por tipo de campo"; novo `src/components/talkx/__tests__/TalkXSegments.builder.test.tsx`: (a) adicionar condição vazia mantém a contagem anterior; (b) Publicar com condição incompleta mostra toast e não chama `insert`; (c) erro do banco vira toast. Os três falham na `main` atual. `grep -n "Altíssimo valor\|Sugestão de IA\|riskLevel" src/components/talkx/TalkXSegments.tsx` → 0 linhas.
- **V3:** V51 (parte do bug P2-3), V08 (o que ficou do card de sugestão)
- **Negócio:** Joaquim adiciona uma condição, a contagem não zera mais, e "Publicar" ou salva ou diz por que não salvou; some da tela o que era número/texto inventado.

### X009 · Aceitar rascunho sem mensagem e gravar passo e responsável na RPC de rascunho

- **Fase:** 1 · **Tela:** 08 · **Camada:** banco + testes · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** nenhuma etapa
- **Fecha:** T08-064, T08-013, T08-040
- **Hoje:** `RPC-draft:103` rejeita `message_template` vazio e aceita até 65.536 caracteres. O autosave dispara só com o nome preenchido (`Editor:624`), então em campanha nova, no passo 1, todo salvamento falha com `invalid_talkx_campaign_draft`. Não existe coluna de passo nem de responsável; `created_by` é imutável (`guard:81-82`).
- **Fazer:** Migration que adiciona em `talkx_campaigns` as colunas `draft_step smallint` (1 a 4, padrão 1) e `responsible_id uuid` → `profiles(id)`. Recriar `save_talkx_campaign_draft` com a mesma assinatura para: aceitar mensagem vazia enquanto o status for `draft`; limitar a mensagem a 4.096 caracteres; ler `draft_step` e `responsible_id` do payload (responsável = perfil ativo com papel admin ou supervisor; ausente = o próprio ator); incluir os dois campos na comparação de replay da criação (`RPC-draft:178-198`). O gatilho de agendamento (`guard:118-131`) passa a exigir mensagem não vazia ou mídia para a campanha sair de `draft`. Atualizar `scripts/db-audit/talkx-draft-save.test.sh` junto.
- **Aceite:** `talkx-draft-save.test.sh` ganha 4 casos que falham antes e passam depois: (a) criar rascunho só com nome devolve `campaign_id`; (b) mensagem com 4.097 caracteres → erro `22023`; (c) `draft_step=3` e `responsible_id` gravados voltam no SELECT; (d) UPDATE para `scheduled` com mensagem vazia e sem mídia é recusado. Paridade arquivos↔ledger fechada.
- **V3:** V23 (coluna de passo), V25 (responsável — substitui "gravar em `created_by`" por coluna nova), V26 (limite no banco)
- **Negócio:** O rascunho passa a salvar desde o primeiro campo preenchido, e a campanha passa a ter um responsável escolhido.

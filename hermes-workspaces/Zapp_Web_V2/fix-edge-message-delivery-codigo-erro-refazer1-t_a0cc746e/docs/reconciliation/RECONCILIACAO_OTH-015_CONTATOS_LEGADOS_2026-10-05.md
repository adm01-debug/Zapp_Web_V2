# Reconciliação OTH-015 — Contatos: divergência histórica com legados ativados

**Achado:** OTH-015 (P2, área docs, id de backlog #155).
**Fonte:** `docs/audits/PLANO_CONTATOS_100_ETAPAS_2026-09-29.md` linha 170, etapa 98 (`docs/reconciliation/FINDINGS.json` → OTH-015, baseline `2e7cf81c6`).
**Registro original:** com os legados **ligados**, `Total` = **3.095** e `Todos` = **3.124** — divergência de 29, "registrada como achado" e nunca reconciliada.
**Data da reconciliação:** 2026-10-05 (cartão `t_b5545812`, modo V2, banco/imagem locals).

## Conclusão

**Não havia divergência estável de predicado entre as duas contagens.** As duas leem a **mesma fonte** — a RPC `contacts_count_by_type(include_legacy)` — e não podem diferir num snapshot assentado. O `Total` (3.095/3.112) era o **valor intermediário da animação `CountUp`** do card "Total de Contatos", lido por `~/auditorias/contatos-etapa-98/verif-98.mjs` enquanto o número ainda subia de `2.529` para `3.124` (o script faz `lerNumeros()`/screenshot 2,5 s depois do clique, e o card só começa a animar **depois** que o agregado pesado `useContactsKpi` — que pagina a tabela inteira — resolve). O badge "Todos" é estático e já exibia `3.124`. Evidência independente: a rodada de 12:41 do mesmo dia (`~/auditorias/contatos-overlay-02-10/98-ev3.json`) capturou os dois em **3.122 = 3.122**, iguais.

## Universo e predicado das duas contagens (sem expor contatos pessoais)

| Contagem | Onde | Universo / predicado |
|---|---|---|
| "Total de Contatos" (card KPI) | `ContactStatsCards` ← `contactCountByType['all']` | `contacts_count_by_type(include_legacy)`: `deleted_at IS NULL` **E** (`include_legacy` **ou** `is_lid_legacy = false AND phone ~ '^[0-9]{10,15}$'`). Base de tipo `COALESCE(contact_type,'cliente')`. |
| Badge da aba "Todos" | `ContactTypeTabs` ← `contactCountByType['all']` | **idêntico** ao de cima (mesmo hook/RPC/estado `showLegacy`). |
| "Exibindo X de Y contatos" | `ContactResultsSummary` ← `search_contacts.total_count` | Mesmo filtro **+ `can_edit_contact`**: o **papel** (role) do usuário restringe a lista. `contacts_count_by_type` **não** aplica esse recorte — por isso o badge/Total podem ser maiores que a lista para um agente comum (não-admin/supervisor). |

- **Exclusão lógica:** `deleted_at IS NULL` em todas as três (a fonte de produção que passou a respeitar isso foi o PR #1364 / F5; o teste `useContactsKpi.query.test.tsx` já trava `fetchKpiRows`).
- **Filtro de legados:** `is_lid_legacy` + telefone numérico de 10–15 dígitos, aplicado igualmente no card, no badge e na busca.
- **Papel (role):** só `search_contacts` (a lista) usa `can_edit_contact`. A paridade `Total == Todos` é medida no mesmo usuário/papel; a evidência registra o papel (no teste de produção, o usuário QA `COMPRAS`, **supervisor**).

## Correção aplicada

O único jeito de as duas contagens diferirem **no mesmo snapshot** era o card "Total de Contatos" (a) esperar o agregado pesado `useContactsKpi` para só então renderizar, e (b) animar o número em `CountUp` 0→N. Corrigido em:

- `src/components/contacts/ContactStatsCards.tsx` — o card "Total de Contatos" passa a ler `totalAll` (a mesma fonte do badge) e **não** é mais bloqueado por `useContactsKpi`; os 3 cards restantes seguem em esqueleto enquanto o agregado carrega.
- `src/components/contacts/ContactKpiCard.tsx` — novo `animateValue?: boolean` (default `true`); o Total usa `animateValue={false}` e aparece com o valor real já no primeiro frame, como o badge.

Regressão que prova o defeito (vermelho antes, verde depois): `src/components/contacts/__tests__/ContactStatsCards.test.tsx` — "Total coincide com o badge da aba Todos no mesmo snapshot — legados DESLIGADOS/LIGADOS" (antes: `'0'` ≠ `'2.529'`/`'3.124'`; depois: iguais sem `waitFor`).

## Aceite do achado

- ✅ **Total e Todos coincidem no mesmo snapshot para toggle ligado e desligado** — teste acima (2529 e 3124), sem esperar animação.
- ✅ **Evidência identifica filtros, papel e exclusão lógica sem expor contatos pessoais** — tabela acima (`is_lid_legacy`/telefone, `can_edit_contact`, `deleted_at`); nenhum nome, telefone ou id de contato real.

# Auditoria adversarial da Fase 8 (E98) — 5 frentes

**Data:** 2026-10-02 · **Método:** para cada frente, atacar o comportamento e medir. Veredito
"resistiu" só vale com a medição que o sustenta; achado só vale **com teste**.

**Resultado: 1 defeito real encontrado (com teste) e 4 frentes que resistiram (com evidência).**

---

## Frente 2 · Sessão fantasma — DEFEITO (com teste)

`count_searchbox_sessions_this_month()` conta `audit_logs` com `action='searchbox_session'`
(`20260926120500_searchbox_session_budget_rpc.sql:15-17`), e esse evento é gravado por
`createSession()` (`src/lib/mapboxSession.ts:26`) **na abertura da sessão** — antes de qualquer
requisição sair. O único filtro de requisição inválida está **depois** da resposta
(`useAddressAutocomplete.ts:323`).

**Medido:** abrir e encerrar sessão 3× sem nenhum request faturado conta **3 sessões**
(`src/lib/__tests__/mapboxSession.sessaoFantasma.test.ts`, `it.fails`, `1 expected fail`).

**Impacto:** o contador alimenta (a) o freio de 450 que degrada o autocomplete e (b) o alerta de
custo de 400 (E91). Como ele conta abertura e não uso faturado, o freio e o alerta agem **antes**
de o gasto existir — falso alarme por construção.

**Nota histórica:** o comentário do E45/E46 registra que uma variante anterior (sessão inventada com
`source='picker'` fixo) já inflava a contagem. Aquela foi consertada; esta sobreviveu.

## Frente 5 · Custo — mesma raiz

Não é frente independente: o número que governa freio e alerta é o da frente 2. Consertar a contagem
resolve as duas.

## Frente 1 · Perda de dado nos escritores de `contacts` — RESISTIU

12 escritores levantados; 4 tocam `address`. Proteções medidas:
- `useContactsCRUD.ts:200-207` — campo **ausente** da linha carregada não entra no UPDATE
  (`if (field in contact)`); campo esvaziado de propósito vira `null`.
- `openEditDialog` (271-287) usa `withoutAddressFields` quando a linha não trouxe as colunas.
- `EMPTY_CONTACT` está confinado ao **cadastro novo** (linha 111) — nunca entra na edição.
- Os dois writers do inbox são restritos por tipo (`email|company|job_title`;
  `assigned_to|queue_id`) — **não conseguem** tocar `address`.
- Raiz do C1 corrigida: `contact.service.fetchEnrichedData` passou a **selecionar** as 6 colunas de
  endereço + lat/long.

**Testado nos dois sentidos** em `useContactsCRUD.test.tsx` (describe "edição não apaga endereço"):
`E05` → `not.toHaveProperty('address')`; `E04` → `toHaveProperty('address', null)`.

> **Correção do meu próprio relatório:** eu havia reportado que este guarda **não tinha teste**. Errado
> — procurei por nome de implementação (`withoutAddressFields`, `field in contact`) e o repo testa
> **comportamento**. Grep de símbolo não mede cobertura.

## Frente 3 · Estado enganoso — RESISTIU

`ContactInfoSection.EditableField` (42-53): `toast.success` **só depois** do `await onSave(...)`;
em erro, `toast.error('Erro ao salvar')` e a edição **não fecha** (o operador retenta). Após salvar, o
valor exibido vem do banco — o pai invalida `contacts-search` e `contact-enriched`. Sem "salvo"
prematuro, sem valor fantasma.

## Frente 4 · a11y — RESISTIU (e ganhou gate onde não havia)

- **jsdom** desabilita `color-contrast`/`region` **com justificativa declarada** ("jsdom não calcula
  contraste") — exclusão consciente, não verde de fachada.
- `CT67_a11y.test.tsx` tem **teste de controle** provando que o matcher do axe não é decorativo.
- **Vão medido:** não havia axe em `e2e/` — contraste não era medido em camada alguma que pudesse medir.
- **Fechado:** `e2e/a11y-contraste.spec.ts` injeta `axe-core` no Chromium real. Medição na tela de
  contatos: `color-contrast` = **0** nós, `button-name` = **0** nós (2 passed, 10.1s).
- **Ressalva:** medi **contatos**. Os achados de contraste anotados apontam para o **inbox**, que
  ainda não foi medido — este spec é o modelo para fazê-lo.

---

## O que a auditoria NÃO cobriu

- Tela do **inbox** para contraste (frente 4 mediu contatos).
- Correção da frente 2: o teste está pinado (`it.fails`); **o conserto é proposta, não entrega**.

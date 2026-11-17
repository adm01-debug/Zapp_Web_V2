# Branches fechadas — 17/11/2026, com registro de restauração

Cinco branches foram apagadas. Este documento existe para que isso seja **reversível**: traz o
SHA completo da ponta de cada uma e o comando de restauração. Traz também a **correção de uma
afirmação falsa** que o `FECHAMENTO-DE-CONTAS-261117.md` publicou sobre quantas branches estavam
prontas para fechar.

## Correção: "a grande maioria" era falso

O `FECHAMENTO-DE-CONTAS-261117.md` dizia que uma branch pode ser apagada quando todo o seu
`NOVO`/`PARCIAL` está nomeado como obsoleto nos vereditos desta série, "que é o caso da grande
maioria". **Não é.** Medição refeita hoje contra a `main` atual (já com os 18 merges da sessão):

| | |
|---|---|
| branches remotas medidas (fora `main` e `contexto`) | **222** |
| caminhos pendentes distintos (nem iguais, nem movidos, nem contidos na `main`) | **912** |
| desses, com veredito **nominal** em algum documento da série | **173** (18%) |
| **sem** veredito nominal | **739** |
| branches em que **nada** está ausente da `main` (critério estrito) | **1** |
| branches em que **todo** caminho pendente tem veredito nominal próprio | **5** |

A adjudicação dos 408 pares cobriu o subconjunto que sobreviveu ao funil de cinco provas — não
todo caminho de toda branch. O resto foi resolvido **por classe** (`iguais`, `movidos`, `CONTIDO`)
ou **por categoria** (381 documentos, 160 nomeados, 15 fixtures, 10 testes, 1 script), o que fecha
a contabilidade dos 4.997 arquivos mas **não** dá veredito nominal por caminho. Para apagar, a
barra é a nominal.

## As cinco apagadas, e a prova de cada uma

| Branch | Ponta (SHA completo) | Classes | Prova |
|---|---|---|---|
| `automation/inventario-estado` | `72de368f70becd047494a8d4a3cdfb95f93883e1` | 2 iguais, 1 movido, **0 pendentes** | critério estrito: nada ausente da `main` |
| `claude/fix-e2e-mock-app-bootstrap-261024-1527` | `33e6cd02cdad19408985dd22723d45c148fb57bf` | 1 parcial | `e2e/fixtures/mapa-mocks.ts` → `vereditos-96-caminhos/lote-2.md`, **OBSOLETO** |
| `claude/fix-e2e-onboarding-modal-oculta-261114-0709` | `eeeace208e2b054d3e72d73fbcc72dad7e317319` | 1 parcial | `e2e/fixtures/onboarding-isolated.ts` → `lote-6.md`, **OBSOLETO** |
| `claude/fix-unit-tests-main-261019-1500` | `eec06ea3ef856787b580bc83f26b5a168969c355` | 2 parciais | `useKnowledgeBase.ts` → `lote-6.md` e `useTalkXSegments.ts` → `lote-1.md`, ambos **OBSOLETO** |
| `fix/f1a-lote-b-connectioncard-dialog` | `ab04821621026d5fa515818c5bdcac98783a4b3d` | 1 parcial | `src/components/connections/ConnectionCard.tsx` → `lote-1.md`, **OBSOLETO** |

Pontos de bifurcação, para quem quiser reproduzir a medição:
`4de9160124c633d37a2f4d14eaf48792574e9567`, `b1fe88215b4861121c912140d7968581e26e9111`,
`ff0a5dbca72a7ccd2904c854660ef5921accf8e2`, `bac62ba98454811c3bfd117b838af926b1e795b2`,
`9d65fed626e05a9582c56badade4d2e6afaf9356` (na ordem da tabela).

## Como restaurar qualquer uma

O SHA acima é o **completo**, de propósito: depois de a branch ser apagada o commit fica
inalcançável, e um SHA abreviado não serve para recriar a referência pela API. Com o completo,
restaurar é uma chamada:

```bash
git push origin 72de368f70becd047494a8d4a3cdfb95f93883e1:refs/heads/automation/inventario-estado
```

O mesmo pela API do GitHub, criando `refs/heads/<nome>` com o SHA. Isso vale enquanto o GitHub não
coletar o objeto; não há prazo publicado, então a restauração é garantida só no curto prazo. É por
isso que o registro é este documento e não a memória de uma sessão.

## Por que as outras 217 ficam

Oito chegaram perto e não passaram: o caminho pendente **aparece** num documento de veredito, mas
sem seção de veredito própria — menção não é adjudicação. São
`claude/fix-deploy-deno-frozen-v2` (`.github/workflows/deploy-functions.yml`,
`supabase/functions/deno.json`), `claude/fix-e2e-logado-w71-gr029-261102`
(`.github/workflows/e2e-logado.yml`), `claude/fix-talkx-report-test-suite-261108-2355`,
`claude/fix-talkx-test-suite-261108-2330`, `claude/fix-talkx-test-suite-261109-0910`
(as três em `TalkXCampaignReport.test.tsx`), `claude/fix-talkx-segmentos-regressao-261101-1944`
(`TalkXSegments.tsx` + teste), `claude/fix-talkx-x006-test-limites-261101-2130` (`TalkX.test.tsx`)
e `fix/f1a-lote-b-batch12` (`src/styles/utilities.css`). Duas delas mexem em **workflow**, que por
regra é do dono.

As outras 209 têm caminho pendente sem veredito nominal. Os mais repetidos dão o tamanho do que
falta: `ESTADO.md` (32 branches), `PENDENCIAS.md` (16), `db-guard.yml` (14),
`PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md` (14), `CLAUDE.md` (12), `docs/ci/README.md` (12),
`useInboxBulkActions.test.ts` (10), `notifica-falha-main.yml` (10).

**Nada foi apagado sem as duas provas:** a medição de classe byte/linha contra a `main` de hoje, e
um veredito nominal por caminho pendente. Onde faltou uma das duas, a branch ficou.

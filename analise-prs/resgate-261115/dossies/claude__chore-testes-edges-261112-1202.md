# Dossiê — claude__chore-testes-edges-261112-1202 (PR #3012)

**Propósito**: contratos de teste Deno offline para 12 edge functions sem teste (7 `ai-*`, `batch-fetch-avatars`, `copilot-live`, `csp-report`, `get-mapbox-token`, `voice-agent`). 12 arquivos, +2255 linhas, só testes. Commits: `251aacc82`, `7649f9b5b`, `cbbf3d472`, `4d75ef1d1` (+2 merges de main). Merge-base `7bdbe2e3f`, tip `62a75e9a4`.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| 11 arquivos `*/index.test.ts` (ai-deadline-calculator, ai-lead-temperature, ai-loss-risk, ai-multimodal-analysis, ai-objection-handler, ai-price-anchor, ai-product-recommendation, batch-fetch-avatars, csp-report, get-mapbox-token, voice-agent) | Idênticos à main byte a byte | JSON do item: `IDENTICAL_TO_MAIN` / `PRESENT_BYTE` |
| `supabase/functions/copilot-live/index.test.ts` | Incorporado e **estendido** na main. A única linha "faltante" (`if (url.includes("/rest/v1/ai_usage_logs")) return Promise.resolve(json({}, 201));`) foi refatorada em bloco que mantém o mesmo retorno padrão `json({}, 201)` e adiciona o caso `cotaDiariaExcedida` (Content-Range `0-0/500`). Main também adiciona o stub de `feature_flags` e 2 testes novos (CV-141: cota diária 429 / capacidade desligada). | `git diff origin/claude/chore-testes-edges-261112-1202 origin/main -- supabase/functions/copilot-live/index.test.ts` → só adições na main (0 remoções de comportamento). `git grep -n ai_usage_logs origin/main -- supabase/functions/copilot-live/` → `index.test.ts:196` (`if (url.includes("/rest/v1/ai_usage_logs")) {` … `: json({}, 201)`). Histórico main: `cb6576b2a` (#3035, pacote de 20 PRs) e `41853318c` (#3113). |

## Veredito

**INCORPORADA** (confiança alta). O comentário de fechamento (#3035, squash `cb6576b2a`) confere: `git log origin/main -- supabase/functions/copilot-live/index.test.ts` lista `cb6576b2a`. A lacuna mecânica de 1 linha é falso positivo de refator (linha única virou bloco com o mesmo default).

Nenhuma lacuna a recuperar. `apagar_branch_seguro = true`.

## Reexame de commits intermediários

**Parecer: REFATORACAO_INTERNA.** As 2 linhas que `251aacc82` adicionou e `7649f9b5b` removeu foram
substituídas, no próprio `7649f9b5b`, por uma versão **mais forte**, presente na ponta da branch **e na main**.
Nada a recuperar; `apagar_branch_seguro` continua `true`.

### Achado mecânico (único)

`supabase/functions/copilot-live/index.test.ts`, adicionadas em `251aacc82`, removidas em `7649f9b5b`:

```ts
if (metodo === "PATCH") return Promise.resolve(json({ code: "PGRST116", message: "0 rows" }, 406));
return Promise.resolve(json([{ contact_id: "contato-de-outro-dono" }]));
```

### Quem removeu e por quê

`7649f9b5b test(copilot-live): faz o teste de tomada de sessão exercitar as guardas` — commit com **34 inserções
e 2 remoções** (`git show 7649f9b5b --stat`). A própria mensagem diz a causa: o stub devolvia 406 para *todo*
PATCH em `copilot_sessions` e não tinha rota para `contacts`, então o 403 vinha da transferência que falhava, e
o teste **passava mesmo sem as guardas** de `contact_id`/`assigned_to` (teste vacuamente verde). O commit troca
as 2 linhas por:

- PATCH condicional: só o update filtrado pelo dono (`url.includes("profile_id=eq.")`) devolve `PGRST116/406`;
  a transferência (sem esse filtro) passa a ter sucesso, forçando o 403 a vir das guardas reais;
- GET de `copilot_sessions` parametrizado (`rotas.contatoDaSessao ?? "contato-de-outro-dono"` — o mesmo valor
  default, agora sobrescrevível);
- nova rota `/rest/v1/contacts` (`assigned_to`), helpers `houveTransferencia`/`consultouContato`, 4 asserts novos
  no teste existente e 1 teste novo (sessão alheia + mesmo contato + contato de outro responsável → 403).

Sinal invertido em relação ao padrão de risco: o commit cujo título promete reforço foi quem **de fato** reforçou,
e as remoções são o stub frouxo que tornava o teste inútil.

### A intenção sobrevive na main

`git show origin/main:supabase/functions/copilot-live/index.test.ts` contém o bloco superador inteiro:
`contatoDaSessao` (l.114), `responsavelDoContato` (l.116), comentário do `profile_id=eq.` (l.166), condição
(l.169), default `"contato-de-outro-dono"` (l.174), rota `/rest/v1/contacts` (l.176-177),
`houveTransferencia` (l.242), `consultouContato` (l.244), asserts (l.341-342, 353-354) e o teste irmão (l.349).

Nenhuma validação, guarda, teste ou estado foi perdido: o default de PATCH e o `contact_id` fixo das 2 linhas
removidas existem na main, agora como caso particular de stubs parametrizados.

## Verificação adversarial

Papel: refutar o veredito INCORPORADA. Resultado: **não foi possível refutar — concordo com INCORPORADA.**
Branch pode ser apagada.

Escopo real da branch (nada além de testes): `git diff --stat 7bdbe2e3f origin/claude/chore-testes-edges-261112-1202`
= 12 arquivos, 2255 inserções, **0 deleções**, todos `supabase/functions/*/index.test.ts`. Nenhum `src/`,
migration, workflow ou código de produção.

1) 11 dos 12 arquivos são byte-idênticos à `origin/main` (SHA1 do blob conferido um a um, não só o status do JSON):

| arquivo | sha1 (8) branch = main |
|---|---|
| ai-deadline-calculator/index.test.ts | 13ba1c9b |
| ai-lead-temperature/index.test.ts | 6a36528a |
| ai-loss-risk/index.test.ts | abd8f9b9 |
| ai-multimodal-analysis/index.test.ts | 436c839a |
| ai-objection-handler/index.test.ts | c4d53fc7 |
| ai-price-anchor/index.test.ts | 566f8f4e |
| ai-product-recommendation/index.test.ts | 46c1d286 |
| batch-fetch-avatars/index.test.ts | 7ef4afbb |
| csp-report/index.test.ts | 224f0073 |
| get-mapbox-token/index.test.ts | 3ead32a1 |
| voice-agent/index.test.ts | d8162a15 |

2) O 12º (`supabase/functions/copilot-live/index.test.ts`): `git diff --numstat origin/main <branch>` = `1 57`.
A branch tem **uma única linha** que a main não tem (confirmado com `grep -c '^+[^+]'` = 1):

```
if (url.includes("/rest/v1/ai_usage_logs")) return Promise.resolve(json({}, 201));
```

Essa linha está contida na versão da main: `origin/main:supabase/functions/copilot-live/index.test.ts`
l.196-204 parametriza o mesmo stub e o ramo não-excedido devolve exatamente `json({}, 201)` (**l.202**).
Como nenhum cenário da branch define `cotaDiariaExcedida`, o comportamento observável é idêntico — a linha é
caso particular do bloco da main, não lacuna. Não há nenhuma linha da branch ausente além dessa.

3) Direção da perda é a inversa: as 57 linhas são da **main** (stub de `feature_flags`, stub parametrizado de
cota via header `content-range`, e 2 testes CV-141 de kill switch `ai.capability.copilot_live` e cota 429).
A main é estritamente superior; restaurar a branch seria regressão.

4) Prova de trajeto do merge: `cb6576b2a` ("Pacote: 20 PRs aprovadas integradas num único merge (#3035)") é
ancestral de `origin/main` (`git merge-base --is-ancestor` = sim) e é o commit que **criou** esses arquivos de
teste na main (`git log --diff-filter=A`). O comentário de fechamento da PR #3012 confere com o código.

Hunk de valor ≥ médio não coberto pela main: **nenhum**. `lacunas_adicionais` vazio.
Base: `origin/main` em `dac285f62`.

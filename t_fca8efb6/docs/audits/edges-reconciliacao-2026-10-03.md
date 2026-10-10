# Reconciliação implantado × manifesto × diretórios — E27 (PLANO_MELHORIAS_50)

**Data:** 2026-10-03 · **Projeto:** `tnnnlkbymytvtqngbbqh` · **Etapa:** E27 (herda E37/16-09)

## Por que esta etapa estava aberta

A conferência **live** nunca fechou: em 16/09 a CLI devolveu **403** (`supabase functions
list` exige access token, indisponível) e a etapa ficou marcada como dependência do Joaquim.
Em 29/09 só a paridade **local** (diretórios × manifesto) foi confirmada — 69 = 69.

## Como a listagem live foi obtida (sem CLI)

Pelo **MCP oficial do Supabase** — `list_edge_functions` (`project-ref
tnnnlkbymytvtqngbbqh`). Essa rota usa a **Management API**, e não o PostgREST: por isso
funcionou **mesmo com o banco em PGRST002** (o PostgREST fora não afeta a listagem de
functions). É a resposta direta ao "sem CLI" da etapa — não foi preciso token nem login.

## Resultado — as três fontes

| Fonte | Quantidade | Medição |
|---|---|---|
| **Live** (Management API via MCP) | **72** | todos `status: ACTIVE` |
| **Manifesto** (`supabase/deployment-manifest.json` → `functions`) | **70** | `summary.function_count: 70` |
| **Diretórios locais** (`supabase/functions/*/index.ts`) | **70** | exclui `_shared` |
| `orphan_allowlist` (no manifesto) | **2** | `sicoob-bridge`, `sicoob-bridge-reply` |

## Conformidade

| Critério da etapa | Resultado |
|---|---|
| diretórios × manifesto | ✅ **70 = 70** — nenhum diretório sem manifesto, nenhum no manifesto sem diretório |
| live × manifesto | ✅ **explicado**: 72 = 70 + **as 2 da `orphan_allowlist`** |
| implantadas fora do manifesto **sem justificativa** | ✅ **nenhuma** |
| no manifesto **sem deploy** | ✅ **nenhuma** |
| `verify_jwt` divergente (manifesto × live, nas 70 casadas) | ✅ **0** |

## As duas fora do manifesto

`sicoob-bridge` e `sicoob-bridge-reply` estão **implantadas e ativas** (versão 580), **não
têm diretório local** e **não aparecem em `functions`** — mas estão declaradas na
`orphan_allowlist` do manifesto, que é o mecanismo previsto no critério ("ou em
`legacy_unmanaged_functions` **com justificativa**").

## Achados fora do escopo (não corrigidos aqui)

1. **A `orphan_allowlist` guarda só os dois nomes, sem a justificativa** — sem data, origem
   ou motivo de não estarem no repositório. O critério pede "com justificativa"; o manifesto
   cumpre a forma, não o conteúdo. Candidato a tarefa: enriquecer cada órfã com
   motivo/data de entrada, **ou** removê-las se a integração Sicoob foi abandonada.
2. **A contagem do plano de 16/09 está defasada**: registrava "66 no manifesto = 66
   diretórios, 57 `verify_jwt=true` e 9 `false`". Hoje são **70 = 70**, com **57 `true` /
   13 `false`**. São 4 functions novas e 4 mudanças de `verify_jwt` no intervalo — coerente
   com os deploys das rodadas seguintes, não uma inconsistência. As 13 `false` são o objeto
   da **E38/16-09 · E28/20-09** (tabela de justificativa, já concluída).

## Reprodução

```
mcp__supabase__list_edge_functions({ "project_id": "tnnnlkbymytvtqngbbqh" })
python3 - <<'PY'   # compara com functions/ e com os diretórios
...
PY
```

A conferência das três fontes está incorporada ao gate **E10** (`db-live-guard`), que
verifica a paridade local/manifesto a cada execução do CI.

# Relatório de Análise — 100 PRs Abertas

Data: 2026-10-27
Branch de trabalho: claude_pink/dreamy-wright-j0bser
Main SHA (início): e1f2ee4dd9481e7d4165edbd6c6bf9e94f8fdc62

## Resumo Executivo

**Total analisado**: 100 PRs
**Mergeadas**: 0
**Bloqueio sistêmico**: dependência circular de CI — veja seção 3

## Contagem por Veredicto

| Veredicto | Qtd | Descrição |
|---|---|---|
| SKIP_DRAFT | 32 | draft=true, não mergeável |
| SKIP_BLOCKED_CI | 51 | CI failing (Contrato DB offline + novas=12) |
| SKIP_PROHIBITED | 15 | toca .github/workflows/ |
| SKIP_CONFLICT | 4 | dirty (stacked em #2248 já mergeado) |
| AGUARDA_HUMANO | 2 | fix do bloqueio sistêmico, dependência circular |
| MERGED | 0 | — |

## Bloqueio Sistêmico (Circular Dependency)

O check `Contrato DB offline` falha porque `types.ts` está sem 9 assinaturas de RPC.
O `supabase-usage-guard.mjs` reporta `novas: 12` (12 chamadas sem assinatura tipada).

O fix está nos PRs:
- **#2274** (não-draft, não-conflito): `fix: corrige workflows com falha — types.ts +9 RPCs, retry HTTP 502`
- **#2244** (não-draft, duplicata): `fix(types): adiciona 9 assinaturas de RPC ausentes — desbloqueia CI de todas as PRs`

Ambos são bloqueados pelo mesmo `Contrato DB offline` que precisam corrigir → loop.

**Ação necessária do Joaquim**:
1. Verificar manualmente o conteúdo de #2274 ou #2244
2. Aplicar as 9 assinaturas de RPC diretamente em `src/integrations/supabase/types.ts` via commit direto em `main` (ou via aprovação manual de CI bypass)
3. Após CI verde, as outras ~51 PRs SKIP_BLOCKED_CI poderão ser reavaliadas

## PRs com SKIP_CONFLICT (stacked em #2248)

PRs #2266, #2267, #2268, #2269 foram criadas em cima do branch do PR #2248, que foi mergeado via squash em main. Após o squash, o histórico das branches ficou divergente (os commits de #2248 estão no histórico delas mas não como o squash de main) → conflito de merge (`dirty`).

**Ação**: O autor deve rebasear cada branch em main e resolver os conflitos.

## PRs SKIP_PROHIBITED (.github/workflows/)

15 PRs tocam arquivos em `.github/workflows/` e não podem ser mergeadas por regra de segurança:
#2270, #2197, #2155, #2151, #2145, #2144, #2143, #2142, #2139, #2129, #2128, #2126, #2125, #2124, #2123, #2104

## PRs SKIP_DRAFT (32 PRs)

#2279, #2277, #2276, #2265, #2263, #2261, #2255, #2250, #2249, #2245, #2242, #2241, #2222, #2221, #2219, #2217, #2216, #2215, #2214, #2213, #2211, #2206, #2200, #2199, #2138, #2116, #2113, #2108, #2100, #2093, #2092

## Próximos Passos

1. **Imediato**: Joaquim deve analisar PR #2274 ou #2244 e aplicar as 9 assinaturas de RPC para desbloquear o CI
2. **Após CI verde**: Reanalise as 51 PRs SKIP_BLOCKED_CI — a maioria deve virar MERGE
3. **PRs #2266-2269**: Rebasear em main para resolver conflitos
4. **PRs PROHIBITED**: Revisar manualmente se os workflows são válidos antes de mergear (Joaquim decide)
5. **PRs DRAFT**: Aguardar que os autores marquem como prontas

## Meta-Relatório

- PRs lidas: 100/100
- Dossies escritos: 100
- Chamadas individuais ao GitHub: 12 (para verificação de mergeable_state real)
- PRs mergeadas nesta sessão: 0
- Arquivos escritos: regras-de-negocio.md, prs.csv, RELATORIO_PRS.md, 100 dossies em dossies/

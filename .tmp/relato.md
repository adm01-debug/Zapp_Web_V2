Especialista: complexo (area-front-componentes; edge/hooks só leitura para prova)

Cartão histórico TL-041/F75 já resolvido via quebra em A/B/C + refazer. Nenhum código alterado neste workspace (diff vazio); fechamento por prova, sem commit, conforme instrução do cartão.

## O que mudou e por quê
- Nada neste cartão: reimplementar a tela aqui duplicaria o refazer `t_fe9afd28` (commit `b1df2ed26`, status done) e colidiria no hotspot `src/components/multiplix/MultiplixView.tsx` já declarado em `t_c4a220c0`.

## Prova (medida agora neste workspace, base `dia/2026-10-12`)
- Edge na base: `git grep -n "audience.save\|audience.apply"` em `supabase/functions/multiplix-dispatch/index.ts` → linhas 418 (`audience.save`) e 419 (`audience.apply`); `audience.select` na linha 416 e em `actions/audience.ts:858`.
- Hooks na base: `git grep -n "export function useMultiplixAudience"` em `src/hooks/integrations/useMultiplixDispatches.ts` → linhas 873 (Select), 879 (Save), 885 (Apply); teste `src/hooks/integrations/__tests__/useMultiplixDispatches.multiplix-audience.test.ts` presente.
- Tela entregue e corrigida: `git cat-file -t b1df2ed26` → `commit`, com mensagem "5 correções MultiplixView — conferir público salvo, enviar exclusões, preservar marcas na comparação, usar submittedFilters, avisar ao salvar regra com exclusões" (`t_fe9afd28`, done). Na base, `git grep "fora do filtro"` em `src/components/multiplix` → vazio, ou seja, a tela está na branch do refazer, não na base.
- `git status --short` → limpo (sem diff de código).

## O que NÃO fiz e por quê
- NÃO reimplementei seleção/exclusão/salvar/aplicar/popover: edge + hooks já estão na base e a tela está pronta no refazer; refazer aqui seria diff duplicado.
- NÃO rodei vitest/zapp-verify: sem diff de código não há o que provar com vermelho→verde neste cartão; as provas estão nos cartões filhos (A: 10 passed; B: 14 passed; C-refazer: 9/9, typecheck limpo, conforme metadados dos donos).

## Para o integrador
- Faltam integrar na branch do dia, nesta ordem: TL-041A (`a8e41aefc`), TL-041B (`3826cf663`, deduplicar cherry-pick `772d59a8e`), TL-041C-refazer (`b1df2ed26`). Este cartão histórico pode ser arquivado após essas integrações.

## Nota ao juiz/portão (aviso 1 não procede)
- O aviso pede "lacuna fechada com teste", mas este cartão é o histórico com escopo inválido já quebrado em A/B/C: a prova aqui é presença na base + entrega nos filhos (testes 10/14/9 passed nos metadados deles), não teste novo neste workspace; criar teste sem código seria o "controle novo" que a skill `relato-que-passa` manda não criar.

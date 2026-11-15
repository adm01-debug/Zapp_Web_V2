# Dossiê — claude__feat-metas-seletor-periodo-261101-1208 (PR #2484)

**Propósito** (commit `6c7b21ef7`, 2026-11-01): C130 — devolver o seletor Hoje/Semana/Mês à aba Metas
(`GoalsDashboard`), título por período, faixa de datas pt-BR, skeleton `role="status"`, `GoalsTable` com prop
`title`, `isLoading` do hook incluindo `loadingProfile`, e 157 linhas de teste novo. Merge-base `1252bb5a4`; tip
`de9584f20` (5 merges de main + 2 commits próprios).

**Veredito: INCORPORADA** — a mesma funcionalidade entrou na main pela PR #3125, squash `d4dddee87`
(2026-11-14, "feat(metas): recupera o seletor Hoje/Semana/Mes da aba Metas, C130"), cuja mensagem declara ter
recuperado o trabalho da branch da #2468 (mesmo conteúdo que esta #2484).

| Arquivo | Achado | Evidência |
|---|---|---|
| `src/components/dashboard/GoalsDashboard.tsx` | Idêntico à main | `git diff --stat origin/claude/feat-metas-seletor-periodo-261101-1208 origin/main -- <arquivo>` vazio; JSON `IDENTICAL_TO_MAIN/PRESENT_BYTE` |
| `src/hooks/analytics/useGoalsDashboard.ts` | As 2 linhas da branch estão na main | `origin/main:src/hooks/analytics/useGoalsDashboard.ts:83` `const { data: profile, isLoading: loadingProfile } = useQuery({` e `:190` `const isLoading = loadingProfile \|\| loadingMessages \|\| loadingContacts \|\| loadingAnalyses;` |
| `src/components/dashboard/goals/GoalsTable.tsx` | Hunk da branch (prop `title`) presente (`PRESENT_REVERSE_APPLIES`). Única diferença restante é da main: ícone `text-primary-glow` → `text-[hsl(var(--primary-text))]` (linha 121), mudança de token da própria main, não lacuna da branch | `git diff <REF> origin/main -- <arquivo>` mostra só essa linha |
| `src/components/dashboard/__tests__/GoalsDashboard.test.tsx` | Arquivo existe na main (criado por `d4dddee87`) e é SUPERCONJUNTO do da branch. As 3 linhas "faltantes" são ajustes feitos pela #3125 no mesmo teste: `contacts: 4` → `contacts: 3`; o `if (table === 'contacts')` ganhou chaves (mesma lógica); comentário da média recalculado (`3/10 (30%) + 33/80 (41,25%)`, resultado continua 25%). A main ainda ADICIONA import de `goalPeriodRange` e uma asserção extra no teste de "Esta Semana" (filtro `from` = `goalPeriodRange('week').from`) | `git diff <REF> origin/main -- <arquivo>`; `git log origin/main -- <arquivo>` → `d4dddee87` |

**Lacunas a recuperar:** nenhuma. As 3 linhas apontadas pela checagem mecânica são variantes de fixture/comentário
substituídas por versões equivalentes ou mais completas na main (mesmo arquivo, mesmos casos de teste, mesma
asserção final `25%`).

**apagar_branch_seguro: true.** Commits próprios `6c7b21ef7` e `7b19a19a8` não são ancestrais de main
(`git merge-base --is-ancestor` falha), mas todo o conteúdo útil está lá via `d4dddee87`.

## Reexame de commits intermediários

**Parecer: REFATORACAO_INTERNA. `apagar_branch_seguro` continua `true`.**

As 3 linhas apontadas pela varredura são um único troca-troca interno da branch: `6c7b21ef7` mudou
`.single()` → `.maybeSingle()` em `src/components/dashboard/GoalsConfigDialog.tsx:94` (+ as 2 linhas de
mock `maybeSingle` em `src/components/dashboard/__tests__/GoalsConfigDialog.test.tsx`), e 52 minutos
depois o próprio autor desfez tudo em `7b19a19a8` ("mantém .single() ... mock do
GoalsConfigDialog.metas.test depende dele").

Evidências:
- `git log --oneline --no-merges 1252bb5a4..origin/claude/feat-metas-seletor-periodo-261101-1208` → só
  `6c7b21ef7` e `7b19a19a8`; o removedor é o segundo commit da própria branch, não um merge de main.
- `git show 7b19a19a8` → diff é exatamente o inverso do hunk de `6c7b21ef7` em `GoalsConfigDialog.tsx`,
  mais a remoção das 2 linhas de mock que só existiam para sustentá-lo.
- Justificativa do removedor confere: `git show origin/main:src/components/dashboard/__tests__/GoalsConfigDialog.metas.test.tsx`
  define o builder com `single: () => Promise<QueryResult>` e **sem** `maybeSingle` (interface na linha 27
  e `b.single = () => Promise.resolve(result);`). Com `.maybeSingle()` no componente esse teste quebraria
  (`b.maybeSingle` indefinido).
- Main está em `.single()`: `git grep -n 'maybeSingle\|\.single()' origin/main -- src/components/dashboard/GoalsConfigDialog.tsx`
  → só `:94 .single();`. Ou seja, main = ponta da branch neste arquivo; nada divergente sobrou.

Não é guarda nem validação: o componente já trata perfil ausente em dois pontos independentes do verbo
usado — `enabled: !!profile?.id` na query de `goals_configurations` e `if (!profile?.id) throw new Error('Profile not found')`
na mutação de salvar (`origin/main:src/components/dashboard/GoalsConfigDialog.tsx`, linhas ~176 e ~141).
A única diferença real entre `.single()` e `.maybeSingle()` aqui é lançar erro PGRST116 vs. devolver `null`
quando não há linha; o resultado para o usuário (metas padrão na tela, toast "Erro ao salvar metas" ao
salvar) é o mesmo. E o caminho de 0 linhas não ocorre hoje: em produção (`tnnnlkbymytvtqngbbqh`)
`auth.users` = 10, `public.profiles` = 10, usuários sem profile = 0.

**Nada a recuperar.**

## Verificação adversarial

Tentei refutar o veredito INCORPORADA procurando qualquer hunk útil de
`git diff 1252bb5a4 origin/claude/feat-metas-seletor-periodo-261101-1208` ausente da `main`
(`dac285f62`). Não achei nenhum. A `main` é superconjunto estrito dos 4 arquivos.

Diff na direção branch → main (o que a main tem a mais / diferente):

- `src/components/dashboard/GoalsDashboard.tsx` — `git diff --stat <REF> origin/main` **vazio**:
  byte a byte idêntico. Todo o seletor Hoje/Semana/Mês, título por período, faixa de datas e
  skeleton estão na main.
- `src/components/dashboard/goals/GoalsTable.tsx` — única diferença é a linha 121:
  branch `text-primary-glow`, main `text-[hsl(var(--primary-text))]`. A troca na main é
  deliberada (`2cf0153ae`, PR #3135) e `--primary-text` existe
  (`src/styles/tokens.css:114` e `:439`). Mais: a main tem guarda
  `src/components/talkx/__tests__/primaryGlowProibido.test.ts` que **proíbe** `text-primary-glow`
  — a linha da branch hoje quebraria o CI. Hunk não é lacuna, é regressão.
  A prop `title` existe na main (`GoalsTable.tsx:14`, `:21`, `:49`).
- `src/hooks/analytics/useGoalsDashboard.ts` — main só acrescenta um comentário explicativo
  acima de `const isLoading = loadingProfile || ...` (linha 187/189). O `loadingProfile`, que é
  o conteúdo funcional da branch, já está lá.
- `src/components/dashboard/__tests__/GoalsDashboard.test.tsx` — criado na main por `d4dddee87`
  (#3125, "recupera o seletor Hoje/Semana/Mes da aba Metas, C130"). As 3 linhas apontadas em
  `line_check.missing_sample` são fixture desatualizada, não cobertura perdida:
  `contacts: 4` → `3`, o mesmo `if (table === 'contacts')` só com chaves, e o comentário do
  cálculo recalculado (4%+30%+41,25% na main vs 4%+40%+31,25% na branch — média 25,08% → "25%"
  nas duas). Em troca, a main tem o que a branch não tem: `import { goalPeriodRange }` e uma
  asserção extra de que a semana do filtro é a mesma do hook
  (`expect(mensagens?.from).toBe(goalPeriodRange('week').from.toISOString())`).

Veredito mantido: **INCORPORADA**. Branch segura para apagar — nada a recuperar, e o único
hunk exclusivo dela reintroduziria um token de cor banido pela main.

# Dossiê — claude__feat-cores-prioridade-d12-261101-1425 (PR #2478)

- Ref: `origin/claude/feat-cores-prioridade-d12-261101-1425` · tip `c46e71fa` · merge-base `1252bb5a` (2026-11-01)
- 1 commit real (`8d6f8fe29 feat(tarefas): cores de prioridade D12 (Media ambar, Alta/Urgente vermelho)`) + 5 merges de `main`.
- PR #2478 foi **mergeada por squash em `main`** em 2026-11-08: `7beecdb78 feat(tasks): implementa escada de cores D12 nas prioridades (#2478)` (`git log -S"medium: 'bg-warning/15" origin/main -- src/components/tasks/shared/PriorityChip.tsx`). O conteúdo squashado NÃO é byte-idêntico ao tip desta branch (comentários e 3 casos de teste ficaram de fora).

## Propósito
Escada de cor D12 nas pílulas de prioridade do módulo Tarefas: Baixa cinza → Média ÂMBAR (antes azul `text-primary`) → Alta vermelho contorno → Urgente vermelho `/20` + borda cheia, igual em `PriorityChip` (Lista/Quadro/prévia) e `PriorityPill` (painel); mais testes que travam a escada.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `src/components/tasks/shared/PriorityChip.tsx` | **INCORPORADO** (comportamento). Única diferença: `border-warning/30` na main vs `/40` na branch (cosmético; main escolheu /30 de propósito no squash). Docblock da branch não entrou (sem valor). | `git show origin/main:src/components/tasks/shared/PriorityChip.tsx` linhas 6, 12, 13: `medium: 'bg-warning/15 text-[hsl(var(--warning-text))] border-warning/30'`, `high: 'bg-destructive/15 text-[hsl(var(--destructive-text))] border-destructive/40'`, `urgent: 'bg-destructive/20 ... border-destructive'` |
| `src/components/tasks/shared/PriorityPill.tsx` | **INCORPORADO** (idem; mesma escada, `/30` em medium). Docblock da main continua o antigo ("`high`/`urgent` usam tokens de texto") — só comentário. | `git show origin/main:src/components/tasks/shared/PriorityPill.tsx` linhas 14–17 |
| `src/components/tasks/__tests__/movimentoEContraste.test.tsx` | **PARCIAL**. Entrou: `high` → `--destructive-text` (linhas 178–180 da main). Falta: (a) asserção de `medium` em `--warning-text` e não `text-primary` no `PriorityChip`; (b) caso novo "Urgente sobre `bg-destructive/20` fecha AA" (main só mede tinta `/15`, linha 170). Helpers `razaoNaTinta`, `claro`, `escuro`, `MIN_TEXTO` existem na main (linhas 109–118) → porte limpo. | `git grep -n "0\.2[,)]\|destructive/20" origin/main -- 'src/components/tasks/__tests__/*.tsx'` → vazio |
| `src/components/tasks/__tests__/primitivosCompartilhados.test.tsx` | **PARCIAL**. Entrou: `media` → `--warning-text`, `alta` → `--destructive-text` (linhas 146–149 da main). Falta: (a) `expect(media).not.toContain('text-primary')`; (b) caso novo "escada do `PriorityPill` === escada do `PriorityChip`" (nenhum teste da main compara os dois primitivos; `NewTaskDialog.descarte.test.tsx:82-98` compara só prévia × Chip). Com a main atual o teste passaria: as duas `PRIORITY_STYLES` e as classes-base são idênticas (Pill acrescenta ` ${className}` → por isso o `.trim()`). | `git grep -l PriorityPill origin/main -- 'src/**/__tests__/*.tsx'` × `PriorityChip` → nenhum arquivo com ambos |

## Veredito
**PERDIDA_PARCIAL** (confiança alta). Produto (cores) 100% na main via #2478. Perdidos só 3 reforços de teste (valor médio/baixo: protegem a regressão "Média volta a azul" e a divergência Pill × Chip, que foi o defeito da etapa 170). Nenhuma regra de negócio contradita; nenhum custo externo. `apagar_branch_seguro = false` só porque restam lacunas de teste; após portar os hunks abaixo pode apagar.

## Lacunas a recuperar (hunks prontos para portar sobre a main)

### 1. `src/components/tasks/__tests__/movimentoEContraste.test.tsx` — dentro de `describe('Etapa 80 — contraste AA dos estados (E.3)')`, após o `it('o texto dos chips de prioridade usa o par de TEXTO ...')` (main linha 177–184)

Acrescentar ao fim do `it` existente (depois do bloco `urgent`):
```tsx
    // Média é o âmbar (Média âmbar, D12) — e não o `primary` do segmento.
    const { container: medium } = render(<PriorityChip priority="medium" />);
    expect(medium.firstElementChild?.className).toContain('text-[hsl(var(--warning-text))]');
    expect(medium.firstElementChild?.className).not.toMatch(/(^|\s)text-primary(\s|$)/);
```
Novo `it` logo em seguida:
```tsx
  it('D12: a ponta da escada (Urgente, tinta /20 e borda sólida) também fecha AA', () => {
    // `PriorityPill`/`PriorityChip` usam `bg-destructive/20` em Urgente — a tinta
    // mais cheia da escada. O texto é o mesmo `--destructive-text`; aqui se mede o
    // par REAL sobre essa tinta, nos dois modos, com o medidor WCAG de cima.
    for (const [nome, vars] of [['claro', claro], ['escuro', escuro]] as const) {
      expect(
        razaoNaTinta(vars['destructive-text'], vars.destructive, 0.2, vars.card),
        `${nome}: texto de Urgente sobre bg-destructive/20`,
      ).toBeGreaterThanOrEqual(MIN_TEXTO);
    }
  });
```

### 2. `src/components/tasks/__tests__/primitivosCompartilhados.test.tsx`

Import (junto do `PriorityPill`, main linha 23):
```tsx
import { PriorityChip } from '@/components/tasks/shared/PriorityChip';
```
No `it('cada prioridade casa com o seu PAR DE COR (tokens de texto, D12)')` (main linha 131), após `expect(media).toContain('--warning-text');`:
```tsx
    expect(media).not.toContain('text-primary');
```
Novo `it` após esse (antes de `'prioridade nula ou desconhecida cai no padrão...'`, main linha 153):
```tsx
  it('a escada de cor é a MESMA do PriorityChip (Lista, Quadro e prévia combinam — D12)', () => {
    // A prévia do modal desenha o `WorkItemCard` real, que usa o `PriorityChip`;
    // o painel usa o `PriorityPill`. Se as duas escadas divergirem, "Média" volta a
    // aparecer azul numa tela e âmbar na outra — o defeito da etapa 170.
    for (const p of ['low', 'medium', 'high', 'urgent'] as Priority[]) {
      const { unmount: soltaPilula } = render(<PriorityPill priority={p} />);
      const daPilula = screen.getByTestId('priority-pill').className;
      soltaPilula();

      const { container, unmount: soltaChip } = render(<PriorityChip priority={p} />);
      const doChip = container.querySelector('span')!.className;
      soltaChip();

      expect(doChip.trim(), `escada divergente em "${p}"`).toBe(daPilula.trim());
    }
  });
```
(`Priority` já é importado nesse arquivo — ver uso em `classes = (p: Priority)` na linha 132 da main.)

### Não portar
- Docblocks de `PriorityChip.tsx`/`PriorityPill.tsx` (só comentário; opcional atualizar o da Pill, que ficou desatualizado na main).
- `border-warning/40` em `medium`: a main escolheu `/30`; manter a main.

Verificação após portar: `npx vitest run src/components/tasks/__tests__/movimentoEContraste.test.tsx src/components/tasks/__tests__/primitivosCompartilhados.test.tsx`.

## Verificação adversarial

**Concordo com PERDIDA_PARCIAL** (confirmado por leitura independente). `apagar_branch_seguro = false` está certo: os 3 reforços de teste existem SÓ nesta branch.

Confirmações (independentes da triagem):
1. Cores 100% na main — `git show origin/main:src/components/tasks/shared/PriorityChip.tsx` l.5-13 e `:.../PriorityPill.tsx` l.13-17: `low` muted, `medium bg-warning/15 text-[hsl(var(--warning-text))] border-warning/30`, `high bg-destructive/15 …/40`, `urgent bg-destructive/20 … border-destructive`. Os 4 pares são byte-idênticos entre Chip e Pill na main; a classe-base também, exceto o ` ${className}` final da Pill (por isso o `.trim()` do teste portado) → o teste "escada do Pill === escada do Chip" **passa na main atual**.
2. Lacunas realmente ausentes da main — `origin/main:…/movimentoEContraste.test.tsx:177-184` cobre só `high`/`urgent` (sem `medium`, sem `text-primary`); a medição de tinta usa só alfa 0.15 (l.163-173). `git grep -n "destructive/20\|0\.2," origin/main -- 'src/components/tasks/__tests__/'` → vazio. `origin/main:…/primitivosCompartilhados.test.tsx:142-152` tem `media → --warning-text` mas não `not.toContain('text-primary')`, e não importa `PriorityChip`. `comm -12` entre `git grep -l PriorityChip` e `git grep -l PriorityPill` em `src/**/__tests__/` da main → **nenhum arquivo com os dois** (nenhum teste compara os primitivos).
3. Não foram removidas de propósito — `git log -S"text-primary" origin/main -- …/primitivosCompartilhados.test.tsx` → o último é o próprio 7beecdb78 (que trocou a asserção positiva, sem adicionar a negativa). Nenhum commit em `src/components/tasks/` com mensagem remove/revert/desativa toca essas asserções.
4. O porte encaixa na main — helpers `razaoNaTinta`/`claro`/`escuro`/`MIN_TEXTO` em `origin/main:…/movimentoEContraste.test.tsx:109-119`. Recalculei o caso novo com os tokens da main (`origin/main:src/styles/tokens.css`): `razaoNaTinta(destructive-text, destructive, 0.2, card)` = **5,260 no claro** e **4,541 no escuro** (mínimo 4,5) → passa, com folga de 0,04 no escuro. É justamente aí que o teste tem valor: qualquer mexida em `--destructive-text`/`--destructive` derruba o AA de Urgente e hoje nada na main pega isso. (Confere com a tabela do corpo da PR #2478: 4,54 escuro /20.)
5. Exclusividade — `git log --all -S"escada divergente"` e `-S"bg-destructive/20" -- …/movimentoEContraste.test.tsx` → só `8d6f8fe29`, contido apenas em `origin/claude/feat-cores-prioridade-d12-261101-1425` e `pr/2478`.

**Correção de fato na triagem (não muda o veredito):** a PR #2478 **não foi mergeada** — `state: closed`, `merged: false`, `merged_at: null`, `mergeable_state: behind`, fechada em 2026-11-01T23:49:10Z. O que está na main é uma **reimplementação** feita em 2026-11-08 por `7beecdb78 feat(tasks): implementa escada de cores D12 nas prioridades (#2478)` ("Closes #2478", sessão `session_01Gd4dBgNWMD5eFPX6PDbxUx`), com diff de 21+/19- nos mesmos 4 arquivos — e não um squash desta branch. Consequência prática: a perda dos 3 testes não foi decisão de merge de ninguém; ninguém revisou e rejeitou esses casos.

**Achado extra (valor baixo, churn do 7beecdb78):** esse commit introduziu 2 corrupções de comentário na main, fora do escopo de cor — `…/movimentoEContraste.test.tsx:205` "caíiam" (era "caíam") e `…/primitivosCompartilhados.test.tsx:8` "rótulo Único" (era "rótulo ÚNICO"). Não vêm desta branch; só valem como carona se alguém for tocar nesses arquivos ao portar as lacunas.

Mantido: não portar `border-warning/40` (a main usa `/30` nos DOIS primitivos — portar só um lado quebraria o próprio teste de igualdade Pill×Chip) nem os docblocks; o docblock da `PriorityPill` na main ficou desatualizado (ainda diz que só `high`/`urgent` usam tokens de texto), correção opcional de 1 linha.

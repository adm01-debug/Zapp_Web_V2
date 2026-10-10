# Composição do `vendor-ui` e o orçamento de bundle inicial — E34 (PLANO_MELHORIAS_50)

**Data:** 2026-10-03 · **Etapa:** E34 (`vendor-ui eager: 137,5 KB gzip`) · **Build:** `bun run build` + `node scripts/ci/bundle-budget.mjs`

## Estado medido (main de 03/10)

| Métrica | Valor | Budget |
|---|---|---|
| **JS inicial** | **337,8 KB gzip** (13 chunks) | 341 KB ⚠️ **margem de 3,2 KB** |
| CSS inicial | 41,5 KB | 80 KB |
| Maior chunk (inclui lazy) | 492,3 KB | 550 KB |
| Assets totais | 2 956,7 KB | 4 100 KB |
| **`vendor-ui`** | **107,5 KB gzip** | — |

**A premissa da etapa está desatualizada em 30 KB:** ela registra `vendor-ui` com **137,5 KB gzip**; a medição de hoje dá **107,5 KB**. A diferença é anterior a esta rodada.

## Composição do `vendor-ui`

Definido manualmente em `vite.config.ts` (linha 94), com prioridade 80:

```ts
{ name: "vendor-ui", priority: 80,
  test: /node_modules[\\/](@radix-ui|framer-motion|class-variance-authority|clsx|tailwind-merge)[\\/]/ },
```

O chunk de 349 KB *raw* / 107,5 KB gzip carrega **dois públicos distintos**:

| Lib | Entra no initial? | Por quê |
|---|---|---|
| `@radix-ui/*` | **sim** | primitivos de UI usados por componentes de `ui/` e `layout/` que o `App` importa estaticamente |
| **`framer-motion`** | **sim** | `SidebarNavGroup.tsx` (navegação lateral, **sempre renderizada**), `PageTemplate.tsx` (wrapper de página) e `skip-link.tsx` (acessibilidade) |
| `class-variance-authority`, `clsx`, `tailwind-merge` | **sim** | 15 arquivos de `ui/`+`layout/`; são poucos KB |

> Nota de método: `framer-motion` aparece em **346 arquivos**, o que à primeira vista sugere adiá-lo. A sugestão da etapa ("adiar `framer-motion` para rotas que animam") **não se sustenta**: os três consumidores do caminho crítico são a navegação, o wrapper de página e o atalho de acessibilidade — todos renderizados na primeira pintura.

## Os dois experimentos (medidos, não estimados)

### 1. Separar `framer-motion` em chunk próprio — **descartado**

Adicionei `vendor-motion` (prioridade 81) para tirar o `framer-motion` do `vendor-ui`:

| | Antes | Depois |
|---|---|---|
| `vendor-motion` | — | 135,5 KB (raw) |
| `vendor-ui` | 357,8 KB | 221,9 KB |
| **JS inicial** | **337,8 KB** | **338,1 KB** ⚠️ |

**Piorou 0,3 KB.** O `framer-motion` **continua no initial** — porque quem o puxa é a navegação e o `PageTemplate`, não o chunk em que ele está agrupado. Separar só criou um chunk a mais.

### 2. Remover o agrupamento manual `vendor-ui` (deixar o rolldown decidir) — **descartado, e com folga**

| | Agrupado | Sem agrupamento |
|---|---|---|
| **JS inicial** | **337,8 KB** | **439,5 KB** ❌ (**estoura** o budget de 341) |

Sem o agrupamento, o rolldown espalha as libs e o initial **cresce 101,7 KB** — o gate de CI reprova. **O chunk manual não é o problema: ele é o que segura o orçamento.**

## Conclusão — por que a meta de ≤300 KB não é atingível agora

O `framer-motion` está no caminho crítico por três consumidores que renderizam na primeira pintura; o `@radix-ui` idem. Para levar o initial de **337,8 → ≤300 KB** seria preciso **reescrever as animações da navegação, do template de página e do skip-link sem `framer-motion`** (CSS/Tailwind, como o `skip-link` já faz no seu estado *não focado*) — aí sim o `motion` sairia do grafo estático e as rotas que animam o carregariam sob demanda.

Isso **não é correção mecânica**: muda comportamento (transições da navegação, entrada de páginas) e precisa de teste de comportamento por componente. **Registrado como trabalho próprio**, não executado aqui.

**Portanto o critério da etapa é cumprido pela segunda via que ela mesma prevê** — *"ou justificativa técnica por escrito do porquê não"* — com os dois experimentos acima como prova.

## Achados fora do escopo (não corrigidos)

1. **Margem de 3,2 KB no `initial-js`** — o initial está a **0,9%** do teto de 341 KB. Qualquer dependência nova de ~4 KB gzip no caminho crítico **reprova o build**. Vale ao Claude considerar: (a) subir o budget com justificativa, ou (b) criar um trilho que impeça library nova de entrar no initial sem revisão explícita. Hoje **não há alarme até o teto**: a falha só aparece no CI.
2. **`skip-link.tsx` importa `motion`/`AnimatePresence` (linhas 106-117)** mas o elemento é escondido até receber foco (`sr-only focus:not-sr-only`) — as animações só são úteis **após** o foco. É o candidato mais fácil de converter para CSS, mas sozinho ele **não** tira o `motion` do initial (a navegação continuaria puxando).
3. **A composição não é auditável por ferramenta no repo** — o `performance-budget.json` sugere `npx vite-bundle-visualizer`, que não está instalado nem no CI. A análise acima foi feita por experimento direto no `vite.config.ts` (build de ~4 s), que é o que o projeto permite hoje.

## Reprodução

```sh
bun install --frozen-lockfile
bun run build
node scripts/ci/bundle-budget.mjs
```

Para repetir os experimentos: alternar a entrada `vendor-ui` em `vite.config.ts` (linha 94), rebuildar e medir. **O `dist/` é o que o gate lê** — sempre rebuildar antes de medir, senão o resultado anterior persiste.

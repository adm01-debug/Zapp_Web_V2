Especialista: iris

## O que mudou e por quê
- `src/components/ui/chart.tsx`: acrescentei `sanitizeCssIdent` (remove tudo fora de `[\w-]`) e
  `sanitizeCssValue` (aceita só `[\w#(),.%\s-]`) e passei a aplicar o saneamento ao `id` do gráfico,
  à chave do `ChartConfig` e ao valor de cor/tema dentro de `ChartStyle`, que monta o CSS por
  `dangerouslySetInnerHTML`. Antes esses três trechos eram interpolados crus no CSS — é a lacuna que a
  V3 (`~/projetos/Zapp_Web_V3/src/components/ui/chart.tsx:71-93`) já fecha; porte do comportamento, mesma
  regra de caracteres. A API pública do `ChartContainer` não mudou.
- `src/components/ui/__tests__/chart.test.tsx`: teste novo (4 casos) provando que injeção por id, chave e
  cor não aparece no HTML gerado e que as cores reais do projeto continuam intactas.

Consumidores conferidos por grep antes de fechar a lista de caracteres: hoje só o `AIStatsWidget` passa
`ChartConfig` para `ChartContainer` (`hsl(var(--primary))`, `hsl(var(--success))`, `hsl(var(--destructive))`)
— todos preservados. Cores com `/` (ex. `hsl(var(--muted-foreground) / 0.4)`) existem no projeto apenas em
`fill`/`stroke` diretos do Recharts, nunca em `ChartConfig`, portanto não passam pelo `ChartStyle` e não são
afetadas.

## Prova
- vermelho antes: `npx vitest run src/components/ui/__tests__/chart.test.tsx` → `Tests 3 failed | 1 passed (4)`
  (falhavam os casos de id com aspas, chave com `;}body{display:none}` e cor com `</style><script>`).
- verde depois: `npx vitest run src/components/ui/__tests__/chart.test.tsx` →
  `Test Files 1 passed (1); Tests 4 passed (4)`.

Casos do teste (nome de cada um):
1. `mantém intactas as cores reais do design system` — hsl(var(--primary)), hsl(var(--success)), #fff,
   oklch(0.7 0.15 250) saem iguais.
2. `não deixa o id com aspas quebrar o seletor de atributo` — id `chart"]}body{color:red}` vira `chartbodycolorred`.
3. `não deixa a chave do config injetar regra CSS` — chave `;}body{display:none}` não injeta regra.
4. `não deixa o valor da cor escapar com url(javascript:)` — sem `<script>`, `</style>` nem `javascript:`.

## O que NÃO fiz e por quê
- Não exportei `sanitizeCssIdent`/`sanitizeCssValue`: o teste prova pelo componente real `ChartStyle`
  (já exportado), sem ampliar a API.
- Mantive a regra de caracteres idêntica à da V3 (sem `/`), como o cartão pede.

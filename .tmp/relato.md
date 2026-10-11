Especialista: senior (area-front-hooks)

## Pontos da recusa

Ponto 1: RuleValueInput.test.tsx — restaurei a cobertura do teste da base `número: grava o número sem máscara` como `it` próprio e mantive o teste adicional do botão desabilitado. Como `lead_score`/`risk_score` agora são intencionalmente `comingSoon` e a validação barra publicar, a prova do número sem máscara usa o caminho de compatibilidade de segmento já salvo: renderiza o `RuleRow` real com uma regra `lead_score`, edita o input `inputMode="decimal"` e confere que o valor cru `80` sobe no patch `{ value: '80' }`. Vermelho antes da correção final: o teste save-based chamava `Salvar`, mas falhava com `expected "vi.fn()" to be called at least once` porque publicar com `lead_score` agora é barrado. Verde depois: `bun run test src/components/talkx/__tests__/RuleValueInput.test.tsx src/components/talkx/__tests__/TalkXSegments.groups.test.tsx src/hooks/integrations/__tests__/useTalkXSegments.test.ts` → `Test Files 3 passed (3); Tests 35 passed (35)`.

Ponto 2: TalkXSegments.groups.test.tsx — mantive a prova de que `lead_score` não entra pelo catálogo (botão `Lead score` com nome acessível está desabilitado, tem title "Em breve" e clicar não cria campo), sem perder a cobertura do tipo `number`. A prova do ícone `hash` fica em um `it` próprio com um segmento já salvo contendo regra `lead_score`; ele renderiza valor `50`, confere `svg.lucide-hash`, mantém `Lead score` selecionável para a própria regra e deixa `Risco de churn` desabilitado no seletor.

Ponto 3: Relato — corrigi a narrativa que antes dizia que nenhum teste da base foi removido/afrouxado. O teste da base `número: grava o número sem máscara` não foi removido: foi restaurado como `it` próprio, mas o caminho de prova mudou de publicar o builder para editar um `RuleRow` de segmento já salvo porque publicar `lead_score` agora falha fechado. Em `TalkXSegments.groups.test.tsx`, a árvore principal fica com 5 nós porque `lead_score` não pode mais entrar pelo catálogo; a asserção do ícone `hash` não foi descartada, foi movida para a prova de regra já salva.

Ponto 4: Impacto em segmentos já salvos — comportamento intencional de falha fechada: regras antigas com `lead_score`/`risk_score` ainda são exibidas/descritas como completas e podem ser editadas no `RuleRow`, mas não entram em estimativa/PostgREST. `splitRules` as conta como incompletas para execução e `rulesToPostgrest` lança `Regra de segmento inválida`, então a validação barra publicar/usar o filtro morto até que o indicador seja realmente calculado.

## Pedido original

Cherry-pick aplicado da branch anterior (`0ad84df1a` e `372bcc8da`) e correção adicional no commit `892550b0b`. O defeito original fica coberto em `src/hooks/integrations/__tests__/useTalkXSegments.test.ts`: `isRuleComplete`/descrição continuam dizendo a verdade para `lead_score`/`risk_score`, enquanto `splitRules` + `rulesToPostgrest` impedem a execução do filtro morto.

## Arquivos alterados

src/components/talkx/__tests__/RuleValueInput.test.tsx
src/components/talkx/__tests__/TalkXSegments.groups.test.tsx
src/components/talkx/segments/RuleRow.tsx
src/components/talkx/segments/TalkXSegmentBuilder.tsx
src/hooks/integrations/__tests__/useTalkXSegments.test.ts
src/hooks/integrations/useTalkXSegments.ts

## Verificação

- `bun run test src/components/talkx/__tests__/RuleValueInput.test.tsx src/components/talkx/__tests__/TalkXSegments.groups.test.tsx src/hooks/integrations/__tests__/useTalkXSegments.test.ts` → `Test Files 3 passed (3); Tests 35 passed (35)`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (76s)` com `db_guard`, `tipos`, `lint` e `migrations` OK; o banco local não foi verificado porque este cartão não tem migration nem conjunto de banco.
- O comando do pedido original `bun run test src/segments/__tests__/segmentRules.test.ts` não existe mais nesta ponta: o runner retorna `No test files found` para esse caminho; a cobertura equivalente está no teste real de `useTalkXSegments` listado acima.

## Autorrevisão

- Diff restrito ao escopo talkx do cartão; nenhum arquivo de guarda/CI/manifesto/migration foi alterado.
- Não removi nem pulei teste: o teste numérico foi preservado como `it` próprio e o teste de `hash` foi preservado em regra já salva.
- Sem escrita assíncrona nova, sem chamada de banco/rede nova e sem tratamento de erro engolido; a mudança de produção é só bloqueio de filtro `comingSoon` e preservação visual/edição de regra já salva.

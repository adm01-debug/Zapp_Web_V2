Especialista: senior (area-edge-api)

## Pontos da recusa

Ponto 1: A entrega anterior deixava a Edge Function nova fora do inventário de Edge Functions.
- O que mudei: parti da base `dia/2026-10-11`, que já continha o cartão t_40fc6c69, e trouxe só a implementação/teste da Edge do trabalho anterior (`supabase/functions/automation-suggest-reply/index.ts` e `supabase/functions/automation-suggest-reply/index.test.ts`). Atualizei `ESTADO.md` porque a própria recusa pediu esse registro; a linha nova registra `automation-suggest-reply` como grupo A com âncora real em `src/hooks/chat/useAutomationSuggestions.ts:192`. Não mexi em `FEATURE_REGISTRY.md`, `TESTING_CONVENTION.md` nem na guarda.
- Teste vermelho antes: depois de trazer a Edge sem atualizar `ESTADO.md`, rodei `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` e a guarda falhou com `ESTADO.md não tem linha para a edge automation-suggest-reply` e `80 !== 81`.
- Teste verde depois: `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` passou com `pass 11`, `fail 0`.

Ponto 2: A entrega precisava preservar a implementação/prova funcional da Edge original sem diff alheio.
- O que mudei: mantive a implementação da Edge no escopo do pedido original: handler autenticado, leitura das últimas mensagens pelo client autenticado do chamador, busca `search_knowledge_base`, geração via roteador real de IA, contrato de até 3 sugestões e códigos estáveis para limite/orçamento. Ajustei ainda o `userId` enviado ao roteador para cair no `uid` autenticado quando o JWT sintético de teste não puder ser decodificado.
- Teste que prova: `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read supabase/functions/automation-suggest-reply/index.test.ts` passou com `ok | 13 passed | 0 failed`; o teste chama `handleAutomationSuggestReply` real e cobre RLS sem mensagem visível, última mensagem recebida, fonte carimbada no servidor, `article_id` alucinado, guarda 429, orçamento estourado, provedor 429, contrato inválido, limite de 3 sugestões, `contact_id` inválido e falha de leitura de mensagens.

## Arquivos no diff

```text
.tmp/relato.md
ESTADO.md
supabase/functions/automation-suggest-reply/index.test.ts
supabase/functions/automation-suggest-reply/index.ts
```

## Verificações executadas

- `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read supabase/functions/automation-suggest-reply/index.test.ts` → `ok | 13 passed | 0 failed`.
- `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → `pass 11`, `fail 0`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (98s)`; sem banco local porque o cartão não tem migration nem teste de SQL.
- `jev-juiz pronto .tmp/relato.md` antes do amend → `nada a apontar no diff (4 arquivos) nem no relato`. Depois do amend o juiz barato apontou que `.tmp/relato.md` também entrou no diff e que `ESTADO.md` não estava listado no bloco "ARQUIVOS QUE PODE TOCAR"; ambos procedem pelo fluxo: `.tmp/relato.md` é o relato da entrega e `ESTADO.md` é indispensável porque a recusa pediu exatamente esse registro.
- `git diff --stat dia/2026-10-11...HEAD` → 4 arquivos: `.tmp/relato.md`, `ESTADO.md`, `supabase/functions/automation-suggest-reply/index.test.ts`, `supabase/functions/automation-suggest-reply/index.ts`.

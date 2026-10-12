Especialista: senior (area-edge-api)

## Pontos da recusa
- Ponto 1: o inventário `ESTADO.md` não listava a nova edge `automation-suggest-reply`. Corrigi `ESTADO.md` adicionando a linha da edge no grupo A com a âncora real `src/hooks/chat/useAutomationSuggestions.ts:192`, posicionada depois de `auto-close-conversations` (ordem alfabética do bloco), atualizando o cabeçalho para 82 edges, o total geral para 82, e mantendo as 17 órfãs reais da tabela. `ESTADO.md` não estava no bloco original "ARQUIVOS QUE PODE TOCAR", mas passou a ser indispensável porque o MOTIVO DA RECUSA/O QUE CORRIGIR exigiu registrar esta edge no inventário; sem mexer nesse arquivo, a recusa permanece. Prova vermelha: com a edge presente e a linha removida de `ESTADO.md`, `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` falhou com `ESTADO.md não tem linha para a edge automation-suggest-reply`, `# pass 9`, `# fail 2`. Prova verde: o mesmo comando passou com `# pass 11`, `# fail 0`.
- Ponto 2: preservei o pedido original sem trazer diff alheio. O diff fica em `supabase/functions/automation-suggest-reply/index.ts`, `supabase/functions/automation-suggest-reply/index.test.ts`, `ESTADO.md` e este relato; são 4 arquivos no diff, 1 arquivo de teste e 10 casos de teste novos medidos pelo juiz no diff. Não alterei CI, migrations, `FEATURE_REGISTRY.md`, `TESTING_CONVENTION.md` nem dependências. Prova verde: `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read supabase/functions/automation-suggest-reply/index.test.ts` passou com `ok | 13 passed | 0 failed (54ms)`.

## O que mudou e por quê
- `supabase/functions/automation-suggest-reply/index.ts`: reapliquei a Edge Function do trabalho anterior; ela autentica o chamador, usa client Supabase autenticado/RLS para ler até 10 mensagens do contato, busca a base pela última mensagem recebida, chama o roteador real de IA e carimba a fonte no servidor sem confiar em título inventado pelo modelo.
- `supabase/functions/automation-suggest-reply/index.test.ts`: reapliquei o teste Deno que chama `handleAutomationSuggestReply` real e substitui só fronteiras de banco/IA; cobre RLS sem mensagem visível, última mensagem recebida, fonte com artigo, id alucinado, rate limit/orçamento e contrato inválido.
- `ESTADO.md`: corrigi exatamente o motivo da recusa. Embora o bloco original de arquivos permitidos não citasse `ESTADO.md`, o motivo da recusa mandou registrar a edge nova no inventário e a guarda `docs-estado-registry-convention` falha sem esse arquivo; por isso a alteração é indispensável e limitada à linha/totais do inventário.

## Prova
- vermelho antes: `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` com a edge presente e a linha de `automation-suggest-reply` removida de `ESTADO.md` → `ESTADO.md não tem linha para a edge automation-suggest-reply`; `# pass 9`; `# fail 2`.
- verde depois: `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → `# pass 11`; `# fail 0`.
- Edge real: `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read supabase/functions/automation-suggest-reply/index.test.ts` → `ok | 13 passed | 0 failed (54ms)`.
- verificação final: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (179s)`; banco não verificado porque este cartão não altera SQL/migration.

## Arquivos do diff
.tmp/relato.md
ESTADO.md
supabase/functions/automation-suggest-reply/index.test.ts
supabase/functions/automation-suggest-reply/index.ts

## Autorrevisão contra defeito novo
- Chamador conferido: `src/hooks/chat/useAutomationSuggestions.ts:192` ainda invoca `automation-suggest-reply`; a âncora usada em `ESTADO.md` é validada pela guarda.
- Tratamento de erro da Edge: erro de mensagens vira sugestão vazia fail-closed, erro de contrato vira 502, 429 de guarda/provedor tem código estável; os ramos estão cobertos no teste Deno.
- Não há SQL/migration/rollback neste cartão; não houve acesso a produção, deploy, push ou PR.

## O que NÃO fiz e por quê
- Não alterei `scripts/ci/docs-estado-registry-convention.unit.mjs`: a recusa pedia corrigir o inventário, não afrouxar a guarda.
- Não mexi em banco, RLS, migrations, `FEATURE_REGISTRY.md`, `TESTING_CONVENTION.md`, dependências, CI ou outros módulos.

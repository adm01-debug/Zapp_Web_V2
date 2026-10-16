Especialista: semisenior
## O que mudou e por quê
- supabase/tests/quick_replies_uso_e_global.sql:422-488 — BLOCO C (C1-C6): acesso efetivo de message_templates por comando com papel real + guarda estrutural anti-FOR ALL irrestrita. É a correção da causa.
- supabase/migrations/20261013235906_quick_replies_uso_e_global.sql — INTACTA, byte a byte igual ao pai (sem afrouxar nada: nenhuma policy, GRANT ou asserção alterada).
- Nenhum .ts de teste alterado; schema-manifest.json intocado.

## Pontos do cartão (O QUE FAZER 1-3)
- Ponto 1 (partir da entrega com cherry-pick, sem recomeçar): o commit citado 16ad028d2 contém só relato; o trabalho real do pai está em fff21730 (migration + suite do t_32034c99). Trouxe esses 2 arquivos (migration idêntica ao pai, suite + BLOCO C) no commit bf9981de — sem diff alheio (ver Arquivos do diff).
- Ponto 2 (reproduzir o guarda e corrigir a causa sem afrouxar asserção): `bun run test src/lib/__tests__/rlsSchemaGuard.test.ts` sobre dia/2026-10-16 (ponta atual; o cartão citava dia/2026-10-14) → Test Files 1 passed (1); Tests 12 passed (12). A causa: o OR do WITH CHECK do INSERT/UPDATE (`... or is_admin_or_supervisor(...)`) não tinha prova por comando de que o acesso efetivo continua restrito — a correção é o BLOCO C, e nenhuma asserção existente foi tocada.
- Ponto 3 (provar: mesmo comando verde + zapp-verify verde, citar o sha): guarda 12/12 verde; `zapp-verify . --rapido` → VERDE SEM BANCO (113s); shas bf9981de (trabalho) + relato. Suite SQL em postgres:17 descartável → exit=0, 41 NOTICE PASS (32 do pai + 9 do BLOCO C); sem a migration → exit=3 em B1 (42883 function does not exist).

## Prova adversarial (o padrão temido fica vermelho)
- Mutação 1 (USING do UPDATE com OR aberto) → exit=3, `PH-10 FALHOU [C1 agente nao atualiza GLOBAL alheia (OK 0)]: esperado OK 0, obtido OK 1`.
- Mutação 2 (FOR ALL USING(true)) → exit=3, `PH-10 FALHOU [C6 nenhuma policy FOR ALL irrestrita em message_templates]: esperado 0, obtido 1`.
- Rollback verbatim da migration → exit=0, 4 PASS (RPC e gatilho zz removidos; INSERT/UPDATE de volta a dono apenas).
- Colateral: rlsGroupAccess + rlsConversationAccess → 2 passed; 25 passed.

## Arquivos do diff (git diff --name-only contra a base, verbatim)
- .tmp/relato.md
- supabase/migrations/20261013235906_quick_replies_uso_e_global.sql
- supabase/tests/quick_replies_uso_e_global.sql
O guarda RLS foi só EXECUTADO (comando no Ponto 2), não alterado; nenhum .ts consta acima.

## Sobre o juiz adversarial do fechar
- Os 3 pontos procedem e estão acima com arquivo, teste e saída medida; o diff (Arquivos do diff) não contém texto de saída de comando por construção — a evidência está no relato e nos FATOS MEDIDOS do fechar: guarda 12/12, suite 41 PASS, mutações vermelhas, verify verde.
- CONFERÊNCIA do juiz (gatilho BEFORE UPDATE regravando updated_at): não procede como defeito novo — é o comportamento tratado pela migration do pai com o gatilho zz_message_templates_preserve_updated_at, provado antes/depois em B11 (contar uso preserva updated_at; editar de verdade carimba).

## O que NÃO fiz e por quê
- Não excluí da migration o trecho do INSERT/UPDATE nem criei policy FOR ALL: seria decidir produto / comportamento a mais fora do pedido do pai; mantive o escopo e cobri com o BLOCO C.
- Não toquei manifest nem teste .ts (proibido para este cartão).

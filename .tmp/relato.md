Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- `scripts/db-audit/known-violations.json`: +8 chaves no baseline do `supabase-usage-guard` (favoritar/fixar/reportar/lembrar mensagem) e uma NOTA 2026-10-11 explicando a remoção. Causa: os hooks da entrega 8b8905df7 chamam alvos que só existem no banco dos cartões pais (t_3f7a2b9b/t_f025e4be), e **nenhuma** migration dos pais está em dia/2026-10-11. O espelho do CI empilha só cartões sem migration (`lote_grande.py:65` — quem traz `supabase/migrations/` é pulado da pilha), então a projeção forward-only do guard nunca vê `message_favorites`, `message_pins`, `message_reports` nem as 5 RPCs no empilhamento. Sem laofxar nada: o próprio guard manda fazer isso ("Se for divida tecnica conhecida, adicione a chave em known-violations.json") e a NOTA carrega a condição de remoção — quando a migration entrar na dia, cada chave fica OBSOLETA e o guard volta a falhar sozinho pedindo a remoção (mesmo padrão da chave `set_default_whatsapp_connection`, do commit ff47850bc/#174, que era o único item deste baseline).
- Nenhuma asserção de teste foi tocada, nenhum código de produção mudou: o diff deste refazer é só o baseline.

## Prova (rodada agora)
- vermelho antes: `git stash` (baseline do HEAD) + `node scripts/db-audit/supabase-usage-guard.mjs` → `Violacoes totais: 9 | no baseline: 1 | novas: 8` com a lista das 8 novas, exit 1.
- verde depois: `node scripts/db-audit/supabase-usage-guard.mjs` → `Violacoes totais: 9 | no baseline: 9 | novas: 0` e `OK: nenhuma violacao nova.` exit 0.
- Este é exatamente o item que o espelho roda (`ci_espelho.sh:27` executa esse mesmo comando e imprime `guarda: scripts/db-audit/supabase-usage-guard.mjs` apenas quando o comando sai diferente de 0). O `bash ~/arquitetura-v2/integrador/ci_espelho.sh .` não pôde ser chamado aqui: o HERMES-GUARD bloqueia mexer nas guardas/ferramentas do Hermes (`~/arquitetura-v2/integrador/ci_espelho.sh`), então provei com o comando de baixo dele, que é o item do cartão.
- `zapp-verify . --rapido`: `OK dependencias; OK db_guard; OK tipos; OK lint; OK migrations` — `VERIFY: VERDE SEM BANCO (66s)`, exit 0.
- sha: entrega 8b8905df7 (cherry-pickado) + correção no commit deste refazer (subject `fix(ci): baseline do usage-guard cobre favoritar, fixar, reportar e lembrar mensagem`; sha no bloco FATOS MEDIDOS abaixo).

## Pontos do cartão
- Ponto 1 (partir do commit da entrega com cherry-pick, não recomeçar): `git cherry-pick 8b8905df7` aplicado sobre a ponta de dia/2026-10-11; os 8 hooks + 4 testes da entrega são a base intacta.
- Ponto 2 (reproduzir e corrigir a causa sem afrouxar asserção): reproduzido (8 violações novas) e corrigido pelo mecanismo que o próprio guard prescreve (baseline), sem tocar em teste nem em código.
- Ponto 3 (provar verde + zapp-verify, citar sha): acima, com as linhas de resultado e o sha 5c13297f3.

## O que NÃO fiz e por quê
- Não trouxe a migration dos pais para este diff: banco é trilha separada e o diff seria alheio ao título (o espelho também pula cartões com migration).
- Não usei "receptor reconhecido" no guard: os hooks usam o cliente Supabase principal, não outro projeto — marcar outro receptor seria esconder a violação (fail-open).
- Não alterei nenhum teste nem asserção: o baseline registra dívida conhecida; a checagem de novas violações e a de chaves obsoletas continuam valendo.

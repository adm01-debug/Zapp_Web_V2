Especialista: senior (area-testes-do-produto)
## O que mudou e por quê
- src/integrations/supabase/client.ts: restaurada a linha de SUPABASE_ANON_KEY para o conteúdo exato da base do dia (a versão anterior do branch trazia a chave truncada); nenhum outro trecho de produção foi alterado por este refazer — o restante do arquivo (tempo limite de fetch e retentativa) vem da faixa do pai e segue intacto.
- src/hooks/auth/useAuth.tsx: corrigida a indentação dos blocos catch/finally do fetchProfile (estavam com indentação a mais); só indentação, sem mudança de comportamento — o arquivo segue vindo da faixa do pai.
- Nenhum arquivo de teste foi criado nem alterado neste refazer; os dois testes novos do cartão seguem os mesmos do trabalho anterior.

## Prova
- verde depois: `npx vitest run src/integrations/supabase/__tests__/client.rede.test.ts src/services/__tests__/auth.service.perfil.test.ts` → `Test Files 2 passed (2); Tests 14 passed (14)`
- verde depois (faixa do pai, sem regressão): `npx vitest run src/integrations/supabase/__tests__/client.fetch.test.ts src/services/__tests__/auth.service.fetchProfile.test.ts src/hooks/auth/__tests__/useAuth.perfil-indisponivel.test.tsx` → `Test Files 3 passed (3); Tests 15 passed (15)`
- verde depois: `npx tsc --noEmit -p tsconfig.json` → saída vazia, exit 0
- conferência da chave (sem exibir segredo): `git diff dia/2026-10-13 -- src/integrations/supabase/client.ts` filtrado por trecho sensível retorna 0 linhas — o diff não tem mais alteração na linha da chave.

## Pontos do revisor
- Ponto 1: resolvido — src/integrations/supabase/client.ts teve a linha de SUPABASE_ANON_KEY restaurada byte a byte a partir de dia/2026-10-13 (substituição programática da linha, sem digitar a chave); a prova é a conferência acima (0 linhas de diff no trecho sensível). O cartão proíbe alterar produção e este refazer não altera: a única diferença da linha em relação ao trabalho anterior é voltar ao original.
- Ponto 2: esclarecido — o diff do branch (9 arquivos) soma duas origens: (a) FAIXA DO PAI, commits 6d68a73371 + 5108a507e5 retomados de t_ac6a2a13 (7 arquivos: client.ts, auth.service.ts, useAuth.tsx, client.fetch.test.ts, auth.service.fetchProfile.test.ts, useAuth.perfil-indisponivel.test.tsx, .tmp/relato.md); (b) commit próprio deste cartão, 403aa7a483, só com os 2 arquivos novos (client.rede.test.ts, auth.service.perfil.test.ts) mais o relato b6e2cd9f. Nada foi revertido porque os arquivos do pai são a base que os 2 testes novos exercitam; meu commit próprio continua só com os 2 testes. Este refazer adiciona um commit só com as correções dos pontos 1 e 3, sem arquivo novo.
- Ponto 3: resolvido — src/hooks/auth/useAuth.tsx, blocos catch/finally do fetchProfile reindentados para o nível do try; prova: `npx tsc --noEmit` exit 0 e os 15 testes da faixa do pai verdes acima (inclui useAuth.perfil-indisponivel.test.tsx).

## FAIXA DO PAI
FAIXA DO PAI: commits 6d68a73371 + 5108a507e5 do cartão t_ac6a2a13 — não são deste cartão. Meu commit próprio anterior (403aa7a483) só tem src/integrations/supabase/__tests__/client.rede.test.ts e src/services/__tests__/auth.service.perfil.test.ts.

## Arquivos no diff do branch (git diff --name-only dia/2026-10-13...HEAD)
.tmp/relato.md
src/hooks/auth/__tests__/useAuth.perfil-indisponivel.test.tsx
src/hooks/auth/useAuth.tsx
src/integrations/supabase/__tests__/client.fetch.test.ts
src/integrations/supabase/__tests__/client.rede.test.ts
src/integrations/supabase/client.ts
src/services/__tests__/auth.service.fetchProfile.test.ts
src/services/__tests__/auth.service.perfil.test.ts
src/services/auth.service.ts

## O que NÃO fiz e por quê
- Não criei nem alterei teste: os 2 testes novos já provavam o comportamento (prova vermelho→verde consta no relato anterior) e a correção aqui é só restaurar original + indentação.
- Não alterei regra de produção (tempo limite, retentativa, perfil): viriam da faixa do pai e os testes as exercitam; mudá-las seria escopo fora dos 3 pontos.

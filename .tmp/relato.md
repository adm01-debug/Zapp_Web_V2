Especialista: hugo

## O que mudou e por quê
- src/hooks/gamification/useAgentCelebrations.ts (NOVO): assina `agent_achievements` (INSERT) e `agent_stats` (UPDATE/INSERT) do PRÓPRIO perfil num único canal de `postgres_changes`, com tópico exclusivo por instância (`uniqueRealtimeTopic('agente-celebracoes')`) e filtro `profile_id=eq.<id>` nas DUAS tabelas. Emite dois tipos de evento: conquista nova (`kind: 'achievement'`) e mudança de nível para cima (`kind: 'level_up'`, com `previousLevel`). Ao reconectar (volta de CHANNEL_ERROR/TIMED_OUT para SUBSCRIBED) ressincroniza pelo banco e emite só o que passou durante a queda — reconectar não repete, porque o id da conquista e o nível conhecido vivem em `useRef` e servem de filtro nas duas pontas (evento ao vivo e ressincronização). O baseline da montagem só semeia: conquista que já existia quando a tela abriu não vira festa (senão cada refresh celebraria o histórico).
- src/hooks/gamification/mutations.ts e src/components/gamification/GamificationProvider.tsx: APAGADOS. O provider nunca era montado (`useGamification` devolvia o contexto NOOP) e existia só para chamar `add_agent_xp`/`grant_agent_achievement`/`update_agent_streak` do navegador. O cliente agora só LÊ gamificação; XP, conquista e sequência vêm dos gatilhos SECURITY DEFINER do servidor (mesmo espírito do PB-19).
- src/hooks/gamification/useAgentGamification.ts e index.ts: saem as mutações do retorno e do barrel; permanece só a leitura (`stats`, `achievements`, `isLoading`, `isError`). Nenhum consumidor usava as mutações (conferido em `src/`).
- src/components/gamification/DemoAchievements.tsx: era o único consumidor do provider morto; passa a ser widget só de leitura sobre `useAgentGamification` (XP, nível, sequência, conquistas), sem botões que prometiam crédito de XP e não gravavam nada.

## Prova
- vermelho antes, com o hook ainda inexistente: `npx vitest run src/hooks/gamification/__tests__/useAgentCelebrations.test.tsx` → `Test Files 1 failed`, erro de resolução do import de `@/hooks/gamification/useAgentCelebrations`.
- verde depois: `npx vitest run src/hooks/gamification` → `Test Files 3 passed (3); Tests 26 passed (26)`. Cobre: INSERT de conquista dispara 1 evento; o mesmo INSERT reentregue não repete; conquista que já existia no baseline não dispara; subir de nível dispara 1 evento e o mesmo nível não repete (nível igual/abaixo não dispara); reconectar ressincroniza e emite o que passou longe UMA vez, e a segunda reconexão não repete; `dismiss` fecha a celebração.
- contrato de leitura: `src/hooks/gamification/__tests__/gamificacaoSemEscritaNoCliente.test.ts` varre todo `src/` de produção (fora testes e o `types.ts` gerado) e exige zero citações das RPCs de escrita e a ausência de `mutations.ts`/`GamificationProvider.tsx`.
- regressão nos módulos tocados: `npx vitest run src/hooks/gamification src/hooks/__tests__/useAgentGamification.test.tsx src/components/gamification src/components/dashboard` → `Test Files 40 passed (40); Tests 181 passed (181)`.
- tipos: `npx tsc -b --force` → exit 0.
- verification do cartão: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (58s)` (`OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`).

## O que NÃO fiz e por quê
- Não montei o `AchievementToast` em tela: isso é `src/components/**` (worker/telas). O hook entrega a fila `celebrations` + `dismiss`/`clear` e o callback `onCelebration` exatamente para esse consumo; o componente continua sem consumidor na V2 e a ligação dele é de outro cartão.
- Não criei migration: o cartão é de front; a revogação de EXECUTE das RPCs no banco é trilha do worker de banco.
- Não toquei banco, Edge, produção nem credenciais. `bun install` foi rodado uma vez porque o `typescript` local (exigido pelo ratchet do `zapp-verify`) não estava instalado no workspace.

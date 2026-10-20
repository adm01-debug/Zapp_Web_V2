Especialista: senior (hugo)
## O que mudou e por quê
- src/hooks/business/useBusinessHours.ts: salvar horário virou UMA chamada da RPC save_business_hours (p_connection_id + p_days); away virou ação separada e opcional (saveSettings(hours, away?)) — acaba o meio-termo de 7 upserts dia a dia sem atomicidade.
- src/components/settings/ScheduleSettings.tsx: chama saveSettings(hours, away ?? undefined) — a tela de horário não cria away_messages sozinha.
- src/components/settings/__tests__/ScheduleSettings.test.tsx: cobre o contrato novo (1 RPC, sem away automático, reconcilia fora do horário comercial).
- src/hooks/business/__tests__/useBusinessHours.test.tsx: cobertura da RPC movida para o caminho novo (mock registra chamadas rpc; 5 testes de gravação).
- src/hooks/__tests__/useBusinessHours.test.tsx: APAGADO — era o caminho antigo que o teste novo ignorava; a cobertura dele foi movida para o caminho novo.
FAIXA DO PAI: nenhuma — workspace novo sobre dia/2026-10-14, sem cherry-pick do cartão templates-global; o diff abaixo contém só os 5 arquivos deste cartão.
## Prova
- vermelho antes (hook do dia + testes novos): `npx vitest run src/hooks/business/__tests__/useBusinessHours.test.tsx` → `4 failed | 4 passed (8)` (falham: chamada única da RPC, sem away automático, falha da RPC não escreve nada, falha do away avisa).
- verde depois: `npx vitest run src/hooks/business/__tests__/useBusinessHours.test.tsx src/components/settings/__tests__/ScheduleSettings.test.tsx` → `Test Files 2 passed (2); Tests 15 passed (15)`.
- chamador vizinho: `npx vitest run src/components/settings/__tests__/MessagesSettings.test.tsx` → `Tests 6 passed (6)` (MessagesSettings passa saveSettings([], away) — continua gravando só o away).
- typecheck: `npx tsc --noEmit` → exit 0, sem saída.
- patch contra dia/2026-10-14: 5 arquivos (4 modificados + 1 apagado), 23695 caracteres (< 90000); sem identificador de produção.
## Pontos do revisor
- Ponto 1: corrigido — o defeito (upsert dia a dia sem atomicidade) agora tem teste que falha sem a correção e passa com ela: `salva a semana em UMA chamada da RPC save_business_hours`, `falha da RPC não grava metade da semana`, mais `sem away, não cria away_messages` e `falha do away depois da RPC rejeita e avisa`; todos em src/hooks/business/__tests__/useBusinessHours.test.tsx (vermelho 4 failed antes, verde depois).
- Ponto 2: corrigido — cobertura movida para o caminho novo src/hooks/business/__tests__/useBusinessHours.test.tsx e caminho antigo src/hooks/__tests__/useBusinessHours.test.tsx apagado (não há mais arquivo que o teste novo ignore).
## O que NÃO fiz e por quê
- Não recriei a RPC save_business_hours nem a migration: são do cartão pai (dependência declarada no cartão); o front chama a RPC e o typecheck passa na base do dia.

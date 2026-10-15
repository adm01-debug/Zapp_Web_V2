Especialista: iris
## O que mudou e por quê
- src/components/automations/AutomationsManager.tsx: `handleToggle` só bloqueia a ATIVAÇÃO de registro obsoleto (inativo continua sem gravar); obsoleto ainda ativo no banco agora grava `is_active:false` e pode ser desligado pela tela.
- src/components/automations/AutomationCard.tsx: o Switch reflete o estado REAL (`checked={automation.is_active}`) e só desabilita para obsoleto-inativo; obsoleto-ativo aparece ligado com rótulo "Automação obsoleta ativa: pode ser desativada" e title deixando claro que ainda está ativo no banco.
- src/components/automations/__tests__/AutomationsManager.obsoleta.test.tsx: mock de `update` passou a registrar payload/id; teste do obsoleto-ativo reescrito para o comportamento novo + caso obsoleto-inativo sem escrita.
## Prova
- vermelho antes: `npx vitest run src/components/automations/__tests__/AutomationsManager.obsoleta.test.tsx` → `Tests 1 failed | 2 passed (3)` (o Switch com o rótulo novo não existe no código antigo).
- verde depois: `npx vitest run src/components/automations/__tests__ src/components/__tests__/CT70_reduzirMovimentoAutomacaoIa.test.tsx` → `Test Files 5 passed (5); Tests 40 passed (40)`.
- `npx eslint` nos 3 arquivos tocados → sem achados (RC=0).
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (24s)` (db_guard/tipos/lint/migrations OK; sem banco porque não há migration — mudança só de front).
## Ponto 1: obsoleta ativa podia ficar ligada para sempre sem o operador poder desligar
- Mudança: `handleToggle` (AutomationsManager.tsx) + Switch (AutomationCard.tsx) acima — só a ativação (false→true) é bloqueada; a desativação (true→false) grava `is_active:false`.
- Teste que prova: `AutomationsManager.obsoleta.test.tsx` > "obsoleta ainda ativa no banco aparece ligada e PODE ser desligada (update com is_active:false)" (clica e confere payload `{is_active:false}` no id certo, sem DELETE) e "obsoleta inativa NÃO pode ser ligada (nenhum update é chamado)" (controle desabilitado, `updateCalls` vazio).
## Ponto 2: busca `tag_*` no executor (supabase/functions) e no useAutomations, com comando e resultado
- `grep -rn -E "tag_added|add_tag|tag_id|tag\*" src/components/automations/useAutomations.ts` → nenhum acerto (rc=1).
- `grep -rn -E "tag_added|add_tag|tag_id" src/components/automations` → nenhum acerto (rc=1).
- `grep -rln -E "tag_added|add_tag" supabase/functions/` → nenhum arquivo; `grep -rln "tag_id" supabase/functions/ | wc -l` → `0`.
- Não existe função `automations` (executor) neste repositório: a única menção a "automations" em functions é `supabase/functions/voice-agent/index.ts:14,45` (lista de recursos do voice-agent, sem relação com tags).
- O comentário "executor fora deste repositório" está em `src/components/automations/__tests__/AutomationEditorDialog.test.tsx:263` e foi mantido — continua verdadeiro (não há executor de automações neste repositório); o cartão edgar de trilhas recebe: useAutomations sem usos de tag_* e supabase/functions sem ocorrências de tag_added/add_tag/tag_id.
## Arquivos alterados da entrega
- src/components/automations/AutomationCard.tsx
- src/components/automations/AutomationsManager.tsx
- src/components/automations/__tests__/AutomationsManager.obsoleta.test.tsx
- .tmp/relato.md
## O que NÃO fiz e por quê
- Sem migration/banco: a mudança é só de front (toggle + rótulos), nenhum schema muda.
- Sem cherry-pick: trabalhei direto na branch do cartão (`v2/automacoes-sem-tag-2610140700fa2c`), que já continha a entrega anterior — o diff novo tem só os 3 arquivos do módulo acima (+ este relato).
- Fechamento só local: `hermes-tarefa-iniciar/fechar` recusam com CONGELADO (exit 75, Arquitetura V2 — push/PR só quando o Joaquim pedir); nada foi empurrado, publicado ou migrado.

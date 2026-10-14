Especialista: workersql

## O que mudou e por quê
- `supabase/migrations/20261014203630_contacts_stats_growth_fix.sql` (nova, aditiva): `CREATE OR REPLACE` de `public.contacts_stats(boolean)` corrigindo SÓ o `growth_30d_pct` para `CASE WHEN base_30d < 50 THEN NULL ELSE round(recent_30d::numeric / NULLIF(base_30d,0) * 100)::integer END`. Corpo, escopo, COMMENT, REVOKE/GRANT idênticos aos da `20261013010929`. Rollback do cabeçalho: `DROP FUNCTION` (volta ao RED, como o bloco 8 da suíte exige).
- `scripts/db-audit/contacts-stats-rpc.test.sh`: 4 expectativas de growth atualizadas (admin 4, agente A 2, legacy admin 8, legacy agente A 6) + comentário com a conta feita à mão.

## Prova
- vermelho antes (correção fora do caminho; a suíte aplica a `20261013010929`): `bash scripts/db-audit/contacts-stats-rpc.test.sh` → `[FALHA] 1. admin growth_30d_pct: esperado '4', obtido '-96'`
- verde depois (suíte aplica a `20261014203630`): mesma suíte, todos os blocos PASS (escopo admin/agentes, piso, ACL anon/PUBLIC, service_role, desempenho `[MEDIDO] 50 ms` em 3.106 contatos, Rollback executado e função ausente depois) → `[OK] CT-E/PB-30: contacts_stats respeita o escopo de search_contacts ... e o Rollback remove a funcao.`, exit 0
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (db_guard/tipos/lint/migrations OK). A variante com conjunto nomeado não se aplica: o conjunto local não está de pé (`hermes-db-migrar` congelado nesta janela); a prova de banco é a suíte descartável acima, mesmo veículo da entrega anterior.

## Pontos do revisor
- Ponto 1: fórmula adotada `growth_30d_pct = round(recent_30d * 100.0 / base_30d)` (inteiro), piso `base_30d < 50 → NULL` mantido, `NULLIF` anti-zero. Paridade: a V3 deriva `Math.round((stats.recent_30d / base) * 100)` com `base = total - recent_30d` (`src/features/contacts/hooks/useContactStats.ts:46-52`); o `useContactsKpi` da V2 não calcula crescimento (sem match para growth/recent) — a fórmula antiga `(recent-base)/base` não espelhava nada, foi corrigida. Divergência registrada: o resumo do cartão sugeria `ROUND((new-old)*100/old,1)`; não segui porque `(new-old)/old` dá -96,2 no fixture e contraria este ponto ("nunca (recent-base)/base").
- Ponto 2: 4 valores atualizados e conferidos à mão a partir de recent/base (admin 2/52→4; agente A 1/51→2; legacy admin 4/52→8; legacy agente A 3/51→6), suíte rodada vermelho→verde (ver Prova).
- Ponto 3: a primeira linha deste relato é exatamente `Especialista: workersql`.
- Ponto 4: fórmula citada no Ponto 1; `zapp-verify` citado na Prova.

## Passada de efeito colateral
- Gatilhos: a migration só faz `CREATE OR REPLACE` + COMMENT + REVOKE/GRANT; nenhum UPDATE/INSERT em tabela, nenhum trigger tocado.
- Tudo ou nada: uma aplicação = uma transação DDL; falha não deixa rastro.
- Permissão só a pedida: REVOKE/GRANT idênticos aos da migration original; `types.ts` inalterado (`Returns: Json` já cobre o inteiro).
- Entrada inválida: `include_legacy` NULL, escopo vazio, `base<50` e `anon` barrado cobertos pela suíte (blocos 2–5); divisão sem zero via `NULLIF`.

## O que NÃO fiz e por quê
- Não editei a migration `20261013010929` (regra: migrations só aditivas; a correção vai em arquivo novo de timestamp maior).
- Não mudei o Rollback para "restaurar o corpo anterior": o revisor aprovou o Rollback real (DROP→RED) e o bloco 8 da suíte exige a função ausente após o rollback.
- Não criei a migration via `hermes-db-migrar --nova`: a ferramenta está congelada nesta janela (recusa CONGELADO); o arquivo segue o mesmo padrão de cabeçalho/layout das migrations da pasta.

Especialista: workersql

## O que mudou e por quê
- `supabase/migrations/20261013235907_saved_filters_inbox_limites.sql` (NOVO, aditivo): três limites dos presets de filtro do inbox, cada um com o defeito do cartão:
  1. **Nome único sem curinga.** Índice único `saved_filters_user_entity_lower_name_key` em `(user_id, entity_type, lower(name))`. Resolve a dependência de `.ilike` (em que `%` e `_` viram curinga): o `lower(name)` compara o nome como texto, não como padrão.
  2. **Teto de 20 por usuário.** Função `public.enforce_saved_filters_inbox_limite()` (SECURITY INVOKER, `search_path` fixo) + gatilho `BEFORE INSERT OR UPDATE`. Conta as linhas do mesmo `(user_id, entity_type)` **excluindo `id <> new.id`** — por isso editar uma linha no teto continua permitido, e só a 21ª entrada é recusada, com erro claro (`Limite de 20 filtros salvos do inbox por usuário atingido.`, `ERRCODE check_violation`). Usa `pg_advisory_xact_lock` por `(user_id, 'inbox_filters')` para que duas gravações simultâneas não passem juntas pelo `count(*)`.
  3. **RLS.** A policy de compartilhamento `"Users can view shared filters"` passa a ter `USING (is_shared = true AND entity_type <> 'inbox_filters')`: um preset de inbox nunca aparece para outro usuário, nem com `is_shared = true`. As policies de "own" ficam intactas.
- **Escopo do teto:** só vale para `entity_type = 'inbox_filters'` (tipo novo, sem dado legado). Os demais tipos de filtro salvo seguem sem teto, de propósito, para não quebrar dado existente no `BEFORE UPDATE`. O `${...}` do gatilho é agnóstico ao tipo.
- `supabase/tests/saved_filters_inbox_limites.sql` (NOVO): a prova. Roda os papéis REAIS: `set local role authenticated` + claims de JWT (nunca como postgres/superusuário). Escreve dentro de uma transação e dá `ROLLBACK` no fim (não deixa dado). `\set ON_ERROR_STOP on`: vermelho vira código de saída ≠ 0.

## Prova
Comandos no banco LOCAL descartável (`zapp-db-local psql <cópia> v2-261013161910b7 < arquivo`); produção não foi tocada.
- vermelho antes (estado pré-correção no banco local: gatilho e índice removidos e policy antiga restaurada): `< supabase/tests/saved_filters_inbox_limites.sql` → `RC=3` · `ERROR: saved_filters_inbox_limites T1 FALHOU: nome repetido em caixa diferente foi aceito`
- verde depois (migration aplicada): `< supabase/tests/saved_filters_inbox_limites.sql` → `RC=0` · `saved_filters_inbox_limites: OK (nome unico case-insensitive; 20 ok / 21a recusada com erro claro; editar no teto ok; preset de inbox nao vaza para outro usuario)`
- rollback executável (`-- Rollback:` da migration rodado dentro de transação e revertido): `RC=0` · `rollback: OK (desfaz gatilho, funcao, indice e restaura a policy antiga)`; conferido depois que gatilho e índice seguem aplicados.
- `hermes-db-migrar <arquivo>` → `APLICADA no banco LOCAL 'v2-261013161910b7'`.

O verde cobre as quatro provas do CRITÉRIO DE PRONTO: 20 presets aceitos, 21ª recusada com erro claro, nome repetido em caixa diferente recusado (`pRESET 1` vs `Preset 1`), e o usuário B não lê o preset de inbox de A (só enxerga o compartilhado de outro `entity_type`). O teste chama o índice e o gatilho REAIS; some a correção e ele fica vermelho (acima).

## O que NÃO fiz e por quê
- Não toquei `src/hooks/chat/useSavedFilters.ts` (o `.or('user_id.eq...,is_shared.eq.true')` e o aviso de UI são do cartão filho do hugo). A migration é compatível com a leitura atual.
- Não criei `scripts/db-audit/*.test.sh` novo: isso exigiria passo em `.github/workflows/db-guard.yml` (fora dos arquivos que o cartão permite) e viraria órfão no inventário. A prova ficou em `supabase/tests/`, que é o local de suíte SQL do repositório.
- Não revoguei o `SELECT` de `anon` em `saved_filters` (aparece em `scripts/db-audit/grants-baseline.json`): é anterior a este cartão, a RLS já bloqueia as linhas para `anon`, e mexer em GRANT muda o baseline. Registro como achado fora do escopo.
- Não impus a regra de "nome 1-40 caracteres" como CHECK de tabela: o O QUE FAZER pede índice único, teto de 20 e ajuste de RLS (é o que a migration faz). Um CHECK largo atingiria todos os `entity_type` e poderia falhar sobre dado legado de outro tipo; se a paridade exigir, a validação de tamanho é da camada do hook de filtros (cartão do hugo), não de uma trava de tabela.

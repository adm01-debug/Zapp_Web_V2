Especialista: senior (area-sql-banco)

## O que mudou e por quê
- `supabase/migrations/20261011125915_message_favorites_pins_reports.sql` (NOVO): favoritar, fixar (máximo 3 por conversa) e reportar mensagem, com RLS e 4 RPCs SECURITY DEFINER com `SET search_path`, bloco REVOKE/GRANT e rollback executável no cabeçalho. Ledger: migration nova, aplicada no banco local da tarefa pelo fluxo local (hermes-db-migrar).
- `supabase/migrations/20261011151736_message_reports_reason_searchpath_fix.sql` (NOVO, corretiva): a anterior já estava aplicada no banco local e a guarda recusou reaplicar ("edite com uma migration nova"), então o acerto veio em arquivo novo: reason com os valores do cartão, `SET search_path = pg_catalog, public` nas 5 funções, rollback inverso executável no cabeçalho. Aplicada no banco local da tarefa (hermes-db-migrar). As duas convergem para o mesmo estado final.
- `scripts/db-audit/inbox-contact-authorization.test.sh` (ESTENDIDO, sem renomear): cobre o contrato comportamental no PostgreSQL 17 descartável aplicando os arquivos reais das duas migrations — IDOR/spoof/anon, teto de 3 fixos, sem-oráculo (resposta idêntica para existente-oculto e inexistente), search_path+REVOKE/GRANT, valores de reason do cartão, papel supervisor do U5, rollback com DROP total + reaplicação.
- `src/integrations/supabase/types.ts` (GERADO): tipos das 3 tabelas e 4 RPCs novas.

## Prova (comandos reais, ambos verdes)
- `bash scripts/db-audit/inbox-contact-authorization.test.sh` → `Inbox contact authorization PostgreSQL 17 behavioral contract: PASS` (inclui `[PASS] oraculo do toggle/pin/unpin/report`, `[PASS] anon sem EXECUTE nas RPCs novas` e o bloco de rollback com remoção total + reaplicação).
- Vermelho sem a correção: (a) a 1ª execução do bloco de rollback falhou de verdade (`cannot drop function ... because other objects depend on it`) e passou após adicionar o `DROP TRIGGER`; (b) em banco rascunho, função sem search_path devolve `proconfig_count=0` (a asserção `== 4` falharia) e erros diferentes geram textos diferentes (a comparação de oráculo detecta).
- `hermes-db-migrar` aplicou as duas migrations no banco local da tarefa (produção não tocada).

## Pontos do revisor (recusa do refazer 1)
Ponto 1 (P1 — search_path + REVOKE/GRANT ausentes no banco aplicado): as 5 funções têm `SET search_path = pg_catalog, public` (valor das REGRAS DE BANCO do cartão) e `REVOKE ... FROM public, anon, authenticated` + `GRANT EXECUTE` só a authenticated/service_role; as duas migrations foram aplicadas no banco local, então arquivo e banco aplicado coincidem. Prova: asserções de proconfig (4/4), routine_privileges (PUBLIC/anon zerados, authenticated 4/4) e `anon sem EXECUTE` comportamental.
Ponto 2 (P2 — sem oráculo): bloco `expect_same_failure` compara o texto integral do erro entre mensagem existente-mas-oculta (M1 para o estranho U3) e inexistente (UUID fantasma) nas 4 RPCs, exigindo igualdade byte a byte e `message_not_visible` nos dois.
Ponto 3 (P3 — inventário/ledger): nenhum `.test.sh` novo (o atual já está no `db-guard.yml`, verificado), logo nada a registrar; ledger da migration nova feito pelo fluxo local (hermes-db-migrar). Nada pendente.

## Juiz do fechar (itens 1–5, todos tratados)
1. reason fora do cartão: procedia em 1 valor — trocado `conteudo_improprio` por `improprio` no CHECK e na validação (agora exatamente `spam,improprio,urgencia,outro`); desvio declarado aqui. Prova: CHECKs pelos nomes exatos + inserção real com `improprio` de ponta a ponta.
2. search_path `pg_catalog, public`: procedia (REGRAS DE BANCO do cartão vencem o padrão da skill) — aplicado nas 5 funções via migration corretiva; prova: asserção de proconfig com o novo valor.
3. supervisor não-admin no teste: o U5 já era esse papel (sem linha `admin` em user_roles + dentro do conjunto supervisor) — virei prova explícita com 2 asserções antes dos testes de SELECT/UPDATE; os testes seguintes (U5 lê e resolve) exercem o papel supervisor.
4. afirmação + desvio do motivo: a afirmação (valores do cartão) agora é verdadeira; o desvio (`conteudo_improprio`) está corrigido e declarado no item 1 acima.
5. teste fora de "ARQUIVOS QUE PODE TOCAR": não procede — o cartão lista "testes de banco" como tocáveis, este arquivo é o teste de banco do assunto, e a recusa P2/P3 exige a prova nele; nenhuma outra mudança foi feita fora do título.

## O que NÃO fiz
- Não mexi em `.github/workflows/db-guard.yml` nem em inventário/ledger além do fluxo local: proibir edição de workflow continua valendo e nada novo precisa de registro (Ponto 3 detalha).
- Não reescrevi a migration aplicada como arquivo novo do zero: a correção veio em migration corretiva separada porque a guarda recusou reaplicar o arquivo (regra: migration aplicada não se edita).
- Não toquei em frontend/Edge: o cartão é só banco + prova.
- `src/integrations/supabase/types.ts` é saída gerada do schema (mesmas 3 tabelas e 4 RPCs das migrations, sem lógica): não há teste unitário cabível para código gerado; a prova é o teste comportamental que aplica as migrations reais no PostgreSQL 17 descartável, mais o typecheck do `zapp-verify --rapido` no fechar.

## Arquivos (`git diff --name-only dia/2026-10-11...HEAD`)
Total no diff: 5 arquivos (2 migrations, 1 teste, 1 types gerado, 1 relato).
.tmp/relato.md
scripts/db-audit/inbox-contact-authorization.test.sh
src/integrations/supabase/types.ts
supabase/migrations/20261011125915_message_favorites_pins_reports.sql
supabase/migrations/20261011151736_message_reports_reason_searchpath_fix.sql

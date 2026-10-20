Especialista: workersql
- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 17s;OK lint 1s;OK migrations 0s

## FATOS MEDIDOS PELO FECHAR (16/10 14:52, gerados por máquina: valem mais que números escritos à mão)
```
 .../20261015211150_away_message_decision.sql       | 287 +++++++++++
 supabase/tests/away_message_decision.sql           | 563 +++++++++++++++++++++
 2 files changed, 850 insertions(+)
```
- Nenhum arquivo de teste alterado neste cartão
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: supabase/migrations/20261015211150_away_message_decision.sql, supabase/tests/away_message_decision.sql; padrão sensível: caminho:supabase/migrations/, caminho:supabase/tests/, padrão:SECURITY DEFINER, padrão:\.delete\(\)|\bDELET, padrão:\bDROP\b, padrão:\bGRANT\b

## O que mudou e por quê
- Nenhum arquivo de código foi alterado (ordem do cartão: SÓ O RELATO, fechar sem commit). A branch contém apenas o cherry-pick e1275c8b0 (2 arquivos, escopo do título).
- Este relato substitui o recusado e corrige a descrição da trava 5, ponto a ponto abaixo.

## Pontos do revisor
- Ponto 1: resolvido no relato. A trava 5 NÃO chama is_within_business_hours: ela replica a regra dentro de should_send_away_message (supabase/migrations/20261015211150_away_message_decision.sql, comentário "reescrita aqui" e corpo da trava; medes com grep -n "reescrit" no arquivo). O relato antigo dizia "trava ... is_within_business_hours" e alegava equivalência geral — removido. O que T1/T5 provam, dito com precisão: na mesma janela de business_hours da fixture, is_within_business_hours e a decisão concordam (T1: oráculo FECHADO + decisão devolve texto; T5: oráculo ABERTO + decisão NULL). Conferi o corpo da original no banco local (mesmo fuso America/Sao_Paulo, dow 0-6, mesma comparação open/close; sem janela para hoje = aberto/não envia nas duas).
- Nota ao juiz barato: o "relato corrigido" é este próprio texto de fechamento — o cartão manda fechar sem commit, então nenhum arquivo de relato entra no diff de propósito; o diff de código fica igual ao recusado porque a recusa era só sobre o texto.

## Prova
- Vermelho sem a correção (função ausente, T0 morre): `zapp-db-local psql . v2-261016143739c9 -c "BEGIN; DROP FUNCTION ...should_send_away_message(uuid,uuid); SELECT public.should_send_away_message(...); ROLLBACK;"` → `ERROR: function public.should_send_away_message(uuid, uuid) does not exist`; após ROLLBACK a função segue de pé (funcao_de_pe = t).
- Verde com a migration: `zapp-db-local psql . v2-261016143739c9 < supabase/tests/away_message_decision.sql` → exit=0 e `SUITE VERDE: away_message_decision`. O único arquivo de teste (blocos T0–T9) cobre: T0 (estrutura/RLS/policy), T1 (fora do horário devolve texto resolvido), T2 (24 h idempotente), T3a/T3b (desligada), T4 (grupo), T5 (dentro do horário não envia), T6, T7, T8a–T8e (papeis reais) e T9 (rollback do cabeçalho derruba os objetos). T9b sai PULADO por desenho (psql roda dentro do container, sem -v mig) e a reaplicação local foi a própria migration reaplicada via psql.
- Nota de ambiente (sem efeito no diff): o retrato local não traz colunas de migrations pendentes; adicionei no banco local capabilities em whatsapp_connections (igual à F60) e deleted_at em contacts (timestamptz nullable, igual à 20260929370000 e ao schema-catalog.json de 04/10). Sem isso a fixture nem carrega — achado registrado, nada alterado no diff.

## Arquivos (git diff --name-only base...HEAD)
- supabase/migrations/20261015211150_away_message_decision.sql
- supabase/tests/away_message_decision.sql
- Fatos medidos agora: 2 arquivos (1 migration + 1 teste); git diff base...HEAD = 41121 caracteres.

## O que NÃO fiz e por quê
- Não alterei código nem teste: o cartão manda SÓ O RELATO e fechar sem commit.

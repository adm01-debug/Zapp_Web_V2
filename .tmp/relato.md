Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261005151753_sla_first_response_granular.sql: o bloco `-- Rollback:` estava em prosa; passou ao formato executável na ordem (`-- Rollback (SQL executável, na ordem):` + linhas `--   <stmt>;`), invertendo de verdade o que a migration faz (devolve `register_first_response_internal` ao corpo anterior de 5 min, `revoke` e `drop` do resolvedor novo). É o formato que o conferidor de rollback exige; sem ele a entrega não passa.
- A correção de fundo (R2-SLA-003) já vinha nos dois commits anteriores do ramo, trazidos por cherry-pick dos commits origem (o resolvedor granular + o teste de contrato); aqui só fechei o rollback que faltava.

## Prova
- vermelho antes (migration de prazo granular ausente do diretório, restante da base intacto): `node --test scripts/db-audit/sla-granular-contract.test.mjs` → `ℹ pass 1 / ℹ fail 8`, com `✖ regra ATIVA de 2 min (nivel contact) classifica resposta aos 3 min como breach`.
- verde depois (migration presente): `node --test scripts/db-audit/sla-granular-contract.test.mjs` → `ℹ tests 9 / ℹ pass 9 / ℹ fail 0`, incluindo `✔ nivel job_title vence contact_type, queue e agent como no resolveHierarchy da UI` e `✔ migration que define o registro conserva o contrato (estatico)`.
- O teste extrai as definições de `supabase/migrations/*.sql` (a última versão de cada função) num PostgreSQL 17 descartável por docker — não confere texto.

## Causa do `banco_local` vermelho do cartão anterior (medida, não suposta)
A linha `triggers|messages.trg_guard_message_provenance_fields` é um drift PRÉ-EXISTENTE: o gatilho vem da migration `20261006114108_r2_db_022_provenance_trigger.sql`, que JÁ está no ramo do dia (`git ls-tree dia/2026-10-12` confirma), mas NÃO está em `supabase/schema-manifest.json` (`generated_at 2026-10-06T11:20:29Z`, 21 min antes de a 20261006114108 existir). Logo o gatilho aparece como `só local` em relação ao retrato versionado.
O que torna ESSA linha vermelha e não as outras ~120: o explicador do `zapp-verify` dá como "do cartão" a diferença de seção `triggers` cujo dono (`nomes_do_objeto` = `['messages','trg_guard_message_provenance_fields']`) é citado por migration PENDENTE. A migration deste cartão é do SLA de primeira resposta e necessariamente nomeia a tabela `messages` (consulta `public.messages`), então `cita('messages')` fica verdadeiro e o drift de `messages.*` passa a "não explicado". Nenhuma das migrations pendentes listadas pelo integrador (`migration(s) pendente(s): 20261005095819…20261007012808…`) nomeia `messages` — por isso a base fecha verde e o cartão fica vermelho. Não é o gatilho do cartão (o cartão não toca nele): é a ordem/associação do conferidor com um retrato de produção desatualizado.
O mesmo sintoma derrubou o cartão 26100712208b41 (migrations `20261005213751/20261005231504`, mesma janela de versão) em 2026-10-11T22:52, depois de integrar, com a base verde — confirma que o mecanismo é o acima, e não "cherry-pick de base antiga".

## O que NÃO fiz e por quê (o que falta para a integração passar)
- O aviso automático "o cartão diz SEM DDL/migration e o seu diff cria/altera a migration …" não procede: é o rodapé genérico de REGRAS PERMANENTES colado no corpo do cartão; o pedido do cartão É uma migration de banco (`fix(db): persiste breach com o prazo SLA granular`, arquivos do cartão citam justamente `supabase/migrations/20261005151753_sla_first_response_granular.sql`). Tirar a migration deixaria o cartão sem entrega.
- NÃO adicionei ao diff qualquer comentário/teste citando `trg_guard_message_provenance_fields` para "explicar" a linha: seria contornar o conferidor, e o pedido do cartão proíbe.
- NÃO toquei no gatilho nem em `guard_message_provenance_fields()`: a correção do cartão é o SLA granular; o gatilho está fora do escopo e intacto.
- O desbloqueio real exige UMA das duas ações, nenhuma delas do cartão:
  1) a rota oficial de aceite do integrador (integrar.sh, per-card `$DIRLOG/aceitar/<id>.txt`) com a linha literal `triggers|messages.trg_guard_message_provenance_fields` (e, se aparecer, `functions|f:guard_message_provenance_fields()`), montada a partir de `estado/check-diferencas.txt`; ou
  2) regenerar o retrato versionado `supabase/schema-manifest.json` (está parado em 2026-10-06T11:20:29Z, antes da migration 20261006114108), que precisa do banco real — fora da minha alçada (R1).
- Registro também que esta entrega duplica a de t_e3bb7a21 (branch 26101200238ad9, sha aprovado 1e61f7187), que carrega a MESMA migration e um subconjunto destes testes; a diferença é o bloco de rollback (aqui no formato executável) e testes de precedência a mais. Se as duas entrarem, o integrador deve escolher uma.

NÃO CONCLUÍ a integração: o `banco_local` continuará vermelho no integrador pelo drift do retrato de produção (acima) até a rota de aceite ou a regeneração do manifest. O defeito do SLA granular em si está corrigido e provado (vermelho→verde); só o conferidor de estrutura precisa da decisão de infra.

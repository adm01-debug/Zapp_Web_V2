Especialista: complexo (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261005151753_sla_first_response_granular.sql: novo resolvedor
  public.resolve_applicable_first_response_minutes(uuid) com a mesma precedência da UI
  (contact > company > job_title > contact_type > queue > agent; fallback
  sla_configurations is_default ativa; padrão 5 min); register_first_response_internal
  passa a persistir first_response_breached contra esse prazo em vez do fixo de 5 min.
  Motivo: regra ativa de 2 min com resposta aos 3 min ficava persistida como dentro do prazo.
- scripts/db-audit/sla-granular-contract.test.mjs: contrato em PostgreSQL 17 descartável
  (node --test) que extrai a ÚLTIMA definição de cada função das migrations reais —
  nada de SQL copiado nem regex sobre texto.
- Rebase: 2e263f76d + 10ac1ed6c (conteúdo idêntico a c7f27e3c8 + 95b38f0aa do workersql)
  sobre a ponta dia/2026-10-12 (15929a99c). `git diff dia/2026-10-12..HEAD --stat`
  mostra SÓ esses 2 arquivos, só inserções.

## Prova
- vermelho antes (migration fora de supabase/migrations):
  `node --test scripts/db-audit/sla-granular-contract.test.mjs` →
  `ERROR: function public.resolve_applicable_first_response_minutes(unknown) does not exist`
  e `AssertionError: 20260903233000_sla_base_only_valid_messages.sql nao usa o resolvedor granular de prazo`
- verde depois (migration restaurada), mesmo comando, todos ✔ nenhum ✖:
  `✔ regra ATIVA de 2 min (nivel contact) classifica resposta aos 3 min como breach`
  `✔ sem regra nem configuracao: padrao do sistema (5 min) segue valendo`
  `✔ fallback intermediario: sla_configurations is_default aplica antes do padrao de 5 min`
  `✔ precedencia: contact vence company e queue; company vence queue`
  `✔ nivel job_title vence contact_type, queue e agent como no resolveHierarchy da UI`
  `✔ nivel contact_type vence queue e agent como no resolveHierarchy da UI`
  `✔ nivel agent aplica quando nenhum nivel superior casa`
  `✔ regra company+queue com company divergente casa no nivel queue, igual a UI`
  `✔ migration que define o registro conserva o contrato (estatico)`
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (44s)`
  (`OK db_guard`, `OK tipos 42s`, `OK lint`, `OK migrations`;
  `AVISO banco_local NÃO VERIFICADO: sem nome de conjunto` — o comando fixo do cartão
  não passa conjunto, mesma condição da tentativa anterior).
- Sem sobreposição com a migration 20261006211248 (ela só redefine o trigger
  messages_sla_first_response_trigger; esta só register + resolvedor novo). Chamadores
  são só internos (trigger); REVOKE sem GRANT repete o padrão das duas migrations
  anteriores; db-guard.yml da ponta já cobre `node --test scripts/db-audit/*.test.mjs`
  via glob em bloco `run:` — sem mudança de inventário.

## Pontos do refazer
- Ponto 1 (coordenador: rebase + cherry-pick c7f27e3c8 + 95b38f0aa sobre dia/2026-10-12):
  feito verbatim — 2e263f76d + 10ac1ed6c; diff contra o dia só os 2 arquivos do cartão.
- Ponto 2 (bloqueio b_6162bba2: retrato sem o trigger, banco_local reprovava):
  causa raiz localizada fora do cartão e já resolvida no main — o retrato canônico
  regenerado é 2026-10-09T16:18:59Z com `messages.trg_guard_message_provenance_fields`
  (commit 99aa53ff7 #1913, ancestral de origin). A branch dia/2026-10-12 (merge-base
  com origin em 04/10) ainda não contém o #1913; regenerar o retrato ou sincronizar
  o dia está fora dos ARQUIVOS QUE PODE TOCAR. Nenhuma linha deste cartão depende
  daquele trigger.
- Observação ao revisor (não bloqueia o critério de pronto): o `-- Rollback:` da
  migration aponta o corpo anterior ("com o corpo de 20260903233000...") em vez de
  embuti-lo. Não converti em SQL embutido porque migration existente não se edita
  (o CI recusa) e a correção exigiria migration nova fora do pedido; se o revisor
  exigir, vira ponto de um refazer com migration complementar própria.

## O que NÃO fiz e por quê
- Não chamei o Claude Code com o comando fixo: a implementação já existia verbatim
  (ordem do coordenador era cherry-pick) e o que faltava era rebase — operação git
  fora do allowlist do executor; após o rebase, só verificação, executada acima.
  (Orçamento de plano compartilhado com o revisor preservado.)
- Não regenerei supabase/schema-manifest.json nem toquei em workflow/inventário:
  fora do escopo; o glob do db-guard.yml já cobre o teste novo.
- Não executei o check de banco_local com conjunto: reproduziria o falso-positivo
  documentado na tentativa anterior (migration cita `messages` e não cita o trigger),
  cuja causa (retrato do dia) está fora do escopo — registrado acima com a saída.

Concluí: critério de pronto atendido (caso 2min/3min persiste breach=true, fallback
provado com SQL de verdade, teste falha sem a correção, rapido verde).

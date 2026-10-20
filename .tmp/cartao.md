Task t_cfa99af7: feat(db): apagar mensagem por RPC que preserva o texto original
  status:    running
  assignee:  workersql
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_cfa99af7
  max-retries: 2 (default)
  created:   2026-10-12 11:09 by claude
  started:   2026-10-13 04:03
  children:  t_fef320c8

Body:
ESPECIALISTA DA ÁREA: workersql (banco, migrations e RLS). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: workersql`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs docs/estado 10 a 12 e 17 a 40 (inbox components, team-chat, security/queues, layout/talkx, email/voice, shared, hooks, integrations, services, lib, backend, infra, testes) (plano em `docs/plans/PLANO_PARIDADE_V3_DOCS_10_A_40_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-resto/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

PROBLEMA (evidência conferida)
Quatro pontos fazem `.update({ is_deleted: true, content: '[Mensagem apagada]' })` direto em `messages` (conferido): `services/chat.service.ts:107`, `components/inbox/chat/MessageHoverToolbar.tsx:66`, `components/inbox/MessageContextActions.tsx:69` e `hooks/chat/useFilesActions.ts:50`. Hoje um agente pode reescrever o texto de uma mensagem RECEBIDA do contato (o gatilho `guard_message_provenance_fields` protege só `media_url`, `contact_id`, `sender`, `agent_id`, `external_id`). O cartão ED1 vai bloquear mudança de `content` por `authenticated` e quebraria a exclusão de hoje; PD-64 também aperta `messages`.

O QUE FAZER
1. Crie `delete_message(p_message_id)` (SECURITY DEFINER, `search_path` fixo, visibilidade do contato, só mensagem do próprio agente OU admin/supervisor) que marca `is_deleted`, registra quem e quando e MANTÉM o `content` original para auditoria (a tela mostra o rótulo '[Mensagem apagada]' sem sobrescrever o dado).
2. Coordene com ED1, PD-64 e DM1 (leia os cartões; não duplique o gatilho): a RPC é a ÚNICA forma de apagar. Prova no banco local: agente apaga a própria; não apaga a de colega nem a do cliente; texto original preservado; `-- Rollback:`.

ARQUIVOS QUE PODE TOCAR
- supabase/migrations/<ts>_delete_message_rpc.sql (novo)
- supabase/tests/
- src/integrations/supabase/types.ts

CRITÉRIO DE PRONTO
1. Apagar não destrói o original.
2. Prova com 3 papéis.
3. `zapp-verify . --rapido` verde.


Comments (1):
  [2026-10-13 04:31] workersql: RPC `public.delete_message(uuid)` entregue (SECURITY DEFINER, search_path fixo, negada por padrao). Marca is_deleted + deleted_by/deleted_at e MANTEM o content original; autoriza por visibilidade do contato E (mensagem do proprio agente OU admin/supervisor); erro uniforme sem oraculo; idempotente.

Evidencia:
- vermelho: `psql ... -v sem_migration=1 < supabase/tests/delete_message_rpc.sql` -> `ERROR: function public.delete_message(unknown) does not exist` (exit 3).
- verde: mesmo comando aplicando o arquivo real (`-v mig=...`) -> `T1..T11 OK`, `TODAS as assercoes passaram (T1-T11)` (exit 0), como authenticated/anon/service_role reais.
- `hermes-db-migrar` -> `APLICADA no banco LOCAL 'v2-26101304039317'`; smoke como authenticated no schema real -> `SMOKE OK ... content/proveniencia intactos`.
- rollback declarado executado -> `ROLLBACK OK: funcao e colunas removidas`.
- `zapp-verify . --rapido` -> `VERIFY: VERDE SEM BANCO` (banco_local nao coberto sem nome de conjunto).

Contrato para a tela (t_fef320c8): `delete_message(id) returns boolean` (true apagou; false ja estava apagada); o texto original permanece em `content`; a UI desenha o rotulo.

NAO editei `src/integrations/supabase/types.ts` (regeneracao e do worker de CI/gen-types) nem os 4 pontos de UI (filho t_fef320c8).

REGISTRO PENDENTE: `supabase/tests/delete_message_rpc.sql` roda no harness de Postgres descartavel mas ainda nao esta ligado a um `scripts/db-audit/*.test.sh` nem a um passo do `.github/workflows/db-guard.yml` (arquivo fora dos meus arquivos). Encaminhar ao worker de CI.

Events (37):
  [2026-10-13 04:14] [run 12076] heartbeat
  [2026-10-13 04:15] [run 12076] heartbeat
  [2026-10-13 04:16] [run 12076] heartbeat
  [2026-10-13 04:17] [run 12076] heartbeat
  [2026-10-13 04:18] [run 12076] heartbeat
  [2026-10-13 04:19] [run 12076] heartbeat
  [2026-10-13 04:20] [run 12076] heartbeat
  [2026-10-13 04:21] [run 12076] heartbeat
  [2026-10-13 04:22] [run 12076] heartbeat
  [2026-10-13 04:23] [run 12076] heartbeat
  [2026-10-13 04:23] [run 12076] heartbeat {'note': 'Migration criada; provas T1-T11 verdes no Postgres descartavel (vermelho->verde). Tentando aplicar no banco local.'}
  [2026-10-13 04:24] [run 12076] heartbeat
  [2026-10-13 04:25] [run 12076] heartbeat
  [2026-10-13 04:26] [run 12076] heartbeat
  [2026-10-13 04:27] [run 12076] heartbeat
  [2026-10-13 04:28] [run 12076] heartbeat
  [2026-10-13 04:29] [run 12076] heartbeat
  [2026-10-13 04:30] [run 12076] heartbeat
  [2026-10-13 04:31] commented {'author': 'workersql', 'len': 1566}
  [2026-10-13 04:31] [run 12076] heartbeat

Runs (1):
  #12076 running      @workersql  active  2026-10-13 04:03

Task t_dc0f1b11: fix(seguranca): foto do cliente com caminho imprevisível
  status:    running
  assignee:  edgar
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_dc0f1b11
  max-retries: 2 (default)
  created:   2026-10-12 10:44 by claude
  started:   2026-10-12 22:48

Body:
ESPECIALISTA DA ÁREA: edgar (Edge Functions). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: edgar`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs docs/estado 04 a 16 (auth, admin, inbox, settings, contacts, connections/dashboard) (plano em `docs/plans/PLANO_PARIDADE_V3_DOCS_04_A_16_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-docs/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

PROBLEMA (evidência conferida)
Banco real: o bucket `avatars` é PÚBLICO (`public = true`) e `evolution-helpers.ts:385-387` grava `avatars/<dígitos do telefone>.jpg`; `batch-fetch-avatars` usa `getPublicUrl`. Qualquer pessoa, sem login, enumera foto de cliente por telefone.

O QUE FAZER
1. Grave o avatar em caminho NÃO adivinhável (ex.: `contacts/<contact_uuid>/<token aleatório>.jpg`, token novo a cada atualização) e guarde a URL em `contacts.avatar_url`; apague o arquivo anterior ao trocar; o cron horário `avatars-refresh` migra os existentes gradualmente (idempotente, em lote) e remove os de caminho antigo ao migrar.
2. Teste Deno: caminho não deriva do telefone; troca remove o arquivo antigo; migração idempotente.

ARQUIVOS QUE PODE TOCAR
- supabase/functions/_shared/evolution-helpers.ts
- supabase/functions/batch-fetch-avatars/
- supabase/functions/avatars-refresh/ (se existir)
- testes

CRITÉRIO DE PRONTO
1. Nenhum caminho derivável do telefone.
2. Arquivos antigos removidos.
3. `zapp-verify . --rapido` verde.


Events (29):
  [2026-10-12 19:36] reprioritized {'priority': 5}
  [2026-10-12 22:48] reprioritized {'priority': 9}
  [2026-10-12 22:48] [run 11660] claimed {'lock': 'Joaquim:32040', 'expires': 1791857039, 'run_id': 11660}
  [2026-10-12 22:48] [run 11660] spawned {'pid': 30508, 'started_at': '|179185613919'}
  [2026-10-12 22:49] [run 11660] heartbeat
  [2026-10-12 22:50] [run 11660] heartbeat
  [2026-10-12 22:51] [run 11660] heartbeat
  [2026-10-12 22:52] [run 11660] heartbeat
  [2026-10-12 22:53] [run 11660] heartbeat
  [2026-10-12 22:54] [run 11660] heartbeat
  [2026-10-12 22:55] [run 11660] heartbeat
  [2026-10-12 22:56] [run 11660] heartbeat
  [2026-10-12 22:58] [run 11660] heartbeat
  [2026-10-12 22:59] [run 11660] heartbeat
  [2026-10-12 23:00] [run 11660] heartbeat
  [2026-10-12 23:01] [run 11660] heartbeat
  [2026-10-12 23:02] [run 11660] heartbeat
  [2026-10-12 23:03] [run 11660] heartbeat
  [2026-10-12 23:04] [run 11660] heartbeat
  [2026-10-12 23:05] [run 11660] heartbeat

Runs (1):
  #11660 running      @edgar  active  2026-10-12 22:48

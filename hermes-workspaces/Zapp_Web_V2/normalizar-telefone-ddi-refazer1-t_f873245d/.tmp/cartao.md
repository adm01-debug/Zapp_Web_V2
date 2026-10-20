Task t_567fa759: fix(db): normalizar telefone no trigger e corrigir os 5 contatos sem DDI
  status:    running
  assignee:  workersql
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_567fa759
  max-retries: 2 (default)
  created:   2026-10-12 10:40 by claude
  started:   2026-10-13 02:13

Body:
ESPECIALISTA DA ÁREA: workersql (banco, migrations e RLS). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: workersql`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs docs/estado 04 a 16 (auth, admin, inbox, settings, contacts, connections/dashboard) (plano em `docs/plans/PLANO_PARIDADE_V3_DOCS_04_A_16_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-docs/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

PROBLEMA (evidência conferida)
Complemento do PD-53 no banco: `normalize_contact_phone` só tira não-dígitos. Banco real: 5 contatos com 10-11 dígitos sem 55.

O QUE FAZER
1. ANTES: liste os 5 contatos (só ids, sem telefone completo no relato) e verifique se normalizar criaria colisão com contato existente; trate colisões sem apagar nada (reporte).
2. Atualize o trigger para acrescentar 55 em números brasileiros de 10-11 dígitos e preserve estrangeiros; backfill idempotente dos 5; prova no banco local; `-- Rollback:`.

ARQUIVOS QUE PODE TOCAR
- supabase/migrations/<ts>_normalize_contact_phone_ddi.sql (novo)
- supabase/tests/

CRITÉRIO DE PRONTO
1. Telefone sempre normalizado no banco.
2. Sem colisões silenciosas.
3. `zapp-verify . --rapido` verde.


Events (28):
  [2026-10-13 02:15] [run 12001] heartbeat
  [2026-10-13 02:16] [run 12001] heartbeat
  [2026-10-13 02:17] [run 12001] heartbeat
  [2026-10-13 02:19] [run 12001] heartbeat
  [2026-10-13 02:20] [run 12001] heartbeat
  [2026-10-13 02:21] [run 12001] heartbeat
  [2026-10-13 02:22] [run 12001] heartbeat
  [2026-10-13 02:23] [run 12001] heartbeat
  [2026-10-13 02:24] [run 12001] heartbeat
  [2026-10-13 02:25] [run 12001] heartbeat
  [2026-10-13 02:26] [run 12001] heartbeat
  [2026-10-13 02:27] [run 12001] heartbeat
  [2026-10-13 02:28] [run 12001] heartbeat
  [2026-10-13 02:29] [run 12001] heartbeat
  [2026-10-13 02:30] [run 12001] heartbeat
  [2026-10-13 02:31] [run 12001] heartbeat
  [2026-10-13 02:32] [run 12001] heartbeat
  [2026-10-13 02:33] [run 12001] heartbeat
  [2026-10-13 02:34] [run 12001] heartbeat
  [2026-10-13 02:35] [run 12001] heartbeat

Runs (1):
  #12001 running      @workersql  active  2026-10-13 02:13

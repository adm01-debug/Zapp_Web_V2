Task t_7d74e43f: fix(auditoria): painel de auditoria com totais reais (contagem no servidor) e atualização ao vivo
  status:    running
  assignee:  hugo
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_7d74e43f
  max-retries: 2 (default)
  created:   2026-10-13 09:01 by claude
  started:   2026-10-14 12:01

Body:
ESPECIALISTA DA ÁREA: hugo (hooks, estado e dados no front). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: hugo`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 do doc `docs/estado/26-hooks-raiz-4.md` (hooks raiz S-Z). Relatórios com a evidência completa de cada achado (leia a seção do id citado antes de editar): `docs/audits/AUDITORIA_PARIDADE_V3_DOC_26_2026-10-13_PARTE1..5` (enquanto não integrados: `~/hermes-workspaces/.assets/paridade-hooks26/achados_*.md`). A V3 é só REFERÊNCIA (`~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que ela faz melhor, NÃO copie arquivos inteiros e NÃO porte bug da V3. FORA DE ESCOPO (decisões do dono): tags/etiquetas (função excluída), exportar/importar/baixar/copiar/imprimir dados novos, edição em massa de contatos, SLA de Resolução, webhook externo de alerta, enviar dados para fora do sistema. Os achados foram CONFERIDOS no código da cópia viva da V2 em 13/10/2026, que NÃO contém cartões `done` ainda não integrados: antes de editar, procure cartões irmãos com `python3 ~/arquitetura-v2/paridade-hooks26/buscar_todos.py 'termo'` e na fila `~/hermes-workspaces/.v2-fila/*.json`; se algo já estiver feito, prove no relato em vez de refazer. O banco local `v2-integrador` pode estar defasado: confira o que o cartão mandar no banco local em dia (aplique as migrations da branch).
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos (nada para `anon` sem necessidade), e PROVA no banco LOCAL com o papel real (agent/supervisor/admin/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; sem log de telefone, token ou texto de mensagem; cores só tokens do sistema; mexa SOMENTE nos arquivos listados (se precisar de outro, diga no relato por quê).

PROBLEMA (evidência conferida)
`components/security/AuditLogDashboard.tsx` (V2) calcula 'total/hoje/suspeitas' sobre 200 linhas carregadas e não atualiza em tempo real. A tabela `security_audit_logs` da V3 NÃO existe na produção da V2 (é bug da V3: zera tudo sem avisar; não portar): a V2 lê `audit_logs`, cuja política só deixa admin ler. O cartão `t_4d66a644` (resumo de auditoria de segurança) pode sobrepor: LEIA-O na fila e componha. Relatórios: achados_1 HZ1-08, achados_5 HZ5-13.

O QUE FAZER
1. Totais por contagem de servidor (`count:'exact', head:true`) com janelas de 24 h e 7 d; nomes via `profiles`.
2. Assine INSERT de `audit_logs` SE a tabela estiver na publicação realtime (confira no banco local); se não estiver, registre no relato o nome da migration necessária e NÃO a faça aqui.
3. Teste: com 500 linhas fictícias o cartão 'Hoje' mostra a contagem real; INSERT novo aparece em menos de 5 s (se realtime ativo).

ARQUIVOS QUE PODE TOCAR
- src/components/security/AuditLogDashboard.tsx
- src/hooks/ (hook de auditoria, se existir)
- testes

CRITÉRIO DE PRONTO
1. Totais independem do limite de 200 linhas.
2. Relato diz se o realtime está ou não ativo.
3. `zapp-verify . --rapido` verde.


Latest summary:
Guarda V2 desligada: ~/.local/libexec/hermes-guard/MODO_V2 ausente (so CONGELADO), entao hermes-tarefa-iniciar/fechar/migrar/mergear recusam com exit 75 em qualquer cartao. Sem workspace nao ha onde editar/commitar/fechar (e contornar e proibido). Nao editei nada. Decisao registrada ao Joaquim: hermes-pedir-decisao id 20261014-120403-7f2d-sem-tarefa. Detalhes e levantamento dos irmaos (t_4d66a644 pronto/integrado 13/10 16:19; t_2171f991 rejeitado/integrado 14/10 07:47) no comentario. Retomar quando o MODO_V2 voltar.

Comments (3):
  [2026-10-13 14:28] default: [claude] AUDITORIA 13/10 — SOBREPOSIÇÃO com PG-06 t_4d66a644 (RPC de resumo/lista da auditoria, workersql) e PG-07 t_2171f991 (aba de Auditoria, iris). Mesmo alvo: totais reais da auditoria de segurança sem o corte de 200 linhas. Quem fechar primeiro vale; o segundo deve verificar o que o outro já entregou e fechar como 'sem lacuna' em vez de duplicar. Nomes de chave repetem entre sessões (PJ-, PH-): use sempre o id t_….
  [2026-10-14 12:06] hugo: BLOQUEIO DE AMBIENTE (nao e do cartao): a guarda V2 esta desligada, entao nao consigo abrir o workspace nem fechar.

Prova (rodado agora, 14/10 12:03, em ~/projetos/Zapp_Web_V2):
- `hermes-tarefa-iniciar Zapp_Web_V2 auditoria-painel-totais-reais` -> exit 75, duas vezes, com a mensagem: "CONGELADO: o modo V1 (push/PR/merge/migration/deploy por tarefa) esta suspenso pela Arquitetura V2. Nao tente contornar."
- Causa: `~/.local/libexec/hermes-guard/CONGELADO` existe (04/10 11:22) e `~/.local/libexec/hermes-guard/MODO_V2` NAO existe (diretorio mtime 14/10 10:45). O cabecalho do `hermes-tarefa-fechar` (linhas 5-7) usa a mesma condicao, ou seja: iniciar/fechar/migrar/mergear recusam em QUALQUER cartao, nao so neste.
- A fila `.v2-fila/` teve o ultimo movimento as 11:55 (integracao), entao a paralisacao e recente.
- Nao contornei (nem `git worktree`, nem workspace a mao): regra explicita do FLUXO e das regras de 07-08/10.

Decisao registrada para o Joaquim: `hermes-pedir-decisao` -> id 20261014-120403-7f2d-sem-tarefa (pede o retorno do MODO_V2 e confirma se foi parada intencional/ESTOP).

Levantamento ja feito (read-only, para nao refazer depois) — os dois cartoes irmaos do comentario do Claude JA foram para a fila:
- t_4d66a644 (workersql) "feat(seguranca): RPCs admin-only de resumo e lista de audit_logs por p..." — estado=pronto, integrado_em=13/10 16:19.
- t_2171f991 (iris) "fix(seguranca): aba de auditoria com resumo real, filtro de data, nome..." — estado=rejeitado, integrado_em=14/10 07:47.
Pelo criterio do comentario do Claude ("quem fechar primeiro vale; o segundo verifica o que o outro ja entregou e fecha como 'sem lacuna'"), a lacuna deste cartao pode ja estar coberta pelas RPCs de contagem no servidor do t_4d66a644 — a primeira coisa que eu ia fazer era exatamente conferir isso no diff integrado antes de tocar em `src/components/security/AuditLogDashboard.tsx`. Nada foi editado; nenhum workspace foi criado.
  [2026-10-15 14:15] default: UNBLOCK: guarda restaurada (MODO_V2 voltou): retomar a abertura/fechamento do cartao

Events (197):
  [2026-10-16 01:05] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-16 01:06] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-16 01:06] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-16 01:06] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-16 01:06] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-16 01:07] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-16 01:07] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-16 01:07] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-16 01:08] [run 19139] claimed {'lock': 'Joaquim:38172', 'expires': 1792124584, 'run_id': 19139}
  [2026-10-16 01:08] [run 19139] spawned {'pid': 49572, 'started_at': '|179212368403'}
  [2026-10-16 01:08] [run 19139] heartbeat
  [2026-10-16 01:08] reprioritized {'priority': 5}
  [2026-10-16 01:09] [run 19139] heartbeat
  [2026-10-16 01:10] [run 19139] heartbeat
  [2026-10-16 01:11] [run 19139] heartbeat
  [2026-10-16 01:12] [run 19139] heartbeat
  [2026-10-16 01:13] [run 19139] heartbeat
  [2026-10-16 01:14] [run 19139] heartbeat
  [2026-10-16 01:15] [run 19139] heartbeat
  [2026-10-16 01:16] [run 19139] heartbeat

Runs (8):
  #16761 blocked      @hugo  300s  2026-10-14 12:01
        → Guarda V2 desligada: ~/.local/libexec/hermes-guard/MODO_V2 ausente (so CONGELADO), entao hermes-tarefa-iniciar/fechar/migrar/mergear recusam com exit 75 em qual
  #18774 rate_limited @hugo  632s  2026-10-15 22:27
        ! pid 40548 exited rate-limited (quota wall) — requeued without counting a failure
  #18855 rate_limited @hugo  44s  2026-10-15 22:42
        ! pid 27104 exited rate-limited (quota wall) — requeued without counting a failure
  #18918 rate_limited @hugo  2352s  2026-10-15 23:18
        ! pid 39564 exited rate-limited (quota wall) — requeued without counting a failure
  #19023 rate_limited @hugo  914s  2026-10-16 00:11
        ! pid 16136 exited rate-limited (quota wall) — requeued without counting a failure
  #19064 rate_limited @hugo  32s  2026-10-16 00:31
        ! pid 49520 exited rate-limited (quota wall) — requeued without counting a failure
  #19081 rate_limited @hugo  1200s  2026-10-16 00:42
        ! pid 32032 exited rate-limited (quota wall) — requeued without counting a failure
  #19139 running      @hugo  active  2026-10-16 01:08

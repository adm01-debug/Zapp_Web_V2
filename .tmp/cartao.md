Task t_a9c81c8a: feat(admin): auditoria de e-mail (paridade com AdminEmailAuditPage da V3)
  status:    running
  assignee:  iris
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_a9c81c8a
  max-retries: 2 (default)
  created:   2026-10-13 08:15 by claude
  started:   2026-10-13 16:40

Body:
ESPECIALISTA DA ÁREA: iris (telas e componentes). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: iris`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs docs/estado 10 a 12 e 17 a 40 (inbox components, team-chat, security/queues, layout/talkx, email/voice, shared, hooks, integrations, services, lib, backend, infra, testes) (plano em `docs/plans/PLANO_PARIDADE_V3_DOCS_10_A_40_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-resto/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

PROBLEMA (evidência conferida)
MÉTODO (cartão de paridade): localize o arquivo na V3 com `git -C ~/projetos/Zapp_Web_V3 ls-tree -r --name-only origin/main | grep -i <nome>` e leia INTEIRO com `git show origin/main:<caminho>`; compare por COMPORTAMENTO com a V2 (nomes diferem: busque por tabela, RPC, Edge e palavras-chave). Para cada diferença: se a V2 deveria ter e não tem, IMPLEMENTE; se a V2 já faz igual ou melhor, ou se a V3 é casca/código morto, NÃO implemente e diga isso no relato com evidência (arquivo:linha). Um cartão que fecha 'sem lacuna' com evidência é um resultado válido; um que implementa sem comparar, não. ALVO: `AdminEmailAuditPage` da V3. EH1/EH2 cobrem a saúde do Gmail; a revalidação de e-mail foi descartada; PE-06 cobre a conta em erro. Veja se falta a LISTA de eventos de e-mail (envio, falha, sincronização) para o admin.

O QUE FAZER
1. Aplique o método; implemente só o que faltar; sem exportar nada; testes e captura.

ARQUIVOS QUE PODE TOCAR
- src/components/admin/ ou src/pages/admin/
- testes

CRITÉRIO DE PRONTO
1. Lacuna implementada OU 'sem lacuna' com evidência.
2. `zapp-verify . --rapido` verde.


Latest summary:
Ambiente travado: o marcador /home/joaquim_ataides/.local/libexec/hermes-guard/MODO_V2 não existe mais (verificado 11:03), então `hermes-tarefa-iniciar` (e fechar/migrar/mergear, que têm a mesma checagem) devolve CONGELADO rc=75 e nenhum agente consegue abrir workspace. Desapareceu entre 10:39 (último workspace V2 criado) e 11:03. Falta um humano/Claude recriar o marcador; eu não toco nas guardas nem crio workspace à mão. Sem workspace não há código a editar nem prova a rodar neste cartão.

Comments (2):
  [2026-10-14 11:04] iris: **Bloqueio de ambiente: não consigo abrir workspace (marcador MODO_V2 da guarda ausente).**

Evidência (WSL, 14/10/2026):
- `hermes-tarefa-iniciar Zapp_Web_V2 auditoria-email-audit-admin` → `CONGELADO: o modo V1 ... está suspenso pela Arquitetura V2` / `rc=75` (tentei 3x: 11:00, 11:03).
- Causa no script (`~/.local/bin/hermes-tarefa-iniciar`, linhas 5-10): ele bloqueia quando `HERMES_AGENT=1` E existe `CONGELADO` E **não** existe `/home/joaquim_ataides/.local/libexec/hermes-guard/MODO_V2` (arquivo, não pasta).
- Às 11:03 o diretório `hermes-guard/` **não tem nenhum arquivo `MODO*`** (só `CONGELADO`, `modelos-v2.json`, `git`, `claude`, etc.). O diretório foi modificado às 10:45; o último workspace criado em modo V2 foi às 10:39 (`MODO=V2` em `.hermes-tarefa`) — ou seja, o marcador desapareceu entre 10:39 e 11:03.
- Consequência: além de `hermes-tarefa-iniciar`, `hermes-tarefa-fechar`, `hermes-db-migrar` e `hermes-tarefa-mergear` têm a mesma checagem (linha 5 de cada) — todo o ciclo V2 fica parado para qualquer agente, não só este cartão.

O que falta: alguém (Joaquim/Claude) recriar o marcador `~/.local/libexec/hermes-guard/MODO_V2`. Não recrio eu mesmo: mexer nas guardas é fora do meu papel e a ordem do script é explícita ("não tente contornar"). Não abri workspace à mão nem toquei em arquivo do projeto.
  [2026-10-15 14:14] default: UNBLOCK: guarda restaurada (MODO_V2 voltou): retomar a abertura/fechamento do cartao

Events (150):
  [2026-10-15 14:14] commented {'author': 'default', 'len': 84}
  [2026-10-15 14:14] unblocked
  [2026-10-15 15:15] [run 18536] claimed {'lock': 'Joaquim:38172', 'expires': 1792089055, 'run_id': 18536}
  [2026-10-15 15:15] [run 18536] spawned {'pid': 32076, 'started_at': '|179208815533'}
  [2026-10-15 15:16] [run 18536] heartbeat
  [2026-10-15 15:17] [run 18536] heartbeat
  [2026-10-15 15:18] [run 18536] heartbeat
  [2026-10-15 15:19] [run 18536] heartbeat
  [2026-10-15 15:20] [run 18536] heartbeat
  [2026-10-15 15:21] [run 18536] heartbeat
  [2026-10-15 15:22] [run 18536] heartbeat
  [2026-10-15 15:23] [run 18536] heartbeat
  [2026-10-15 15:24] [run 18536] heartbeat
  [2026-10-15 15:25] [run 18536] heartbeat
  [2026-10-15 15:26] [run 18536] heartbeat
  [2026-10-15 15:27] [run 18536] heartbeat
  [2026-10-15 15:28] [run 18536] heartbeat
  [2026-10-15 15:29] [run 18536] heartbeat
  [2026-10-15 15:30] [run 18536] heartbeat
  [2026-10-15 15:31] [run 18536] heartbeat

Runs (19):
  #12864 rate_limited @iris  71s  2026-10-13 16:40
        ! pid 17960 exited rate-limited (quota wall) — requeued without counting a failure
  #13033 rate_limited @iris  51s  2026-10-13 16:46
        ! pid 21764 exited rate-limited (quota wall) — requeued without counting a failure
  #13209 rate_limited @iris  32s  2026-10-13 16:52
        ! pid 30384 exited rate-limited (quota wall) — requeued without counting a failure
  #13399 rate_limited @iris  36s  2026-10-13 16:58
        ! pid 42516 exited rate-limited (quota wall) — requeued without counting a failure
  #13554 rate_limited @iris  34s  2026-10-13 17:04
        ! pid 41472 exited rate-limited (quota wall) — requeued without counting a failure
  #13734 rate_limited @iris  38s  2026-10-13 17:10
        ! pid 39324 exited rate-limited (quota wall) — requeued without counting a failure
  #13914 rate_limited @iris  37s  2026-10-13 17:16
        ! pid 44300 exited rate-limited (quota wall) — requeued without counting a failure
  #14110 rate_limited @iris  33s  2026-10-13 17:23
        ! pid 19680 exited rate-limited (quota wall) — requeued without counting a failure
  #14329 rate_limited @iris  34s  2026-10-13 17:30
        ! pid 43840 exited rate-limited (quota wall) — requeued without counting a failure
  #14510 rate_limited @iris  23s  2026-10-13 17:36
        ! pid 27072 exited rate-limited (quota wall) — requeued without counting a failure
  #14699 rate_limited @iris  37s  2026-10-13 17:42
        ! pid 43264 exited rate-limited (quota wall) — requeued without counting a failure
  #14876 rate_limited @iris  42s  2026-10-13 17:49
        ! pid 7940 exited rate-limited (quota wall) — requeued without counting a failure
  #15207 rate_limited @iris  63s  2026-10-13 17:59
        ! pid 26616 exited rate-limited (quota wall) — requeued without counting a failure
  #15390 rate_limited @iris  43s  2026-10-13 18:06
        ! pid 20960 exited rate-limited (quota wall) — requeued without counting a failure
  #15568 rate_limited @iris  34s  2026-10-13 18:12
        ! pid 38300 exited rate-limited (quota wall) — requeued without counting a failure
  #15751 rate_limited @iris  47s  2026-10-13 18:18
        ! pid 39996 exited rate-limited (quota wall) — requeued without counting a failure
  #16055 rate_limited @iris  23s  2026-10-13 18:27
        ! pid 43760 exited rate-limited (quota wall) — requeued without counting a failure
  #16522 blocked      @iris  196s  2026-10-14 11:01
        → Ambiente travado: o marcador /home/joaquim_ataides/.local/libexec/hermes-guard/MODO_V2 não existe mais (verificado 11:03), então `hermes-tarefa-iniciar` (e fech
  #18536 running      @iris  active  2026-10-15 15:15

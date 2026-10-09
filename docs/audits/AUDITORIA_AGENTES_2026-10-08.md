# Auditoria dos 14 agentes da fábrica — 08/10/2026 (somente leitura)

Escopo: perfis em `%LOCALAPPDATA%\hermes\profiles\*` (config, SOUL, skills, memórias, auth), banco do kanban (7 dias), guarda `hermes-guard.py` e seus logs. Nada foi alterado.

## Gaps por prioridade

### P1 — regras novas não chegam aos agentes
1. **SOULs parados em 06/10** (todos, 15:48–20:34). Nenhum cita: "nenhuma informação sai do sistema", Singu/sem importar-exportar-edição em massa, cores só do sistema, sem selo de canal, ESTOP, motor de gatilhos. A única via são os corpos dos cartões do motor. Cartões criados à mão, "refazer" e correções de auditoria não carregam essas regras.
2. **Segredos em texto puro** nos 14 `config.yaml`: 1 Bearer (MCP lovable), 3 URLs de MCP com token embutido, 1 chave do provedor `omniroute` — repetidos por perfil. Os MCPs estão `enabled: false`, mas o arquivo é lido por todo agente e fica em `.env`/config de 777 (drvfs). Recomenda-se mover para variáveis de ambiente/`.env` e rotacionar o Bearer (ele apareceu numa saída desta sessão).
3. ~~Log da guarda parado~~ **Alarme falso (corrigido após verificação):** a guarda grava um `guard.log` por perfil em `profiles/<perfil>/agent-hooks/state/`, todos atualizados hoje. O `agent-hooks/state/guard.log` central é legado.

### P2 — funcionamento
4. **edgar**: 54 % de sucesso em 7 dias; 21 bloqueios nas últimas 24 h. Causas: cartão depende de editar `zapp-verify`/`~/arquitetura-v2` (a guarda proíbe, corretamente) ou parte de premissa falsa da base. Cartões que exigem o ferramental do Joaquim não deveriam ser roteados a agente.
5. **coordenador/senior (GPT)**: cota Codex esgotou (429 por ~6 dias) e depois foi reposta; workers saem com erro sem usar a reserva `nous`. Falta um alarme de cota e a regra de "pausar o perfil" em vez de queimar 3 tentativas por cartão (2 cartões foram bloqueados assim).
6. **complexo**: `spawn_failed` por cartão com `workspace_kind=worktree` sem `workspace_path` / caminho não absoluto (board sem `default_workdir`).
7. **workertestes**: 57 % (22 cartões `scheduled` aguardam gatilho — esperado); **worker**: 13 `manual_reclaim` em 7 dias.

### P3 — higiene
8. **Memórias dos agentes**: `edgar`, `workerauth`, `workeria` com `MEMORY.md` e `USER.md` vazios; 8 perfis com `USER.md` vazio (só complexo/coordenador/designer/senior/worker têm o perfil do Joaquim). `coordenador` e `senior` com memória de 02–03/10.
9. **9 perfis com 12 categorias de skill genéricas** (apple, email, social-media, creative, media, productivity, research, web, note-taking, software-development…) que só têm `DESCRIPTION.md`: ruído de contexto, e `email`/`social-media` vão contra "nenhuma informação sai". Os toolsets de plataforma (telegram, discord, whatsapp, slack, signal…) também estão listados.
10. **command_allowlist** pré-aprova padrões de risco (execute_code, `git reset --hard`, `rm` recursivo, heredoc/`-c`, kill forçado, acesso a segredos do Hermes). A guarda `fail_closed` cobre `pre_tool_call`, mas `post_tool_call`/`pre_llm_call`/`subagent_start` estão `fail_closed=False`.
11. **omniroute** (`localhost:20128`) configurado como provedor customizado e fora do ar.
12. **Lacunas de skill por papel**: `hugo` sem `design-system-zapp`; `edgar` sem `area-auth-seguranca` e `provar-rls-com-papel-real`; `worker` sem skills de área; `coordenador` sem skill de área (só decide/escreve cartão).

## O que está certo
- Skills de `fabrica/*`: 0 divergência de versão entre perfis, todas com frontmatter válido, nenhuma sem `SKILL.md`.
- Todos os comandos citados nos SOULs/skills existem na máquina (`hermes-tarefa-fechar`, `zapp-verify`, `jev-juiz` etc.).
- Configs idênticas entre workers DeepSeek; diferenças esperadas só em coordenador/senior (gpt-5.5, effort alto), complexo (2 filhos) e designer (chrome-devtools).
- Regras R1 (produção), "hermes-tarefa-fechar", "Especialista:", limites duros e 4 regras permanentes presentes em todos os SOULs.
- Taxas de sucesso 7 dias: designer 91 %, workerauth 91 %, hugo 90 %, workersql 86 %, iris 83 %, workeria 83 %; senior 96 conclusões em 24 h.
- Guarda ativa e bloqueando contorno (ex.: caminho absoluto de `git`).
- Quedas de 06/10 do coordenador (172 × "modelo 5.6-sol não suportado") já resolvidas.

## Correções propostas (nenhuma aplicada)
1. Escrever um bloco único "Regras de 07–08/10" e incluir em todos os SOULs (Claude edita; agentes não podem).
2. Tirar tokens dos `config.yaml`, rotacionar o Bearer.
3. Corrigir `log()` da guarda para registrar a falha em outro lugar e criar um alerta de "sem linha nova em 6 h".
4. Roteamento: nada que dependa de `zapp-verify`/`~/arquitetura-v2` vai ao `edgar`.
5. Alarme de cota Codex e fallback automático para o perfil reserva nos workers.
6. Podar as 12 categorias genéricas e os toolsets de mensageria dos perfis.
7. Preencher `USER.md` e `MEMORY.md` dos perfis vazios.

## Aplicado em 08/10/2026 (aprovado pelo Joaquim)
Backups (modo 700): `~/backups-agentes-2026-10-08/` (config, SOUL e memórias de cada perfil + `bloco_regras.md`).
1. Bloco "Regras de 07–08/10/2026" anexado aos 14 SOULs (idempotente, marcador no título).
2. Removidos dos 14 `config.yaml` os MCPs desligados que traziam token (apollo, lovable, loggi-flow, task-gifts, promo-finance-v2) e o provedor `omniroute`; YAML validado, `hugo` e `senior` iniciam normalmente. **O Bearer do lovable continua válido: rotacionar é com o Joaquim.**
3. (Alarme falso; nada alterado na guarda.)
4. Roteamento: `integrador/revisor_entrada.py` (backup `.bak-20261008`) passa a MANTER cartão que exija editar o ferramental da fábrica; mesma regra na seção "Cartões que NÃO crio" do SOUL do coordenador.
5. Novo `~/arquitetura-v2/saude/quota_codex.py` + timer `v2-quota-codex` (10 min): sonda o Codex sem reserva; com cota esgotada, cartões abertos de senior/coordenador vão para `deepseek-flash` e grava `saude/ALERTA_COTA.txt`; quando volta, desfaz. Testado em simulação (`QUOTA_TESTE_FORA=1 ... --simular`).
6. 81 categorias de skill genérica vazias arquivadas em `~/backups-agentes-2026-10-08/<perfil>/skills-genericas/`; `software-development` (systematic-debugging, TDD) mantida; `platform_toolsets` reduzido a `cli`.
7. `USER.md` (perfil do Joaquim, copiado do `worker`) preenchido nos 8 perfis que estavam vazios. `MEMORY.md` vazio de edgar/workerauth/workeria NÃO foi inventado: o próprio agente escreve.
Não aplicado: `command_allowlist` e `fail_closed` dos hooks secundários (mudança na guarda; fica para decisão separada).

## Validação por 5 agentes (08/10/2026, somente leitura) e correções
- **Banco (#1905):** 0 P0; 14/14 migrations no ledger com hash conferido; 0 tabela sem RLS, 0 SECURITY DEFINER sem search_path, 0 executável por anon. Pendente de ler: corpo de `enqueue_outbound_message`/`enqueue_rich_outbound_message` (rodam como postgres e passam direto pelo guard de proveniência). 10 migrations multi-instrução gravadas como 1 statement no ledger (P2).
- **Código:** o fix do useDebounce é correto e o teste detecta a regressão, MAS **não explica os lotes vermelhos** (o GlobalSearch nem usa o hook). A mensagem do commit 76c97a4b0 atribui a causa sem prova: tratar como impreciso.
- **Causa real dos lotes vermelhos (achada pelo agente de fábrica, reproduzida):** `integrar.sh marca()` falha com `UnicodeEncodeError` quando o detalhe traz byte UTF-8 cortado pelo `cut -c`; o `.novo` fica truncado e o cartão `261006233955c2` nunca sai de `pronto`, entrando em todo lote como o 1º. Correção pronta e testada em simulação: `integrador/aplicar-integrador-v3f.py` (também corrige o `realinhar-dia.sh`, que aceitava conflito como junção limpa). **Aplicar é com o Joaquim** (`--simular` / aplica / `--reverter`).
- **quota_codex.py:** 5 falhas achadas (falso alarme, `set-model` sem checar rc, estado frágil, sem trava, flag de teste perigosa). Reescrito (v2) e testado em simulação: só "cota" troca; erro indeterminado não muda nada; volta só após 2 sondas OK; estado atômico; flock.
- **Perfis:** 14/14 bootam. Corrigido: USER.md dos 8 voltou a vazio (o copiado contradizia o SOUL); bloco de regras reescrito com precedência explícita; 3 skills com YAML inválido corrigidas (0 inválidas em 142); `workeria` ganhou `area-auth-seguranca`; ref quebrada do `workersql` trocada; 13 `.bak` com segredo movidos para o backup 700. Não aplicado: `command_allowlist`/`fail_closed`.
- **Arquivos/planos:** plano de Contatos tem 100 etapas, 0 violações de regra; corrigidos MC-035/054/067/075/077 e a ordem dentro da onda. Removidos trava `.rebuild.lock` morta e resíduo de graphify (415 arquivos idênticos); 4 arquivos com chave movidos para `sensiveis` (700). Pendente com o Joaquim: 2 clones do projeto na raiz do Windows (`zapp-sidebar-*-261003`, 81 MB cada), arquivos soltos no Desktop (MAPA_ZAPP_V2 etc.), chaves em drvfs 777, commit dos docs novos.

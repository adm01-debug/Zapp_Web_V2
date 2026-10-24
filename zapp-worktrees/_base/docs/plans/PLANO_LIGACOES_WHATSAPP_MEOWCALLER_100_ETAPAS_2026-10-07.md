# PLANO — LIGAÇÕES PELO WHATSAPP NO ZAPP COM `meowcaller` — 100 ETAPAS

> **Data:** 2026-10-07 · **Escopo:** backend de chamadas (motor + gateway), Edge Functions, banco, front-end (navegador) · **Status:** plano; nenhuma linha de código de produto foi alterada.
> **Pedido do dono:** fazer e receber ligações de voz pelo WhatsApp dentro do sistema, usando a biblioteca aberta `meowcaller` (a mesma classe de tecnologia da Wavoip).
> **Leia antes:** `docs/design/ANALISE_LIGACOES_WHATSAPP_2026-10-07.md` (fontes, caminho oficial da Meta, riscos e o que não foi verificado).

---

## 0. Aviso que governa o plano inteiro

`meowcaller` e o PR #141 da Evolution GO usam o **protocolo não oficial** do WhatsApp (aparelho vinculado). **Isso pode levar ao banimento do número e viola os termos do WhatsApp.** O repositório já registra um bloqueio da Meta em 25/09/2026. Por isso:

1. **Todo o desenvolvimento e o piloto rodam num número reserva.** O número principal (`551146375517`) só entra na etapa E100, com ordem escrita do dono.
2. A arquitetura é feita para **trocar o motor sem refazer o resto** (E005): quando a API oficial da Meta (Calling API) for viável, só o motor e o transporte de mídia mudam.
3. Há **kill-switch** em três níveis (E085) e um **gate de parada** em cada fase (seção 3).

---

## 1. Fatos verificados que o plano usa (e o que NÃO foi verificado)

| Fato | Fonte |
|---|---|
| `meowcaller` é Go puro (MIT), criado em 06/2026, **sem versão publicada** (só pseudo-versão); 21 issues abertas. Implementa chamadas de entrada e saída, áudio (codec MLow em Go), vídeo e grupo experimental. | repositório `purpshell/meowcaller` |
| `meowcaller.NewClient(wa)` **tem de ser chamado antes de `wa.Connect()`**. Áudio entra e sai como `float32` **16 kHz, mono, quadros de 960 amostras (60 ms)**. Vídeo = H.264 Annex B. | README e `docs/superpowers/specs/2026-07-29-call-answer-stream-design.md` do PR |
| PR #141 da Evolution GO (**aberto, não mesclado**, 19 arquivos, +5.239/−791): `POST /call/answer`, `/call/hangup`, `/call/dial`, `/call/react`, `/call/video/*` e `GET /call/stream/:callId` (WebSocket). Última versão publicada: **0.7.2 (03/07/2026)**, sem isso. | `evolution-foundation/evolution-go` |
| Formato do WebSocket: `{"event":"start","callId","sampleRate":16000,"video"}`, `{"event":"media","track":"inbound\|outbound","payload":"<base64 PCM16LE, 960 amostras>"}`, `{"event":"video",…}`, `{"event":"stop","reason"}`. **Autenticação por `?apikey=` na URL.** Se o WebSocket cai, o motor desliga a chamada. | mesmo spec |
| Problemas conhecidos do `meowcaller`: áudio de entrada ausente em alguns cenários (#36, #37, #40), **contas em Coexistência não conseguem atender (#35)**, outros aparelhos continuam tocando depois que um atende (#39), chaves SRTP ligadas ao dispositivo errado (#27). | issues abertas |
| No nosso código: `calls` já tem `channel`, `provider_call_id`, `whatsapp_connection_id`, `answered_by`, `end_reason`, `recording_url`, `recording_status`, `talk_seconds`; o provider tem a máquina de estados com canal; `capabilities.ts` já traz as razões `whatsapp_*`; `WhatsAppCallAdapter.ts` (T24) é o encaixe, hoje "só eventos"; `evolution-go-routes.ts` converte ações em rotas da Evolution GO; o webhook `CALL` já chega. | repositório (`dia/2026-10-07`) |
| O `CallSessionProvider.dial()` **ignora o canal e disca sempre por VoIP**; o cartão de chamada de saída é o cartão C02. | repositório |

**Não verificado (as etapas de laboratório existem para fechar isso):** se o `meowcaller` funciona com a **Evolution GO instalada hoje** (versão e hospedagem); se funciona no nosso tipo de número (WhatsApp Business num número fixo, com aparelho vinculado); a qualidade real do áudio; quanto atraso o caminho navegador → gateway → motor → WhatsApp adiciona; o limite de tempo de execução das Edge Functions do plano atual (por isso o gateway é um serviço à parte).

---

## 2. Arquitetura-alvo

```
 Navegador do atendente                      Nossa infraestrutura                              WhatsApp
┌────────────────────────┐   WSS (binário)  ┌─────────────────────┐  WS JSON (interno)  ┌────────────────────┐
│ CallSessionProvider     │◄────────────────►│ wa-call-gateway      │◄───────────────────►│ Evolution GO (fork) │──► servidores
│  canal 'whatsapp'       │  ticket 1 uso    │  JWT + ticket + audit│  apikey SÓ aqui     │  + meowcaller       │    do WhatsApp
│ AudioWorklet (mic/spk)  │                  │  1 consumidor/chamada│                     └────────────────────┘
└───────────┬────────────┘                  └──────────┬──────────┘
            │ REST (JWT)                                 │ eventos
            ▼                                            ▼
   Edge Function `whatsapp-call` ───────────► Evolution GO REST (/call/dial|answer|hangup|reject)
   Edge Function webhook `CALL` ───────────► tabela `calls` (idempotente por provider_call_id)
```

Princípios: (1) **o navegador nunca vê a chave da instância**; (2) **uma interface de transporte de mídia** (`MediaTransport`) com a implementação "PCM por WebSocket" agora e "WebRTC" para a API oficial depois; (3) **a chamada só existe se houver um consumidor**: sem WebSocket, o motor desliga; (4) tudo atrás de feature flag e kill-switch; (5) o estado da chamada vem do motor, nunca do que a tela supõe.

---

## 3. Portas de decisão (o plano para se a porta falhar)

| Porta | Quando | Critério de passagem | Quem decide |
|---|---|---|---|
| **G0** | fim da F0 | Número reserva existe; risco aceito por escrito; parecer jurídico lido; local do motor definido | Dono |
| **G1** | fim da F1 | Em 30 chamadas de teste (15 entrada, 15 saída): ≥ 90% com áudio nos dois sentidos; atraso boca-a-ouvido ≤ 600 ms; número reserva sem restrição após 7 dias | Claude propõe, Dono aprova |
| **G2** | fim da F4 | Gateway e Edge Functions passam na revisão de segurança (E044); nenhuma chave da instância trafega ao navegador | Claude + workerauth |
| **G3** | fim da F8 | Soak de 1 h sem vazamento; caos sem chamada órfã; checklist de navegadores | Claude |
| **G4** | E100 | Piloto de 14 dias no número reserva sem incidente; ordem escrita do dono para o número principal | **Dono** |

Se **G1 falhar**, o plano **para** e a recomendação passa a ser só a API oficial da Meta.

---

# PLANO EM 100 ETAPAS

Donos: **Dono** (Joaquim), **Claude** (verificações e infraestrutura que eu consiga alcançar), e os agentes da fábrica: **hugo** (hooks/lib), **iris** (telas), **designer**, **edgar** (Edge Functions), **workersql** (banco), **workerauth** (segurança), **workertestes**, **vera** (CI/docs), **complexo** (Devin, mudanças acopladas). *Infra* = quem tem acesso ao servidor da Evolution GO (hoje só o dono; eu não tenho).

## Fase 0 — Governança e decisões (E001–E010)

- **E001** [Dono] **Número reserva.** Um número WhatsApp (de preferência Business, num chip dedicado) só para o laboratório e o piloto. *Aceite:* número informado; nunca o `551146375517`.
- **E002** [Dono] **Aceite de risco por escrito.** O dono registra que entende o risco de banimento e a violação dos termos do WhatsApp. *Aceite:* texto em `docs/` assinado por commit do dono.
- **E003** [Dono] **Parecer jurídico.** Conversa com o advogado sobre engenharia reversa do protocolo/codec do WhatsApp e uso de biblioteca de pesquisa. *Aceite:* resposta registrada (não é parecer deste documento).
- **E004** [Claude] **ADR-0xx "motor de chamadas do WhatsApp".** Registra a decisão, as alternativas (API oficial da Meta, Wavoip, manter só eventos) e o critério de troca. *Aceite:* `docs/adr/` commitado.
- **E005** [Claude] **Contrato de transporte.** Define as interfaces `WhatsAppCallEngine` (dial/answer/hangup/reject/eventos) e `MediaTransport` (abrir/fechar/enviar quadro/receber quadro/estatísticas), para o motor ser trocável. *Aceite:* interfaces e testes de contrato escritos antes de qualquer implementação.
- **E006** [Dono] **Onde roda a Evolution GO hoje.** Servidor, versão, como é implantada, quem tem acesso. *Aceite:* resposta registrada; define quem executa as etapas *Infra*.
- **E007** [Claude] **Métricas de sucesso.** Taxa de chamadas com áudio bidirecional, atraso, falhas por 100 chamadas, restrições do número. *Aceite:* painel/planilha definidos.
- **E008** [Claude] **Registro de riscos** (seção 7) com dono e plano de resposta para cada um. *Aceite:* no documento.
- **E009** [Dono] **Quem atende e quem liga.** Perfis de usuário autorizados (hoje há a razão `whatsapp_restrito_supervisores`). *Aceite:* lista de papéis.
- **E010** [Claude] **Gate G0.** Confere E001–E009 e libera a F1. *Aceite:* G0 registrado.

## Fase 1 — Laboratório do motor (E011–E022) · só com o número reserva

- **E011** [Infra+Claude] **Ambiente isolado.** Máquina de teste separada da produção, sem acesso ao banco de produção. *Aceite:* ambiente de laboratório de pé.
- **E012** [Infra+Claude] **Compilar a Evolution GO do PR #141**, fixando o **SHA exato** do PR e a pseudo-versão do `meowcaller` (nunca `@latest`). *Aceite:* binário e imagem reproduzíveis; hash registrado.
- **E013** [Infra] **Subir uma instância de laboratório** e vincular o número reserva por QR. *Aceite:* instância conectada.
- **E014** [Claude] **Cliente de teste por linha de comando** que fala o WebSocket do PR e grava o áudio recebido em WAV. *Aceite:* script no repositório.
- **E015** [Claude] **Matriz de cenários**: entrada e saída; atendida no celular, no navegador, em outro aparelho vinculado; WhatsApp Business com aparelho vinculado; contato com versão antiga do WhatsApp (o fallback Opus do `meowcaller` ainda não existe). *Aceite:* planilha de cenários.
- **E016** [Dono+Claude] **15 chamadas de entrada**, em horários diferentes. *Aceite:* resultados na matriz (áudio nos dois sentidos? atraso medido com gravação).
- **E017** [Dono+Claude] **15 chamadas de saída** para contatos com conversa anterior. *Aceite:* idem.
- **E018** [Claude] **Medir o atraso boca-a-ouvido** (tom de teste + gravação dos dois lados). *Aceite:* mediana e p95 registradas.
- **E019** [Claude] **Casos de falha:** desligar de cada lado, recusar, não atender, perder a internet de cada lado, derrubar o WebSocket no meio. *Aceite:* o motor sempre desliga e nenhuma chamada fica órfã.
- **E020** [Claude] **Cruzar com as issues conhecidas** (#35, #36, #37, #39, #40): quais se reproduzem no nosso cenário. *Aceite:* tabela issue × reproduz.
- **E021** [Dono] **Observação do número por 7 dias** após o laboratório: algum aviso, restrição ou queda de qualidade? *Aceite:* relato.
- **E022** [Claude] **Gate G1** com os números de E016–E021. *Aceite:* relatório; se falhar, **o plano para**.

## Fase 2 — Motor e infraestrutura (E023–E032)

- **E023** [Infra+Claude] **Repositório do fork** da Evolution GO (nosso), com o PR #141 como base e a política de atualização: acompanhar o upstream a cada 15 dias, nunca atualizar `meowcaller` sem rodar a matriz. *Aceite:* fork criado, política escrita.
- **E024** [Claude] **Patch mínimo nosso:** autenticação do WebSocket por **ticket de uso único no cabeçalho/subprotocolo**, em vez de `?apikey=` na URL (a URL vai para logs e proxies). *Aceite:* patch pequeno, testado, proposto também ao upstream.
- **E025** [Claude] **Limites no motor:** tamanho máximo de mensagem, no máximo 1 consumidor por chamada, tempo máximo de chamada configurável, desligar se o consumidor ficar mudo por N segundos. *Aceite:* testes do motor.
- **E026** [Infra] **Imagem de contêiner e esteira de build** com SBOM e verificação de vulnerabilidades. *Aceite:* imagem publicada num registro privado.
- **E027** [Infra] **Implantação no ambiente de piloto** com rede interna entre gateway e motor; porta do motor **não exposta** à internet. *Aceite:* só o gateway alcança o motor.
- **E028** [Infra] **Segredos:** chave da instância apenas no gateway e no motor; rotação documentada. *Aceite:* nenhuma chave em variável de ambiente do navegador, do Vercel ou do repositório.
- **E029** [Claude] **Saúde e observabilidade:** `/health`, métricas Prometheus (chamadas ativas, quadros enviados/perdidos, tempo de setup), logs sem número de telefone completo. *Aceite:* painel mínimo.
- **E030** [Claude] **Versão e rollback do motor:** tag imutável por versão, comando de voltar à anterior em um passo. *Aceite:* ensaio de rollback feito.
- **E031** [Infra] **Backup/restauração da sessão do WhatsApp** (o pareamento por QR é frágil). *Aceite:* restauração ensaiada.
- **E032** [Claude] **Documento de operação** (subir, parar, atualizar, o que fazer se o número cair). *Aceite:* `docs/telefonia/` atualizado.

## Fase 3 — Gateway seguro (E033–E044)

- **E033** [Claude] **Decisão de hospedagem do gateway.** Serviço próprio (recomendado) × Edge Function com WebSocket; as Edge Functions têm limite de tempo de execução (**verificar o valor no plano atual**) e chamadas passam de minutos. *Aceite:* ADR curto.
- **E034** [complexo] **Esqueleto do `wa-call-gateway`** (Go ou Deno, conforme E033): HTTP + WebSocket, configuração por ambiente, encerramento limpo. *Aceite:* sobe, responde `/health`.
- **E035** [workerauth] **Autenticação:** valida o JWT do Supabase, o papel do usuário e o acesso à `whatsapp_connection`. *Aceite:* chamada sem permissão recebe 403; testes de tabela por papel.
- **E036** [workerauth] **Ticket de uso único:** emitido pela Edge Function, válido por 60 s, amarrado a usuário + chamada + conexão, consumido no upgrade do WebSocket. *Aceite:* reutilizar o ticket falha; ticket expirado falha.
- **E037** [complexo] **Proxy de quadros** navegador ↔ motor, com **binário** no lado do navegador (menos 33% de banda do que base64) e JSON no lado do motor. *Aceite:* conversão sem perda, testada com sinal sintético.
- **E038** [complexo] **Um consumidor por chamada**, com reivindicação atômica (a segunda aba recebe "chamada já atendida em outro lugar"). *Aceite:* teste de corrida com 2 conexões.
- **E039** [complexo] **Contrapressão e fila limitada:** descarta o quadro mais antigo em vez de crescer a latência. *Aceite:* teste com consumidor lento mantém atraso limitado.
- **E040** [complexo] **Desligar ao cair:** WebSocket do navegador cai → gateway pede ao motor para desligar após uma tolerância curta (reconexão de até 3 s). *Aceite:* teste de queda e reconexão.
- **E041** [workerauth] **Limites de abuso:** conexões por usuário, taxa de quadros, tamanho de quadro, tempo ocioso. *Aceite:* excedeu → fecha com código claro.
- **E042** [complexo] **Auditoria:** quem atendeu/ligou, para qual contato, quando, duração, motivo do fim (sem áudio e sem número completo nos logs). *Aceite:* linha de auditoria por chamada.
- **E043** [workertestes] **Motor falso** (gera tom e responde ao protocolo do PR) para testes do gateway sem WhatsApp. *Aceite:* suíte do gateway roda na esteira sem número real.
- **E044** [Claude+workerauth] **Revisão de segurança do gateway:** TLS, CORS/origem, injeção, logs, segredos, negação de serviço. *Aceite:* relatório sem achado crítico aberto.

## Fase 4 — Banco e Edge Functions (E045–E054)

- **E045** [workersql] **Política por conexão** (`whatsapp_call_policy`): ligado/desligado, saída permitida, limite diário, janela de horário, intervalo mínimo entre ligações, duração máxima. RLS por papel. *Aceite:* migration com rollback executável e prova com papel real.
- **E046** [workersql] **Campos que faltarem em `calls`** (somente o que a F1 mostrar necessário: p.ex. estatísticas de qualidade). *Aceite:* migration mínima; sem tocar nas colunas existentes.
- **E047** [workersql] **Reivindicação atômica no banco:** `answered_by` só é gravado se ainda for nulo. *Aceite:* teste de duas sessões simultâneas.
- **E048** [workersql] **Tabela de gravações** (`call_recordings`) e política de retenção por `pg_cron`. *Aceite:* RLS e retenção provadas; bucket privado.
- **E049** [edgar] **Edge Function `whatsapp-call`**: `dial`, `answer`, `hangup`, `reject`, `ticket`, com `evolution-go-routes.ts` como padrão. *Aceite:* testes de contrato; JWT obrigatório; função listada no `config.toml` com `verify_jwt` correto.
- **E050** [edgar] **Normalização do número e checagem antes de ligar:** E.164 BR (nono dígito), e **confirmar que o número tem WhatsApp** antes de discar (ligar para quem não tem WhatsApp é sinal ruim para o número). *Aceite:* testes de tabela com números reais mascarados.
- **E051** [edgar] **Webhook `CALL` completo:** `offer`, `accept`, `terminate` e motivo, idempotente por `provider_call_id`; o evento reenviado com `event_id` novo não duplica. *Aceite:* teste de reenvio.
- **E052** [edgar] **Mapa de motivos de término** do WhatsApp para `end_reason`/`status` do nosso banco. *Aceite:* tabela de mapeamento testada.
- **E053** [workersql] **Evitar chamada fantasma:** rotina que encerra no banco chamadas "em curso" sem eventos há mais de N minutos. *Aceite:* teste com chamada órfã.
- **E054** [Claude] **Gate G2.** Segurança e dados revisados. *Aceite:* G2 registrado.

## Fase 5 — Ponte de áudio no navegador (E055–E066)

- **E055** [hugo] **Captura:** `getUserMedia` com `echoCancellation`, `noiseSuppression`, `autoGainControl` ligados; escolha de microfone e alto-falante. *Aceite:* testes com dispositivos simulados.
- **E056** [hugo] **`AudioWorklet` de captura:** entrada a 48/44,1 kHz → **16 kHz mono**, quadros de **960 amostras** em PCM16. *Aceite:* teste com onda conhecida mede a taxa e a fase.
- **E057** [hugo] **Reamostragem de qualidade** (filtro anti-aliasing) sem custo alto de CPU. *Aceite:* distorção medida abaixo do limite definido.
- **E058** [hugo] **`AudioWorklet` de reprodução** com **jitter buffer** (alvo ~120 ms), compensação de deriva de relógio e ocultação de perdas (repete/atenua o último quadro). *Aceite:* teste com perdas simuladas.
- **E059** [hugo] **Cliente do WebSocket** (`WsPcmTransport`, implementação de `MediaTransport`): conecta com o ticket, binário, reconexão curta, estatísticas de RTT por ping/pong. *Aceite:* testes com gateway falso.
- **E060** [hugo] **Mudo:** enviar silêncio em vez de parar o fluxo (não derruba a chamada). *Aceite:* teste de mudo/desmudo.
- **E061** [hugo] **Política de autoplay:** o `AudioContext` só retoma com gesto do usuário (clique em Ligar/Atender). *Aceite:* testado em Chrome, Edge, Firefox e Safari.
- **E062** [hugo] **Desempenho:** CPU e memória no navegador durante 30 min de chamada. *Aceite:* sem vazamento; orçamento de CPU respeitado.
- **E063** [hugo] **Seleção de saída de áudio** (`setSinkId`) onde houver suporte; aviso onde não houver. *Aceite:* testes.
- **E064** [designer] **Indicador de qualidade da chamada** (RTT, perda) acessível, sem poluir o cartão. *Aceite:* contraste e leitor de tela verificados.
- **E065** [workertestes] **Teste ponta a ponta com áudio simulado** no navegador (Playwright com microfone falso e arquivo de áudio). *Aceite:* o áudio de teste atravessa o gateway falso e volta.
- **E066** [hugo] **Pacote isolado:** nada de áudio carrega fora de uma chamada WhatsApp (import dinâmico); orçamento do bundle inicial intacto. *Aceite:* contrato que prova o carregamento sob demanda.

## Fase 6 — Integração no provider e na interface (E067–E080)

- **E067** [complexo] **Seleção de canal no `CallSessionProvider`:** `dial(telefone, {canal})` e `onStartCall` passam a respeitar `pedido.channel`; VoIP continua como hoje. *Aceite:* testes dos dois canais; o discador e o histórico não mudam.
- **E068** [complexo] **`WhatsAppCallAdapter` deixa de ser só eventos:** `dial` e `accept` usam o `WhatsAppCallEngine`. *Aceite:* o contrato de E005 passa.
- **E069** [complexo] **Mapa de estados:** oferta → `ringing_in`; discando → `dialing`; tocando → `ringing_out`; aceita → `connecting`; **`active` só no primeiro quadro de áudio recebido**; término → estado terminal com motivo. *Aceite:* tabela de transições testada.
- **E070** [complexo] **Outro aparelho atendeu** (o celular, p.ex.): a chamada para de tocar e vira "atendida em outro aparelho". *Aceite:* teste com evento simulado.
- **E071** [iris] **Alerta de chamada recebida por WhatsApp:** botões Atender e Recusar de verdade (hoje "Ignorar"), com o nome do contato. *Aceite:* testes de renderização e acessibilidade.
- **E072** [iris] **Cartão de chamada de saída** (do C02) com o canal WhatsApp, estado "chamando" e foto do contato. *Aceite:* teste.
- **E073** [iris] **Menu "Ligar via WhatsApp"** habilitado só pela capacidade do canal (`capabilities.ts`), com a razão em texto quando indisponível. *Aceite:* testes por razão.
- **E074** [complexo] **Conflito entre canais:** uma chamada ativa (VoIP ou WhatsApp) bloqueia a outra, com aviso claro. *Aceite:* teste.
- **E075** [complexo] **Persistência:** `upsert_my_call` com `channel='whatsapp'`, `provider_call_id`, `talk_seconds`, `end_reason`. *Aceite:* linha correta por chamada.
- **E076** [iris] **Histórico e resumo pós-chamada** mostram o canal WhatsApp e a duração falada. *Aceite:* testes.
- **E077** [iris] **Barra de chamada ativa** (`ActiveCallBar`/`ActiveCallPanel`) com mudo, desligar e qualidade. *Aceite:* testes.
- **E078** [hugo] **Telemetria do navegador:** eventos de ciclo de vida da chamada e estatísticas de qualidade para o gateway. *Aceite:* sem número completo nem áudio.
- **E079** [iris] **Telas estreitas (390 px) e teclado/leitor de tela** no fluxo inteiro. *Aceite:* checklist.
- **E080** [vera] **Documentação do usuário** ("como ligar e atender pelo WhatsApp", limites e boas práticas). *Aceite:* documento revisado.

## Fase 7 — Conformidade, proteção do número e gravação (E081–E090)

- **E081** [workerauth] **Guarda de saída:** só liga para contato com **conversa anterior** (pelo menos uma mensagem recebida do contato nos últimos N dias). Ligar para desconhecido é o maior risco de banimento. *Aceite:* teste de tabela.
- **E082** [edgar] **Limite diário e intervalo mínimo** por conexão, lidos da política (começar com 10 por dia). *Aceite:* o 11º pedido do dia é recusado com motivo.
- **E083** [edgar] **Aquecimento do número:** rampa de limites nos primeiros 14 dias. *Aceite:* configuração e teste.
- **E084** [edgar] **Pausa automática:** erros repetidos, desconexão, "limite de taxa" do WhatsApp ou queda de taxa de atendimento pausam as chamadas da conexão e avisam o dono. *Aceite:* simulação dispara a pausa.
- **E085** [complexo] **Kill-switch em 3 níveis:** feature flag `whatsapp_voice` (por conexão e global), variável do motor e botão do supervisor. *Aceite:* cada nível derruba a chamada em curso com mensagem clara.
- **E086** [edgar] **Gravação desligada por padrão.** Quando ligada: aviso de consentimento tocado ao início (o WhatsApp não tem URA), gravação dos dois canais no bucket privado, URL assinada de vida curta. *Aceite:* sem consentimento tocado, não grava.
- **E087** [workersql] **Retenção e exclusão** das gravações por política e por pedido do titular (LGPD). *Aceite:* rotina testada.
- **E088** [workerauth] **Controle de acesso à gravação** (quem ouve), com auditoria de cada escuta. *Aceite:* teste por papel.
- **E089** [vera] **Aviso de risco na interface de configuração** e texto do consentimento revisados com o jurídico. *Aceite:* textos aprovados pelo dono.
- **E090** [workerauth] **Revisão de privacidade final** (dados pessoais em logs, métricas, gravações). *Aceite:* relatório sem achado aberto.

## Fase 8 — Qualidade e testes (E091–E096)

- **E091** [workertestes] **Contratos** de `MediaTransport`, `WhatsAppCallEngine` e do formato do WebSocket, que falham se alguém mudar o protocolo. *Aceite:* contratos verdes e provados por mutação.
- **E092** [workertestes] **Soak de 1 hora** com motor falso e navegador simulado: sem vazamento de memória nem de conexão. *Aceite:* relatório.
- **E093** [workertestes] **Caos:** reiniciar o gateway, derrubar o motor, cortar a rede no meio, abrir duas abas, fechar a aba. *Aceite:* nenhuma chamada órfã; estado do banco coerente.
- **E094** [workertestes] **Matriz de navegadores e aparelhos** (Chrome, Edge, Firefox, Safari; notebook com fone e com alto-falante). *Aceite:* checklist preenchido.
- **E095** [Claude] **Verificação completa** (tipos, lint, testes, contratos, build, teto do bundle) e revisão de cada cartão por mim. *Aceite:* verde; bundle inicial ≤ 343 KB.
- **E096** [Claude] **Gate G3.** *Aceite:* G3 registrado.

## Fase 9 — Piloto e entrada em produção (E097–E100)

- **E097** [Dono+Claude] **Piloto no número reserva** com **1 atendente** por 14 dias, com a política de limites ligada. *Aceite:* diário do piloto.
- **E098** [Claude] **Revisão do piloto:** métricas da E007, incidentes, restrições do número. *Aceite:* relatório de go/no-go.
- **E099** [Claude] **Abrir para mais atendentes** do número reserva, gradualmente (1 → 3 → todos), com o kill-switch testado em cada degrau. *Aceite:* sem incidente por 7 dias.
- **E100** [**Dono**] **Decisão sobre o número principal (G4).** Só com ordem escrita do dono, depois do piloto limpo e com a política de limites ligada desde o primeiro dia. Se o dono preferir a API oficial da Meta, o motor é trocado pela implementação oficial do contrato da E005, e **as fases 5 a 9 são reaproveitadas**. *Aceite:* decisão registrada.

---

## 4. Mapa por agente

| Agente | Etapas | O que entrega |
|---|---|---|
| **Dono** | E001–E003, E006, E009, E016–E017, E021, E097, E100 | Número reserva, risco, jurídico, servidor, decisões finais |
| **Claude** | E004–E005, E007–E008, E010–E015, E018–E020, E022–E025, E029–E030, E032–E033, E044, E054, E095–E096, E098–E099 | Arquitetura, laboratório, infraestrutura que eu alcançar, portas de decisão, verificações |
| **complexo** | E034, E037–E040, E042, E067–E070, E074–E075, E085 | Gateway e provider (partes acopladas) |
| **hugo** | E055–E063, E066, E078 | Áudio no navegador |
| **iris** | E071–E073, E076–E077, E079 | Telas de chamada |
| **edgar** | E049–E052, E082–E084, E086 | Edge Functions e regras de proteção |
| **workersql** | E045–E048, E053, E087 | Banco, retenção, reivindicação atômica |
| **workerauth** | E035–E036, E041, E044, E081, E088, E090 | Autenticação, ticket, acesso, privacidade |
| **workertestes** | E043, E065, E091–E094 | Motor falso, e2e, caos, soak |
| **vera** | E080, E089 | Documentação e textos |
| **designer** | E064 | Indicador de qualidade |

## 5. Dependências críticas
- F1 depende de G0. F2 a F9 **só começam depois de G1 aprovado**.
- E024 (ticket no cabeçalho) precede E036.
- E005 (interfaces) precede E043, E059, E068 e E091.
- E067–E070 dependem do cartão C02 (cartão de saída no chat) integrado.
- E100 depende de G4.

## 6. Fora de escopo (deliberado)
Vídeo e chamada em grupo (a biblioteca os tem, mas são experimentais); URA/DTMF (o WhatsApp não tem); transcrição e IA de voz; ligações para números sem conversa anterior; qualquer uso do número principal antes de G4; reescrever o protocolo do WhatsApp.

## 7. Registro de riscos

| Risco | Prob. | Impacto | Resposta |
|---|---|---|---|
| Banimento do número | Média | **Alto** | Número reserva; limites; pausa automática; kill-switch; G4 |
| Biblioteca instável / sem áudio em alguns cenários | **Alta** | Alto | Laboratório (F1) e G1; fixar SHA; motor trocável (E005) |
| WhatsApp muda o protocolo e a chamada quebra | Média | Alto | Fork com política de atualização; kill-switch; plano B = API oficial |
| Vazamento da chave da instância | Baixa | Alto | Gateway + ticket; chave só no servidor (E028, E036) |
| Violação da LGPD (gravação sem consentimento) | Média | Alto | Gravação desligada por padrão; consentimento tocado (E086–E090) |
| Atraso de áudio alto no caminho navegador → gateway → motor | Média | Médio | Binário no navegador; medir no F1; jitter buffer curto |
| Eco e má qualidade sem fone | Alta | Médio | Constraints do navegador; aviso de fone; indicador de qualidade |
| Questão jurídica / propriedade intelectual | Média | Alto | Parecer (E003) antes de G0 |
| Dependência de um fork nosso | Alta | Médio | Política de atualização; interface de motor trocável |

## 8. Critérios de aceite do conjunto
1. Ligar e atender pelo WhatsApp dentro do sistema, com áudio nos dois sentidos, no número reserva.
2. O navegador nunca recebe a chave da instância.
3. Nenhuma chamada órfã (banco ou motor) depois de queda de rede, de aba ou de serviço.
4. Todas as proteções ativas por padrão: guarda de saída, limite diário, pausa automática, kill-switch.
5. Bundle inicial ≤ 343 KB; o código de áudio só carrega numa chamada WhatsApp.
6. Trocar o motor (por exemplo, para a API oficial da Meta) não exige refazer estado, histórico nem interface.

## 9. Estado de execução
_A preencher ao longo da execução. Nenhuma etapa foi iniciada._

# Campanhas / Talk X — plano de recuperação e implementação em 100 etapas

Versão 2 · 12/09/2026 · Estado: EM EXECUÇÃO, COM GAPS EXPLÍCITOS.

## Resultado contratado

Entregar as 17 telas de referência com composição fiel adaptada ao **tema carvão**, funcionalidades conectadas a fontes reais, integridade de audiência/agendamento/envio e evidências reproduzíveis de aceite. Preservar componentes e integrações existentes quando corretos; não iniciar uma reescrita indiscriminada.

**Nenhum plano é infalível.** Este plano reduz o risco do anterior com testes antecipados, checkpoints de produto, gates obrigatórios, execução incremental, limites de segurança e proibição de declarar como pronta uma capacidade apenas desenhada. Se uma premissa falhar, registrar a descoberta e revisar a dependência antes de continuar; não improvisar uma substituição silenciosa.

Base: [diagnóstico de 15 grupos de achados e 17 referências](../audits/talkx-2026-09-11/DIAGNOSTICO_CAMPANHAS.md). Esse diagnóstico usou a main `9251ac45`. Ao preparar este plano, a main consultada já era `9c99b164`, com nova função `talkx-report` e comparativo de campanhas. **Revalidar o código atual antes de corrigir qualquer achado antigo.** Não inferir funcionamento integral pelo título do commit E80/E81/E82.

## Estado de execução em 12/09/2026

Baseline atual: `main` `cb6862e93db42b5f7973b66990847143ec08cc72`, após as PRs [#368](https://github.com/adm01-debug/Zapp_Web_V2/pull/368), [#369](https://github.com/adm01-debug/Zapp_Web_V2/pull/369) e [#371](https://github.com/adm01-debug/Zapp_Web_V2/pull/371). Esta seção é um overlay conservador: prevalece sobre os diagnósticos históricos, mas não altera o critério de aceite de nenhuma etapa.

- **VERIFICADA:** o critério técnico delimitado da etapa possui código integrado, teste positivo e, quando aplicável, promoção/atestação no banco canônico.
- **PARCIAL:** houve implementação comprovada, mas falta ao menos uma parte do aceite funcional, visual, operacional ou de dados.
- **PENDENTE:** a capacidade principal ou o gate final ainda não foi demonstrado.

| Fase | Verificadas | Parciais | Pendentes |
|---|---|---|---|
| 001–010 | 001–002, 009 | 003–008 | 010 |
| 011–020 | 011–013, 016–019 | 014–015, 020 | — |
| 021–030 | 022 | 021, 023–025, 027, 029–030 | 026, 028 |
| 031–040 | — | 031, 033–038 | 032, 039–040 |
| 041–050 | 041, 043–044 | 042, 045–048, 050 | 049 |
| 051–060 | 051 | 052–053, 056–058 | 054–055, 059–060 |
| 061–070 | — | 061–065, 067–069 | 066, 070 |
| 071–080 | — | 071–072, 074–079 | 073, 080 |
| 081–090 | — | 085–087 | 081–084, 088–090 |
| 091–100 | 097 | 093, 095–096, 098 | 091–092, 094, 099–100 |
| **Total** | **16** | **57** | **27** |

As 16 verificações não representam “16% pronto”: as etapas têm pesos e escopos diferentes. Em particular, o núcleo de integridade de rascunho, rota, FSM, leases, recibos, resultado desconhecido, fuso e ACL foi promovido; isso não conclui CRM 360°, dispatcher durável, atribuição comercial, telas 13–16 nem o aceite visual 17/17.

### Evidências das etapas verificadas

| Etapas | Evidência integrada |
|---|---|
| 001–002 | base reconciliada; referências em [`docs/talkx/references/`](references/README.md), manifesto com 17/17 hashes; [triagem dos diagnósticos](../audits/TALKX_AUDIT_ARCHIVE_2026-09-11.md) |
| 009 | gates Talk X em `.github/workflows/ci.yml` e `.github/workflows/db-guard.yml` |
| 011 | `scripts/db-audit/talkx-analytics-contract.test.mjs` impede métricas fabricadas |
| 012–013, 016–019 | testes positivos em `src/components/talkx/__tests__/useCampaignEditor.test.tsx`, `TalkXView.route.test.tsx`, `talkxWizardRoute.test.ts` e `talkxCampaignDraft.test.ts` |
| 022, 041, 043–044, 051 | harnesses PostgreSQL 17 e atestação runtime: `talkx-draft-save.test.sh`, `talkx-draft-recipients.test.sh`, `talkx-campaign-state-transitions.test.sh`, `talkx-delivery-leases.test.sh` e `talkx-recovery-runtime.sql` |
| 097 | promoção controlada pela PR #369, hardening final pela PR #371 e sincronização de tipos/catálogos em `cb6862e9` |

### Pendências que bloqueiam o 10/10

1. Aceite visual autenticado e responsivo das 17 referências, preservando carvão.
2. CRM 360° funcional no wizard e pipeline de importação/vinculação retomável.
3. Preflight revisionado e cadeia ponta a ponta audiência→provider→webhook→resultado comercial.
4. Dispatcher/observabilidade operacional completos, caos controlado e orçamento de capacidade.
5. Atribuição verificável de respostas, cliques, conversões e receita.
6. Telas dedicadas de pausa, relatório concluído, ajuda e todos os estados/modais.
7. Observação pós-release e encerramento com evidências 17/17.

### Escopo e limites de autorização

- Repositório alvo: `adm01-debug/Zapp_Web_V2`.
- Banco canônico: projeto Supabase `tnnnlkbymytvtqngbbqh`. Não substituir por self-hosted, banco de outro produto ou projeto de CRM.
- O banco externo de empresas/contatos é uma fonte diferente; identidade, permissões, contrato e direção de sincronização precisam ser provados em 005/028. Não presumir Bitrix24 apenas porque o plano antigo dizia isso.
- Site: `https://zapp-web-v2.vercel.app`. Confirmar projeto Vercel, branch e SHA antes de qualquer publicação.
- Esta solicitação autoriza criar o plano, **não executa automaticamente migrations, push, deploy, envios, novas assinaturas ou alterações de acesso**. Na execução, registrar a autorização aplicável a cada operação externa; autorização anterior não deve ser ampliada por inferência.
- Não exibir secrets; não copiar credenciais entre projetos sem autorização específica. Funções usam secrets pelo mecanismo oficial; nunca migration ou frontend.
- Não remover rascunhos supostamente duplicados, reescrever ledger histórico, desabilitar RLS ou realizar disparos de teste a clientes. Dados reais existentes pertencem ao usuário.
- Se implementação paralela for autorizada, cada executor deve ter arquivos/responsabilidade definidos, uma única fila de migrations e coordenação de merges. Não presumir que está sozinho no repositório.

### Regras de produto que não podem ser reinterpretadas pelo executor

1. **Carvão permanece.** Azul é acento de ação/seleção, não novo fundo global. Nenhuma alteração global de tema para aproximar o navy dos PNGs.
2. Os PNGs originais são referências imutáveis. Criar especificação aprovada em carvão; o executor não pode aprovar sua própria divergência como nova referência.
3. Na tela 08, a proposta deste plano é manter o bloco de mensagem visível abaixo do público, como na imagem; o passo 2 aprofunda a mesma mensagem, sem criar um segundo estado independente. Formalizar essa decisão em 004 antes da implementação visual.
4. Métrica sem fonte não recebe valor plausível: usar estado explícito de indisponibilidade. Isso **não** conclui a capacidade prometida; a funcionalidade continua pendente até fonte real ou retirada formal de escopo pelo usuário.
5. Nenhum botão ativo sem efeito. Nenhum gráfico decorativo apresentado como medição. Nenhum “em breve” conta como tela implementada.
6. Bloqueio de integração não impede construir/testar a apresentação com fixtures isoladas, mas bloqueia o aceite funcional e a release completa dessa integração.
7. Testes que reproduzem bugs têm valor de diagnóstico. Converter o comportamento esperado em testes de regressão; não usar PASS dos probes antigos como aceite de correção.
8. Não prometer exatamente-uma-vez no provedor sem suporte verificável: timeout após envio pode ser ambíguo. Tratar esse estado e impedir reenvio cego.

## Como executar e medir sem repetir a falha

### Estados e evidência por etapa

Estados: `PENDING → IN_PROGRESS → IMPLEMENTED → VERIFIED`; estados laterais `BLOCKED` e `REOPENED`. Todas as 100 etapas começam PENDING. “Já existia” exige revalidação para virar VERIFIED.

Cada etapa deve registrar: responsável; SHA base e SHA implementado; dependências; arquivos/RPCs/tabelas afetados; ambiente; autorização de operações externas; comando dos testes; exit code e resumo; screenshots quando há UI; evidência de dados; defeitos residuais; decisão de revisão. Guardar em `docs/talkx/recovery/evidence/<ID>/` ou artefato privado com referência e hash, sem PII/secrets. Não versionar traces autenticados sem sanitização.

Uma fase só passa seu gate quando as etapas exigidas têm evidência. Código implementado, layout aprovado em fixture, integração validada e deploy verificado são colunas separadas. Não converter média ponderada em “10/10” enquanto uma dimensão crítica falha.

### Definition of Done aplicável a todas as etapas

- Alteração corresponde ao requisito e preserva funcionalidades existentes.
- Teste do caminho feliz e de pelo menos uma falha relevante, usando lógica produtiva importada.
- Typecheck, build, lint sem dívida nova e testes afetados passam; não enfraquecer testes nem atualizar baseline para esconder regressão.
- UI: captura na referência 1672×941, verificação 1280×800 e 390×844, teclado e zoom 200%; elementos novos aprovados antes de propagar o padrão.
- Dados: operação autorizada, invariantes e RLS verificadas, paginação/contagem coerentes; erro não vira silenciosamente lista vazia ou sucesso.
- Migração: versão única, forward-only, staging, compatibilidade com release anterior, plano de recuperação e revisão de lock/volume. Campos/tabelas abaixo são propostas até comparar com o schema real.
- Nenhuma função adicionada fica sem consumidor quando o requisito é integração. Provar a cadeia UI → API → persistência → leitura → UI.
- Sem aprovação visual autenticada, registrar “visual de produção não verificado”. Sem credencial apropriada, parar a porção bloqueada, não contornar login.

### Gates e sequência

| Faixa | Entrega | Gate de saída |
|---|---|---|
| 001–010 | Contratos, ambientes e testes antecipados | Referências/fixtures/gates operacionais; risco de escopo conhecido |
| 011–020 | Integridade do fluxo existente | Defeitos de rascunho, rota, fuso e validação corrigidos em teste |
| 021–030 | Audiência e supressão reais | Contagem e persistência sem truncamento ou sobreposição indevida |
| 031–040 | Nova campanha e revisão em carvão | Aceite visual 08/09 e funcional da origem ZAPP; CRM continua rastreado |
| 041–050 | Motor e agendamento duráveis | Concorrência, pausa, timeout e retomada comprovados com provedor stub |
| 051–060 | Eventos, métricas e relatórios | Golden dataset e atribuição verificável; sem números fabricados |
| 061–070 | Lista, ciclo de vida e analytics | Telas operacionais com ações reais e estados completos |
| 071–080 | Segmentos e templates | Bibliotecas/editores conectados a fontes e ao wizard |
| 081–090 | Importação CRM, supressão e hardening | Integrações, autorização e desempenho fechados |
| 091–100 | Ajuda, aceite integrado e release | 17/17 aceites, deploy controlado, canário e observação |

Sequência padrão é a ordem numérica. Dependências abaixo são os pré-requisitos técnicos mínimos, não autorização para pular gates anteriores. Pode avançar trabalho independente com bloqueios registrados, mas não declarar fase/release concluída. Gates 040/070 são explicitamente intermediários: não certificam as capacidades CRM/importação/ajuda que só serão fechadas depois.

## Fase A — Contratos e validação antes de implementar

### 001 — Congelar a base de trabalho e reconciliar trabalho concorrente

Dependências: nenhuma. Responsável: Tech Lead/Release. Ambiente: local, consultas remotas read-only.

- **Executar:** verificar status, remotos e alterações do usuário; fetch; comparar checkout, main, PRs abertos e `/version.json`. Registrar novidades posteriores a `9c99b164`, especialmente wizard, sender e relatório. Criar branch/worktree de execução a partir da base validada sem apagar mudanças existentes.
- **Validar:** provar identidade do repositório e ausência de mudanças perdidas; classificar cada achado da auditoria como reproduzível, corrigido no upstream ou ainda não verificado.
- **Entregar/aceite:** `recovery/BASELINE.md` com SHAs, inventário de mudanças e responsáveis. Não fazer pull cego, reimplementar correção remota ou usar status histórico como estado atual.

### 002 — Preservar e catalogar as 17 referências

Dependências: 001. Responsável: Design/QA. Ambiente: local.

- **Executar:** usar os PNGs originais versionados em [`docs/talkx/references/`](references/README.md); não editar metadados/conteúdo. Nome, bytes, dimensões e SHA-256 estão em [`MANIFESTO.json`](references/MANIFESTO.json). Artefatos NTFS `Zone.Identifier` foram removidos e estão bloqueados no `.gitignore`.
- **Validar:** 17 IDs únicos, resolução original preservada, nenhum arquivo antigo/rejeitado substituindo o aprovado; abrir cada imagem para verificar correspondência.
- **Entregar/aceite:** manifesto visual com IMG01–IMG17, hash, descrição e link estável; não confundir estes IDs com os probes R01–R11 da auditoria. Export gerado ou imagem alterada nunca substitui o original silenciosamente.

### 003 — Criar rastreabilidade entre promessa, código, dados e aceite

Dependências: 001, 002. Responsável: Produto/QA.

- **Executar:** decompor cada tela IMG01–IMG17 em blocos, campos, indicadores, ações e estados; atribuir IDs de requisito e relacionar aos achados C01–C15, probes R01–R11, componentes, queries e testes. Incluir todos os controles aparentemente pequenos: filtros, ordenação, paginação, menus, atalhos, fechar e limpar.
- **Validar:** nenhum requisito sem etapa responsável; nenhuma etapa concluída só porque um arquivo existe; distinguir capacidade ausente de fonte de dados indisponível.
- **Entregar/aceite:** `recovery/TRACEABILITY.md` e registro estruturado com status separado de layout, função, dados e produção. Não usar checklists antigos como prova.

### 004 — Resolver contradições visuais e comportamentais

Dependências: 002, 003. Responsável: Produto/Design com aceite do usuário.

- **Executar:** formalizar adaptação navy→carvão, presença da mensagem no step 1 e edição aprofundada no step 2, responsável versus conexão, fontes da audiência e posição das ações. Definir fonte/tipografia, limites de densidade e breakpoints; evitar títulos/truncamentos usados para esconder conteúdo.
- **Validar:** produzir wireframe ou composição HTML de 08/09; usuário aprova decisões que divergem do PNG, não apenas “plano aprovado” genérico. Não alterar o layout global sem inventário dos consumidores.
- **Entregar/aceite:** ADR visual e especificação de comportamento. Sem decisão sobre conflito, bloquear esse requisito e prosseguir apenas em trabalho independente.

### 005 — Inventariar capacidades reais e contratos externos

Dependências: 001, 003. Responsável: Backend/DBA/Produto. Ambiente: read-only autorizado.

- **Executar:** provar projeto Supabase, schema e funções atuais; identificar fonte canônica de empresas, contatos, compras e consentimento. Catalogar CRM real, provedor WhatsApp, storage e serviço de e-mail. Listar capabilities disponíveis, permissões e campos faltantes; não inferir pelo nome do MCP.
- **Validar:** consultas estruturais/agregadas sem PII; confirmar fontes para RFM, vendedor, estágio, receita, identidade externa e ACK. Registrar limitações do provedor e custos que exigiriam escolha do usuário.
- **Entregar/aceite:** matriz capacidade→fonte→credencial→responsável→fallback honesto. Fonte não disponível continua bloqueada, não recebe dado simulado em produção.

### 006 — Definir contratos de domínio, estados e indicadores

Dependências: 003, 005. Responsável: Backend/DBA/Produto.

- **Executar:** definir estados de campanha e destinatário, transições autorizadas, versão do rascunho, identidade de snapshot, destinatário único e semântica de pausa/cancelamento. Para métricas: unidade, denominador, período, fuso, atribuição e diferença entre zero e unknown.
- **Validar:** simular em mesa dois starts, edição concorrente, falha após envio, ACK atrasado, supressão posterior ao agendamento, campanha vazia e base incompleta. Registrar decisão para cada cenário antes de desenhar dashboards.
- **Entregar/aceite:** ADRs de domínio e tabela de invariantes que serão traduzidos em constraints/testes. Impedir totalização que soma contagens sobrepostas.

### 007 — Preparar ambientes e limites de segurança

Dependências: 001, 005, 006. Responsável: DevOps/Segurança.

- **Executar:** preparar local/staging separados da produção; mock do provedor sem fallback para URL real; contas de teste de perfis distintos e storage isolado. Confirmar recuperação/backup de staging e procedimento do canônico. Registrar autorização antes de provisionamento pago ou escrita externa.
- **Validar:** tentativa de usar hostname/projeto de produção no modo de teste deve falhar; nenhum segredo no bundle/log; negação de acesso entre usuários/organizações conforme modelo real.
- **Entregar/aceite:** checklist de ambiente, allowlist de destinos e instrução de limpeza de fixtures por IDs específicos. Nunca limpeza recursiva ampla ou dados de clientes como carga.

### 008 — Construir fixtures e simulador de provedor

Dependências: 006, 007. Responsável: QA/Backend.

- **Executar:** criar datasets determinísticos de 0, 1, 999, 1.000, 1.001, 5.000, 5.001 e 10.000 contatos; segmentos sobrepostos; telefones equivalentes; nulos; datas limítrofes; bloqueios por ID/telefone, removidos e expirados. Fixar relógio e aleatoriedade de A/B nos testes.
- **Validar:** stub produz sucesso, 401/403, 429, 5xx, timeout antes/depois do aceite, ACK duplicado/fora de ordem e desconexão. Nenhum caminho do stub pode chamar a Evolution real.
- **Entregar/aceite:** fixtures com resultados esperados calculados independentemente do código testado e conjunto reproduzível de falhas injetáveis.

### 009 — Instalar gates funcionais desde o primeiro PR

Dependências: 003, 006, 008. Responsável: QA/Frontend/Backend.

- **Executar:** converter as sondagens da auditoria em testes do comportamento correto, inicialmente vermelhos; importar funções/hooks reais. Criar suíte TalkX própria para domínio, integração com banco de teste e E2E com sessões de teste. Separar diagnósticos opt-in de testes de aceite.
- **Validar:** cada teste deve falhar quando o defeito correspondente é reinserido ou simulado; garantir isolamento de mocks e include de cobertura dos componentes/hooks TalkX, não apenas lib/services.
- **Entregar/aceite:** mapa teste→requisito, baseline de falhas esperadas e CI proposta. Não desativar branch protection nem mascarar regressões para integrar a infraestrutura de testes.

### 010 — Instalar comparação visual e passar o gate inicial

Dependências: 002, 004, 007, 008, 009. Responsável: Frontend/QA/Design.

- **Executar:** disponibilizar harness de componentes reais com fixtures e navegador autenticado de staging; capturar antes das correções. Fixar viewport, fontes, locale, relógio e animações. Criar screenshots/diffs a cada PR de UI, começando por 08/09.
- **Validar:** comparar referência original com especificação carvão manualmente; regressão automatizada compara aplicativo contra baseline aprovada, não PNG navy contra carvão. Calibrar tolerância com mudança deliberadamente errada; nunca atualizar screenshots automaticamente para fazer CI passar.
- **Entregar/aceite:** gate A: ambiente, contratos e evidência inicial disponíveis. Sem acesso autenticado, marcar limite; sem baseline aprovada, bloquear afirmação de fidelidade, não toda tarefa de backend.

## Fase B — Corrigir integridade antes de ampliar a interface

### 011 — Remover métricas fabricadas e sucessos enganosos

Dependências: 006, 009, 010. Responsável: Frontend/Backend.

- **Executar:** revalidar/remover fallbacks 96,4%/12,8%/4,6%; corrigir unidades “envios versus contatos” e “suprimidos versus campanhas”. Tratar unknown sem converter zero real em estimativa. Revisar deltas, risco baseado só em volume e “desempenho” baseado em tamanho.
- **Validar:** fixture de 1.000 envios com zero entregas não inventa entrega, leitura ou conversão; nenhum erro de consulta vira KPI positivo. Testar períodos sem base anterior.
- **Entregar/aceite:** correção emergencial verificável e lista explícita dos indicadores ainda dependentes de 051–060. Não declarar analytics completo nesta etapa.

### 012 — Corrigir URL, restauração e navegação do wizard

Dependências: 006, 009. Responsável: Frontend.

- **Executar:** centralizar parsing/serialização de `view`, `wizard`, `step` e ID da campanha; restaurar somente estado autorizado e validar pré-requisitos dos passos. Fazer back/forward do navegador e limpar parâmetros ao sair. Evitar duas fontes de verdade entre URL e estado React.
- **Validar:** link direto step 1/2/3/4, refresh, parâmetros inválidos/duplicados, campanha inexistente, permissão negada, duas campanhas em abas e retorno à lista. Link profundo não pode liberar lançamento sem formulário válido.
- **Entregar/aceite:** contrato de rota com testes de navegação real; URL copiada abre o mesmo recurso/passo permitido.

### 013 — Dar identidade estável e revisão ao rascunho

Dependências: 005, 006, 007, 009. Responsável: Backend/DBA/Frontend.

- **Executar:** separar create e update; persistir o ID devolvido no primeiro save e no estado/URL. Introduzir chave idempotente de criação e revisão otimista no servidor, reutilizando mecanismo existente se adequado. Schema novo só por migration revisada e testada em staging.
- **Validar:** duas tentativas com a mesma chave geram uma campanha; retry após resposta perdida recupera o ID; revisão antiga não sobrescreve nova; chave não é reutilizável entre atores/escopos indevidos.
- **Entregar/aceite:** teste comprova um único registro após saves repetidos; IDs vazios deixam de representar campanhas persistidas.

### 014 — Serializar autosave e tratar recuperação

Dependências: 013. Responsável: Frontend/Backend.

- **Executar:** debounce com fila de gravação, snapshot confirmado e revisão; salvar mudanças acumuladas durante request sem perder a última edição. Incluir campos de audiência, seleção, fuso e supressão no dirty tracking. Cancelar timers ao desmontar; distinguir salvo, salvando, erro e offline.
- **Validar:** digitar durante save lento, retry, perda de conexão, fechar/reabrir, mudança só de contatos, clique em salvar enquanto autosave roda e resposta fora de ordem. Um cancelamento local não é confirmação de cancelamento no servidor.
- **Entregar/aceite:** sequência de 20 edições produz um draft consistente; nenhum toast “salvo” antes do commit confirmado.

### 015 — Persistir seleção e separar draft de audiência de envio

Dependências: 013, 014. Responsável: Frontend/Backend/DBA.

- **Executar:** persistir seleção explícita e filtros versionados sem enfileirar envio ao salvar rascunho. Permitir editar público de draft existente; não esconder seletor apenas porque `campaign` é truthy. Restaurar seleção com paginação e IDs estáveis.
- **Validar:** salvar vazio/depois selecionar, remover contato, selecionar por várias páginas, fechar/reabrir e contato apagado/inacessível. Nenhum destinatário executável surge de um autosave.
- **Entregar/aceite:** round-trip do público reproduz exatamente IDs/regras salvos; mudanças em campanha ativa seguem regra de domínio, não edição livre silenciosa.

### 016 — Corrigir duplicação e identidade de autoria

Dependências: 013, 015. Responsável: Frontend/Backend.

- **Executar:** duplicar somente configuração permitida para novo ID/draft; não copiar contadores, status, tempos ou identidade de execução. Resolver responsável/criador pelo perfil autenticado correto e exibir nome do perfil, não nome da campanha.
- **Validar:** duplicar draft, agendada e concluída; duplicação nunca chama update com ID vazio; atribuição de outro responsável respeita permissão; histórico original não é alterado.
- **Entregar/aceite:** dois registros distintos com público/configuração esperados e zero novo envio automático; autoria rastreável.

### 017 — Corrigir persistência e round-trip de fuso

Dependências: 005, 006, 013. Responsável: Backend/DBA/Frontend.

- **Executar:** definir timestamp UTC e fuso IANA persistido; carregar formulário convertendo UTC para esse fuso. Usar a mesma conversão no preview, validação e payload. Definir horário ambíguo/inexistente em DST e fuso da janela comercial. Não reinterpretar dados antigos sem regra de compatibilidade documentada.
- **Validar:** São Paulo, Manaus, UTC e zona com DST; meia-noite; salvar sem editar não muda o instante; caso auditado 12:00Z permanece 12:00Z.
- **Entregar/aceite:** testes de tabela e propriedade round-trip, migration compatível quando necessária e nenhuma correção em massa de agenda inferida.

### 018 — Validar formulário e autorização por camada

Dependências: 006, 009, 012, 015, 017. Responsável: Frontend/Backend/Segurança.

- **Executar:** regras compartilhadas de nome, origem, público, mensagem/mídia, conexão, data futura, intervalos e consentimento; disabled HTML real e guard no handler. Servidor valida independentemente da UI, incluindo transições e actor; sem confiar em flags enviadas pelo cliente.
- **Validar:** teclado/Enter, chamada direta à API, payload sem campo, data passada, intervalo invertido, zero elegíveis, conexão indisponível e ator sem permissão. Informar motivo do bloqueio de forma acessível.
- **Entregar/aceite:** nenhum caminho inválido cria job de envio; confirmação final revalida todos os passos.

### 019 — Corrigir callbacks e eventos de sucesso/falha

Dependências: 012, 013, 018. Responsável: Frontend/Backend.

- **Executar:** separar eventos fechar, salvar, agendar e lançar; remover sequência que abre monitor e depois volta à lista. Emitir evento de negócio apenas após operação confirmada; falha de pause/cancel não gera evento de sucesso. Corrigir seleção ao status mudar remotamente.
- **Validar:** save→lista, schedule→agendada, launch→monitor/andamento, erro→permanece editável; double click; unmount durante resposta; falha 403/500 de controle.
- **Entregar/aceite:** E2E e testes de callbacks sem navegar para tela contraditória; timeline corresponde a operações confirmadas.

### 020 — Gate de integridade e decisão sobre dados legados

Dependências: 011, 012, 013, 014, 015, 016, 017, 018, 019. Responsável: QA/Tech Lead/DBA.

- **Executar:** rodar regressões da auditoria contra comportamento correto e revisar todos os diffs. Em read-only autorizado, inventariar possíveis drafts duplicados/agendas suspeitas sem assumir que semelhança de nome prova duplicação.
- **Validar:** zero regressão nos fluxos corrigidos, P1 novos triados e nenhuma ação destrutiva aplicada por heurística. Identificar se há risco operacional que exija limitar envios mediante decisão autorizada.
- **Entregar/aceite:** gate B e relatório de dados legados. Remediação de dados, se necessária, exige plano por ID, backup e aprovação específica; não é efeito colateral desta etapa.

## Fase C — Audiência, elegibilidade e supressão verificáveis

### 021 — Normalizar identidade de contato e telefone

Dependências: 005, 006, 008, 020. Responsável: Backend/DBA.

- **Executar:** definir normalização com país explícito, aliases e tratamento de telefone ausente/ambíguo; distinguir pessoa, contato e endpoint de entrega. Não acrescentar dígitos ou código de país por palpite. Definir política de deduplicação por campanha e canal.
- **Validar:** formatos equivalentes, número internacional, ramal, caracteres inválidos, contatos distintos com telefone comum e número sem país. Mesma função/contrato no import, preflight e sender.
- **Entregar/aceite:** biblioteca testada, regras de unicidade propostas e relatório de colisões; backfill só com aprovação específica.

### 022 — Fechar schema mínimo e autorização de audiência

Dependências: 005, 006, 013, 015, 021. Responsável: DBA/Segurança.

- **Executar:** comparar schema real com contrato de draft, consentimento, ator de lançamento, política de supressão e revisão de audiência. Acrescentar apenas campos ausentes por migrations únicas; validar ownership/RLS/ACL de tabelas, views e RPCs; `SECURITY DEFINER` somente com justificativa e privilégios mínimos.
- **Validar:** fresh database e upgrade de snapshot sanitizado; usuário sem permissão, perfil desativado, contato fora do escopo e chamada direta. Testar constraints e concorrência sem depender de filtros frontend.
- **Entregar/aceite:** migrations, catálogo/tipos atualizados em staging e testes negativos; nenhum acesso ampliado para fazer o wizard funcionar.

### 023 — Unificar linguagem de filtros e compilação segura

Dependências: 006, 021, 022. Responsável: Backend/Frontend.

- **Executar:** usar AST versionada com campos/operadores permitidos, tipos e AND/OR inequívocos dentro/entre grupos. Mapear tags, status, empresa, estágio, vendedor e localização a dados reais. Regras inválidas não podem virar silenciosamente “toda a base”.
- **Validar:** grupos vazios, nesting, nulos, listas, aspas, curingas, operadores incompatíveis, injection e limites de complexidade. Comparar resultados com conjunto esperado independente da função compiladora.
- **Entregar/aceite:** compilador/validador usados por segmentos e wizard; nenhum cast mascara campo não carregado ou inexistente.

### 024 — Resolver audiência e contagens sem truncamento

Dependências: 022, 023. Responsável: Backend/DBA.

- **Executar:** substituir single fetch limitado por resolução server-side ou paginação estável; alinhar count, amostra e resolução completa. Definir snapshot/consistência sob mudança concorrente de contatos e páginas; amostra de cinco nunca é usada como audiência completa.
- **Validar:** todas as cardinalidades de 008, empates de ordenação e atualização entre páginas; count esperado igual ao conjunto resolvido no mesmo snapshot. Detectar truncamento e retornar erro explícito.
- **Entregar/aceite:** teste de 5.001+ sem perda/duplicação, plano EXPLAIN e índices motivados por consultas reais; sem “carregar tudo” na memória do navegador.

### 025 — Consolidar o predicado de supressão

Dependências: 021, 022, 024. Responsável: Backend/DBA.

- **Executar:** consolidar regras de contact_id/telefone, `removed_at`, expiração e origem/motivo; bloquear prevalece sobre elegível conforme contrato. Retirar implementações paralelas divergentes; aplicar invalidation/cache coherente e revalidação temporal de expiração.
- **Validar:** telefone avulso, bloqueio por ID e telefone simultâneos, removido, expirado, expiração no instante-limite, erro de leitura e opt-out recém-recebido. Falha de verificação de segurança não equivale a “não bloqueado”.
- **Entregar/aceite:** mesma decisão no hook, RPC e sender em testes de contrato; removidos não são reativados por um hook antigo.

### 026 — Implementar preflight de elegibilidade com revisão

Dependências: 024, 025. Responsável: Backend/DBA/Frontend.

- **Executar:** calcular no servidor audiência bruta, endpoints únicos e exclusões por precedência definida: duplicado, inválido, inacessível, supressão, consentimento e elegível. Retornar revisão/hash da configuração, instante e validade; distinguir estimativa dinâmica de snapshot aprovado.
- **Validar:** categorias mutuamente exclusivas e soma reconciliada; regras/contact changes invalidam preflight; segmentos não mostram 0 suprimidos por ausência de cálculo. Concorrência posterior exige nova verificação no dispatch.
- **Entregar/aceite:** resumo do wizard usa resultado real com loading/error/stale; não apresenta “pronto” enquanto cálculo relevante está pendente.

### 027 — Materializar audiência e job de lançamento de forma segura

Dependências: 018, 022, 026. Responsável: Backend/DBA.

- **Executar:** separar prévia de operação atômica de lançamento; validar revisão, congelar configuração/público e criar destinatários únicos. Usar transação para pequeno volume ou job idempotente por chunks para grande volume, com estado `materializing` que não permite envio antes da conclusão.
- **Validar:** duplo clique, crash após chunk, mudança de filtros, revisão vencida, zero elegíveis e retry; contagem reconciliada antes de liberar fila. Restringir edição de snapshot já iniciado.
- **Entregar/aceite:** uma intenção de lançamento gera um único snapshot/job; estado parcial não aparece como campanha enviada.

### 028 — Implementar adaptador canônico de empresas e contatos CRM

Dependências: 005, 007, 021, 022, 023. Responsável: Integrações/DBA.

- **Executar:** usar a fonte comprovada em 005; definir contrato de IDs externos, empresa, vendedor, estágio, compras, consentimento e timestamps. Implementar leitura/projeção autorizada com timeouts, paginação, erros, cache e freshness; secrets ficam no servidor. Escrita no CRM externo é escopo separado e não presumido.
- **Validar:** fonte fora do ar, permissão parcial, ID colidente entre origens, empresa removida, dado stale e retorno incompleto. Rejeitar troca acidental pelo Supabase de outro produto.
- **Entregar/aceite:** health check e testes de contrato com fixture e ambiente autorizado. Sem acesso, manter BLOCKED; não ativar o cartão CRM só para parecer completo.

### 029 — Testar isolamento, cardinalidade e expiração de ponta a ponta

Dependências: 022, 024, 025, 026, 027. Responsável: QA/DBA/Segurança.

- **Executar:** rodar integração em PostgreSQL de teste/staging com perfis reais de teste; testar UI→API→snapshot→leitura. Incluir remoção de acesso entre preflight e lançamento, supressão em outra sessão e contato excluído.
- **Validar:** permissionamento consistente, sem PII vazada em contagem/amostra/export; erros explícitos; deadlines e timeouts não deixam trabalho em estado falsamente concluído.
- **Entregar/aceite:** tabela de invariantes com resultados automatizados e plano de recuperação de snapshot incompleto.

### 030 — Gate de audiência e compatibilidade com o fluxo existente

Dependências: 021, 022, 023, 024, 025, 026, 027, 029. Responsável: QA/Tech Lead.

- **Executar:** rodar fluxo ZAPP completo sem provedor real; comparar população selecionada, bloqueada, elegível e materializada. Verificar que a leitura das campanhas antigas continua possível e que UI antiga não dispara payload incompatível.
- **Validar:** nenhum truncamento; nenhuma soma duplicada; nenhum envio a fixtures bloqueadas; controle de feature flag não contorna validação backend.
- **Entregar/aceite:** gate C. O caminho CRM só recebe aceite funcional se 028 estiver VERIFIED; bloqueio de CRM permanece visível no diário e impede release integral posterior.

## Fase D — Fechar Nova campanha e revisão em carvão

### 031 — Consolidar shell, tokens e orçamento de espaço

Dependências: 004, 010, 020. Responsável: Frontend/Design.

- **Executar:** inventariar padding do ViewContainer e módulo; atribuir um único dono aos gutters/scroll. Definir medidas de sidebar/topbar/área útil/rail por viewport; reutilizar tokens carvão existentes e variantes locais, sem recolorir outros módulos.
- **Validar:** screenshot antes/depois de TalkX e smoke visual de Inbox/Dashboard; largura útil reconciliada, sem scroll horizontal do documento ou título oculto para caber.
- **Entregar/aceite:** primitive de layout e especificação dimensional; alteração global só se justificada e com regressões dos consumidores testadas.

### 032 — Aprovar a composição estrutural da tela 08 antes dos detalhes

Dependências: 004, 010, 031. Responsável: Frontend/Design/QA.

- **Executar:** montar com componentes reais e fixture: título/stepper, informações, três origens, filtros, mensagem, resumo, preview e ações nas posições aprovadas. Não conectar ações de envio nesta prova de composição.
- **Validar:** lado a lado em 1672×941 e critérios mensuráveis de alinhamento/altura/largura; revisar raios, hierarquia e densidade, não só cor. Captura do app vazio não substitui fixture preenchida equivalente ao mock.
- **Entregar/aceite:** baseline estrutural aprovada pelo responsável de produto/design. Sem essa aprovação, não propagar o padrão para 16 telas.

### 033 — Conectar informações e origem do público

Dependências: 012, 016, 018, 026, 032. Responsável: Frontend.

- **Executar:** nome, objetivo e responsável conforme referência; conexão em local acordado; descrição colapsável. Ordenar origens ZAPP/CRM/segmento como especificado; permitir somente segmentos válidos e exibir estado real de disponibilidade.
- **Validar:** trocar origem preserva/limpa apenas campos previstos; não reutiliza audiência antiga; vínculo de responsável valida servidor. CRM não disponível tem motivo e ação configurável, não botão mudo.
- **Entregar/aceite:** formulário persiste e reabre; parte CRM depende de 028 e será revalidada no gate final.

### 034 — Conectar filtros visuais e seleção paginada

Dependências: 015, 023, 024, 026, 033. Responsável: Frontend/QA.

- **Executar:** grade de filtros real, multi-tags quando contratado, status, empresa, estágio, vendedor e localização; lista/amostra com virtualização/paginação. Definir “todos da página” versus “todos do resultado”; busca e filtros participam do clear/dirty/autosave.
- **Validar:** filtros combinados e vazios, limpar tudo, contatos fora da página, mudança de fonte e seleção de milhares sem explosão de DOM. Contador total não usa apenas a página carregada.
- **Entregar/aceite:** cada controle possui teste ligado à query; nenhum filtro declarado concluído sem campo, UI, persistência e resultado comprovados.

### 035 — Unificar editor de mensagem e personalização

Dependências: 004, 014, 018, 032. Responsável: Frontend/Backend.

- **Executar:** reutilizar o mesmo estado/editor nos passos 1 e 2, com toolbar, cursor, variáveis, contador e tipos de mídia. Personalização e limites dependem do provedor/tipo comprovado, não só do número decorativo 4096. Aplicar template deve limpar mídia/variáveis antigas incompatíveis.
- **Validar:** variável desconhecida, valor nulo, Unicode/emoji, tamanho-limite, colar texto, desfazer e trocar template com/sem mídia. Preview e renderer de envio devem seguir a mesma semântica testada.
- **Entregar/aceite:** editor funcional nas duas composições, sem duplicar conteúdo ou perder mudanças ao trocar passo.

### 036 — Implementar uploader e ciclo de vida seguro de mídia

Dependências: 005, 007, 018, 022, 035. Responsável: Frontend/Backend/Segurança.

- **Executar:** seleção/drag-drop, progresso, cancelamento e retry; bucket privado com ACL, limites reais por tipo, verificação de conteúdo/MIME e quarentena/validação quando aplicável. Persistir chave do objeto, não URL assinada expirada; planejar coleta de órfãos com retenção e IDs explícitos.
- **Validar:** extensão enganosa, arquivo excessivo, upload interrompido, mídia fora do escopo, URL externa insegura, expiração e troca de arquivo. Não habilitar fetch arbitrário no servidor para aproximar o mock.
- **Entregar/aceite:** imagem/vídeo/documento/áudio suportados pelo provedor com preview e envio stub; capacidades não suportadas têm decisão explícita, não sucesso falso.

### 037 — Entregar rail, preview e ações persistentes

Dependências: 026, 031, 033, 034, 035, 036. Responsável: Frontend/Design.

- **Executar:** seis indicadores com fontes reais, preview WhatsApp representativo, loading/stale/error e ações salvar/continuar na posição acordada. Aplicar sticky dentro do scroller correto; no mobile, resumo acessível por Sheet sem esconder CTA ou teclado.
- **Validar:** rolagem longa, contato sem nome, mensagem extensa, upload em progresso, 0 elegíveis, data em outro fuso e viewport baixo. Não usar o primeiro contato fora do público como prévia sem identificação.
- **Entregar/aceite:** rail permanece utilizável e consistente com preflight; screenshot e teste de atualização após mudanças de público/mensagem.

### 038 — Fechar revisão final e confirmação sem efeitos colaterais

Dependências: 017, 018, 019, 026, 027, 036, 037. Responsável: Frontend/Backend/QA.

- **Executar:** tela 09 em três regiões: resumo editável, phone preview e operacional/confirmar; links Editar preservam draft. Exibir revisão da audiência, horário/fuso, política de supressão e conexão. Confirmação cria intenção de lançamento; não dispara duas vezes por callbacks.
- **Validar:** preflight expira com modal aberto, consentimento muda, duplo clique, conexão cai, fechar/reabrir modal e resposta perdida. Mensagens de sucesso correspondem à aceitação do job, não a entrega de todos os destinatários.
- **Entregar/aceite:** fluxo ZAPP até job stub e roteamento correto; nenhum envio real nesta etapa.

### 039 — Validar responsividade e acessibilidade dos passos

Dependências: 032, 033, 034, 035, 036, 037, 038. Responsável: QA/Frontend.

- **Executar:** testar quatro passos em 1672×941, 1280×800, 390×844 e zoom 200%; foco, labels associados, aria-current do stepper, erros anunciados, foco restaurado em modais, reduced-motion e navegação sem mouse.
- **Validar:** contraste conforme critério de acessibilidade acordado; zero violações sérias/críticas do scanner escolhido e revisão manual dos fluxos. Scanner sem alerta não substitui uso por teclado.
- **Entregar/aceite:** matriz viewport×passo×estado e diffs resolvidos; sem atalhos que habilitem controle inválido por teclado.

### 040 — Gate visual e funcional de Nova campanha/revisão

Dependências: 010, 020, 030, 032, 033, 034, 035, 036, 037, 038, 039. Responsável: Produto/Design/QA.

- **Executar:** demonstração autenticada em staging: criar, alterar público, salvar, fechar, reabrir, revisar e lançar para stub. Apresentar 08/09 lado a lado com referência e lista de divergências aprovadas.
- **Validar:** uma única campanha persistida, público correto, data preservada e efeitos esperados. Aprovação visual separada da funcional; fontes ainda bloqueadas, como CRM, permanecem pendentes.
- **Entregar/aceite:** gate D aprova composição e fluxo ZAPP, não o produto inteiro. Não anunciar 17/17; não avançar propagação visual com rejeição aberta de 08/09.

## Fase E — Execução durável e controle operacional

### 041 — Fazer o banco impor a máquina de estados

Dependências: 006, 022, 027, 040. Responsável: Backend/DBA.

- **Executar:** centralizar transições autorizadas de campanha, job e destinatário em operações transacionais; registrar ator, motivo, revisão e horário. Reutilizar estruturas existentes após inspeção; distinguir aceito pelo provedor, entregue, falhou e resultado desconhecido.
- **Validar:** transição inválida por API direta, dois operadores concorrentes, papel sem permissão, campanha concluída recebendo webhook tardio e rollback de transação. Um evento de entrega não pode reativar campanha cancelada.
- **Entregar/aceite:** tabela de transições, constraints/operações versionadas e testes executados no banco de staging, não apenas em mocks.

### 042 — Formalizar a fronteira com o provedor de mensagens

Dependências: 005, 008, 018, 036, 041. Responsável: Backend/QA.

- **Executar:** adaptar a integração real existente a um contrato explícito de envio, consulta de status, erros e identificadores. Documentar recursos efetivamente suportados pelo Evolution GO usado pelo projeto: mídia, limites, autenticação, idempotência e correlação.
- **Validar:** contrato contra stub fiel e conta de teste autorizada; formatos incompatíveis, credencial ausente, 401, 429, 5xx, ACK inválido e arquivo expirado. Não inferir compatibilidade a partir de outra versão do Evolution.
- **Entregar/aceite:** matriz capacidade×evidência; credenciais somente server-side. Envio positivo real restrito a destinatários internos explicitamente autorizados.

### 043 — Implementar claim atômico e lease de trabalho

Dependências: 022, 027, 041, 042. Responsável: Backend/DBA.

- **Executar:** usar mecanismo de fila existente se satisfizer os requisitos; garantir claim exclusivo, lease com expiração, token de propriedade e recuperação de worker morto. Concluir trabalho somente quando o token ainda for válido; separar reivindicação no banco da chamada externa.
- **Validar:** dois workers reivindicando o mesmo lote, lease vencendo durante chamada, reinício após claim e worker antigo tentando concluir trabalho reatribuído. Medir contenção e verificar índices com plano de execução.
- **Entregar/aceite:** nenhum destinatário com dois claims válidos simultâneos; corrida de envio externo tratada na etapa 044, sem prometer que lease sozinho evita duplicidade no provedor.

### 044 — Resolver retries e resultado desconhecido sem reenvio cego

Dependências: 042, 043. Responsável: Backend/QA.

- **Executar:** persistir identidade estável da tentativa/intenção; usar chave de idempotência do provedor apenas se comprovadamente suportada. Quando houver timeout após possível aceite, marcar resultado desconhecido e reconciliar por identificador suportado; sem consulta confiável, exigir decisão operacional.
- **Validar:** falha antes da requisição, conexão interrompida depois do aceite, ACK perdido, webhook antes do ACK, reprocessamento e lease expirado. Provar separadamente ausência de duplicata interna e limites da garantia externa.
- **Entregar/aceite:** política de retry por classe de erro, fila de reconciliação e procedimento humano. “Exactly once” não aparece como garantia se o contrato externo não permitir prová-la.

### 045 — Limitar dispatcher, concorrência e pressão de envio

Dependências: 024, 043, 044. Responsável: Backend/SRE.

- **Executar:** processar lotes limitados por duração, memória e capacidade do provedor; controlar taxa por conexão/conta e concorrência global. Respeitar Retry-After quando suportado; aplicar backoff limitado com jitter e backpressure. Não carregar toda a audiência na memória de uma Edge Function.
- **Validar:** 10.000 destinatários sintéticos, múltiplas campanhas da mesma conexão, sequência de 429, perda de worker e fila crescente. Demonstrar que adicionar workers não multiplica indevidamente o limite global.
- **Entregar/aceite:** configuração documentada, limites aprovados e métricas de fila/idade/retries; nenhuma carga massiva contra números reais.

### 046 — Revalidar elegibilidade imediatamente antes de enviar

Dependências: 017, 025, 026, 041, 045. Responsável: Backend/DBA.

- **Executar:** preservar snapshot para auditoria, mas reconsultar bloqueios atuais, supressão, estado da campanha, conexão e janela de envio antes de cada tentativa. Definir o limite atômico do cancelamento interno e reconhecer requisições externas já em voo.
- **Validar:** opt-out após snapshot, pausa entre claim e envio, janela encerrando no meio do lote, conexão removida e serviço de supressão indisponível. Revalidação com falha bloqueia envio, não libera por padrão.
- **Entregar/aceite:** motivos de exclusão/adiamento auditáveis; nenhum novo envio iniciado após o ponto de bloqueio definido. Não declarar que é possível recolher mensagem já aceita pelo provedor.

### 047 — Tornar pausa, cancelamento e retomada operações confiáveis

Dependências: 041, 043, 044, 046. Responsável: Backend/Frontend/QA.

- **Executar:** comandos idempotentes com permissão, revisão e motivo; pausa impede novos envios, cancelamento encerra pendências conforme contrato, retomada reaproveita estado confirmado. Mostrar na UI distinção entre comando solicitado, efetivado e trabalho em voo.
- **Validar:** dois cliques, operadores divergentes, retomada de campanha cancelada, timeout do comando e destinatário com resultado desconhecido. Retomar não pode zerar contadores nem reenfileirar mensagens confirmadas.
- **Entregar/aceite:** testes concorrentes e resposta operacional coerente; campanha pausada possui informação suficiente para checklist e histórico das etapas 064–066.

### 048 — Implementar agendamento e recorrência com fuso explícito

Dependências: 017, 026, 027, 041, 045, 046, 047. Responsável: Backend/DBA.

- **Executar:** executar agenda persistida no servidor; definir política para atraso, indisponibilidade, janela comercial e recorrência. Cada ocorrência deve possuir identidade própria e vínculo com a regra; editar série não reescreve histórico já enviado.
- **Validar:** scheduler duplicado, relógio atravessando meia-noite, fusos com mudança de horário, reinício após horário programado, edição concorrente, ocorrência cancelada e retomada fora da janela. Usar relógio controlável em testes.
- **Entregar/aceite:** decisão explícita entre adiar, pular ou pedir confirmação em atrasos; uma ocorrência não vira múltiplas campanhas executáveis.

### 049 — Executar caos controlado no motor completo

Dependências: 008, 029, 041, 042, 043, 044, 045, 046, 047, 048. Responsável: QA/SRE/DBA.

- **Executar:** rodar cenários determinísticos interrompendo processos antes/depois de commit, claim e ACK; inserir duplicatas de eventos, latência, queda de conexão e concorrência de operadores. Combinar supressão, pausa, agenda e retry no mesmo fluxo.
- **Validar:** invariantes de cardinalidade, saldo de estados, ausência de envios proibidos e reconciliação de resultados desconhecidos. Comparar log do provedor stub com banco, não apenas contadores da UI.
- **Entregar/aceite:** relatório com seed, sequência, resultado esperado/observado e reprodução de cada falha; correção obrigatória antes do gate seguinte.

### 050 — Gate do motor de campanhas

Dependências: 041, 042, 043, 044, 045, 046, 047, 048, 049. Responsável: QA/Backend/SRE.

- **Executar:** executar suíte de integração do banco, contrato do provedor, carga sintética e fluxo positivo interno autorizado; revisar alarmes, comandos de parada e runbook de mensagem com resultado desconhecido.
- **Validar:** nenhuma falha crítica/alta aberta; cada limite de garantia conhecido aparece na documentação e no comportamento da UI. Contagem de jobs aceitos não comprova mensagens entregues.
- **Entregar/aceite:** gate E libera integração do motor às telas operacionais em staging; não autoriza disparo a clientes, rollout de produção ou retirada dos mecanismos de bloqueio.

## Fase F — Eventos, métricas e evidência comercial

### 051 — Correlacionar eventos ao destinatário e à tentativa corretos

Dependências: 006, 022, 042, 044, 050. Responsável: Backend/DBA.

- **Executar:** persistir IDs externos, conexão, campanha, destinatário, tentativa e ocorrência; definir chaves únicas segundo escopo real do provedor. Eventos sem correlação vão para reconciliação, nunca para campanha escolhida por proximidade arbitrária.
- **Validar:** IDs iguais em conexões distintas, reenvio autorizado, destinatário presente em duas campanhas e evento recebido antes de persistir ACK. Dados de outro tenant não podem ser correlacionados.
- **Entregar/aceite:** rastreabilidade auditável do comando até o evento; coleta sem armazenar payload pessoal desnecessário.

### 052 — Processar webhooks com autenticação, deduplicação e ordenação

Dependências: 041, 051. Responsável: Backend/Segurança/DBA.

- **Executar:** verificar mecanismo de autenticidade disponível no provedor real; limitar payload e taxa, deduplicar eventos e separar ingestão de processamento. Definir precedência de estados e tratamento de eventos atrasados sem regredir entrega confirmada.
- **Validar:** assinatura/token inválido, replay, evento duplicado, entrega antes de enviado, timestamp malformado, indisponibilidade do banco e resposta de retry. Não assumir que allowlist de IP sozinha comprova autenticidade.
- **Entregar/aceite:** testes de segurança e convergência; reprocessar a mesma sequência não altera totais finais nem duplica efeitos.

### 053 — Medir respostas com atribuição explícita

Dependências: 006, 051, 052. Responsável: Backend/Produto/QA.

- **Executar:** definir janela e regra de atribuição de resposta, distinguindo respostas, respondentes únicos e interações. Correlacionar por referência suportada e política aprovada; sinalizar ambiguidades em campanhas concorrentes.
- **Validar:** dez mensagens do mesmo contato, resposta fora da janela, duas campanhas próximas, conversa já ativa e mensagem de outro canal. Comparar dataset de referência calculado independentemente.
- **Entregar/aceite:** taxa de resposta com numerador/denominador visíveis; dado ambíguo não vira conversão nem “IA detectou interesse” automaticamente.

### 054 — Rastrear cliques sem criar redirecionador inseguro

Dependências: 006, 022, 035, 051. Responsável: Backend/Segurança.

- **Executar:** quando previsto no contrato aprovado, gerar identificador opaco e destino validado server-side para links da campanha; restringir esquemas e alterações de destino. Documentar retenção, minimização e diferença entre cliques brutos e únicos.
- **Validar:** URL javascript/data, token alterado, tentativa de enumerar contato, destino não permitido, scanner de preview, bot e múltiplos cliques. Evitar expor telefone/e-mail em URL pública ou logs.
- **Entregar/aceite:** redirect seguro e métricas com limitações declaradas; se não houver autorização/infraestrutura para tracking, capacidade permanece BLOCKED, não substituída por percentuais decorativos.

### 055 — Conectar conversões e receita a uma fonte verificável

Dependências: 005, 006, 028, 051, 053. Responsável: Backend/Produto/DBA.

- **Executar:** identificar eventos comerciais reais no CRM canônico; acordar atribuição, cancelamentos, devoluções, moeda, receita influenciada versus atribuída e custo usado no ROI. Preferir leitura do contrato existente e evitar escrita no CRM nesta etapa.
- **Validar:** venda duplicada, pedido cancelado, mesmo pedido em duas campanhas, custo zero/ausente e atualização retroativa. Usar valores monetários em representação precisa, não somas imprecisas de floats.
- **Entregar/aceite:** reconciliação com amostra autorizada e dataset sintético; sem fonte de negócio confiável, cards ficam indisponíveis e o requisito comercial continua pendente.

### 056 — Criar agregações consistentes para gráficos e indicadores

Dependências: 006, 011, 051, 052, 053, 054, 055. Responsável: Backend/DBA/QA.

- **Executar:** centralizar definições e consultas das métricas; distinguir conjuntos sobrepostos, como entregue/respondido, de partições de processamento. Agrupar por timezone/período definido; filtros precisam alterar todas as séries e totais relacionados.
- **Validar:** base vazia, uma mensagem, atrasos de webhook, divisão por zero, fronteiras de período, denominadores diferentes e correções retroativas. Um gráfico de rosca não pode somar categorias sobrepostas como se fossem exclusivas.
- **Entregar/aceite:** golden dataset com cálculo independente, endpoint/agregação autenticados e estados unknown/zero explicitamente distintos.

### 057 — Validar e completar exportação e envio de relatórios

Dependências: 001, 022, 051, 056. Responsável: Backend/Segurança/QA.

- **Executar:** reavaliar a função `talkx-report` já adicionada à main e seus consumidores; reutilizar o que estiver correto. Confirmar escopo de campanha, paginação completa, CSV seguro, escape HTML, limites de exportação, destinatários permitidos e dependências de e-mail.
- **Validar:** papel sem acesso, ID de outro tenant, CSV com fórmula, texto malicioso, mais de uma página, falha de provedor e solicitação duplicada. Download/exportação não deve vazar registros fora do filtro.
- **Entregar/aceite:** contrato testado de relatório; envio de e-mail positivo somente a endereço interno autorizado. Backend existente não equivale à tela completa da referência 14.

### 058 — Tornar monitoramento realtime completo e limitado

Dependências: 024, 051, 052, 056. Responsável: Frontend/Backend/SRE.

- **Executar:** revisar logs realtime recém-adicionados; combinar snapshot paginado, cursor e assinatura com reconciliação após reconexão. Usar limites explícitos para janela de eventos recentes e consulta própria de agregados; não calcular totais a partir dos primeiros 2.000 logs.
- **Validar:** evento durante carregamento inicial, reconexão, duplicata, aba suspensa, campanha trocada rapidamente, ordenação e permissão revogada. Desmontagem limpa listeners; um evento não incrementa a UI duas vezes.
- **Entregar/aceite:** painel converge com banco após falhas e sinaliza atraso/desconexão; teste com volume superior ao limite da janela de logs.

### 059 — Ancorar riscos e recomendações em evidências reais

Dependências: 005, 026, 053, 055, 056. Responsável: Produto/Backend/Segurança.

- **Executar:** separar regras operacionais, estimativas e geração por IA. Cada recomendação precisa informar origem, período e limitações; sem histórico suficiente, não exibir promessa de crescimento ou “baixo risco” inventado. Ações sugeridas exigem revisão humana.
- **Validar:** histórico insuficiente, dados atrasados, recomendação contraditória e conteúdo de mensagem tentando instruir a IA a acessar segredos ou executar ferramentas. Recomendar não pode alterar público ou iniciar envio silenciosamente.
- **Entregar/aceite:** conteúdo fundamentado, estados indisponíveis honestos e teste da ação associada; integração de IA ausente continua requisito pendente se mantida no escopo aprovado.

### 060 — Gate de métricas, relatórios e rastreabilidade

Dependências: 051, 052, 053, 054, 055, 056, 057, 058, 059. Responsável: Produto/QA/DBA.

- **Executar:** reconciliar campanha sintética ponta a ponta: audiência, envios, entregas, respostas, cliques, opt-outs, pedidos e relatório. Repetir ingestão dos eventos e comparar banco, API, exportação e cards.
- **Validar:** unidades, filtros, denominadores, cardinalidade e atribuição; arredondamento de apresentação não altera totais persistidos. Comparativos possuem períodos equivalentes e fonte real.
- **Entregar/aceite:** gate F com exemplos reproduzíveis e zero métrica fictícia apresentada como real; não aprovar enquanto fonte comercial necessária permanecer bloqueada.

## Fase G — Campanhas, estados operacionais e analytics

### 061 — Reconstruir a visão geral com densidade e dados corretos

Dependências: 031, 040, 050, 056, 060. Responsável: Frontend/Design/QA.

- **Executar:** implementar referência 01 em carvão: título, navegação, KPIs, filtros, tabela com campanha/público/canal/status/progresso/resultados/agenda/ações e paginação. Preservar hierarquia e proporções; não transformar tabela densa em cards enormes sem aprovação.
- **Validar:** busca, múltiplos filtros, ordenação estável, página vazia após exclusão, títulos longos, 0 registros e datasets grandes. Cada número deve refletir o mesmo escopo documentado; distinguir KPIs globais e filtrados.
- **Entregar/aceite:** comparação visual autenticada nas resoluções acordadas, testes de consulta/paginação e nenhuma seleção de página confundida com seleção de toda a base.

### 062 — Conectar rail lateral, atalhos e ações da listagem

Dependências: 012, 016, 019, 061. Responsável: Frontend/Produto.

- **Executar:** compor rail da referência 01 com ações rápidas, campanhas recentes e dica contextual baseada em conteúdo aprovado. Registrar destino/handler/permissão de Nova campanha, Usar template, Criar segmento, Importar e Ajuda.
- **Validar:** navegação por mouse/teclado, deep link, preservação de draft e contexto, duplicação idempotente e ações proibidas. Destinos implementados em fases seguintes ficam explicitamente pendentes; nunca substituir por toast de sucesso ou handler vazio.
- **Entregar/aceite:** rail fiel e registro de ações com pendências nominadas; o gate 093 exige todas conectadas antes da entrega final.

### 063 — Entregar a tela de campanha agendada

Dependências: 017, 038, 048, 061. Responsável: Frontend/QA.

- **Executar:** reproduzir referência 10 com cabeçalho, data/hora/fuso, recorrência, janela, calendário, resumo da programação e resumo da campanha. Controles refletem capacidades reais do motor e permissões de edição.
- **Validar:** editar sem perder timezone, data no passado, intervalo impossível, série recorrente, regra de horário comercial ausente, salvamento concorrente e reload. O texto de duração deve ser estimativa fundamentada, não número fixo.
- **Entregar/aceite:** screenshot aprovado e teste UI→banco→scheduler; alteração de agenda não gera nova ocorrência duplicada.

### 064 — Entregar o monitor ao vivo com informações acionáveis

Dependências: 047, 050, 056, 058, 061. Responsável: Frontend/Backend/QA.

- **Executar:** reproduzir referência 11: indicadores, ritmo de entrega, saúde, fila por segmento, destinatários e timeline. Exibir última atualização e status realtime; pausa/cancelamento chamam comandos reais com confirmação e estado em voo.
- **Validar:** evento tardio, reconexão, filtro de status, mais registros que a janela visível, campaign ID inválido e troca de campanha durante requisição. Retry individual respeita estado desconhecido e política do motor.
- **Entregar/aceite:** sem divergência persistente entre monitor e agregados do banco; gráfico possui dados ou estado vazio honesto, nunca curva decorativa.

### 065 — Completar campanha em andamento e todas as suas abas

Dependências: 047, 056, 057, 058, 061, 064. Responsável: Frontend/Backend/QA.

- **Executar:** revisar implementação recente da main e completar referência 12: visão geral, destinatários, mensagens, configurações, resultados e logs. Substituir `TabComingSoon` remanescente por capacidade real; mensagens mostram versões/variações efetivamente usadas.
- **Validar:** cada aba via navegação e URL, paginação real, permissão, carregamento/erro, ações de limites e pause/cancel. Não permitir editar conteúdo de destinatários já enviados como se alterasse seu histórico.
- **Entregar/aceite:** matriz de seis abas com testes e screenshot; nenhuma aba declarada concluída apenas porque existe um botão ou componente com título.

### 066 — Criar experiência própria de campanha pausada

Dependências: 047, 056, 061, 064, 065. Responsável: Frontend/Produto/QA.

- **Executar:** reproduzir referência 13: motivo/autor/data da pausa, processados/restantes, segmentos, timeline, checklist para retomar e confirmação. Checklist usa validações atuais de audiência, conexão, janela, limites e conteúdo.
- **Validar:** pausa automática versus manual, conexão ainda indisponível, supressão alterada, operador sem direito de retomar e campanha cancelada em outra aba. Checkbox não pode sobrepor impedimento real do servidor.
- **Entregar/aceite:** retomada reaproveita progresso confirmado; tela informa claramente o que falta resolver e não reapresenta campanha pausada como apenas um badge da tela em andamento.

### 067 — Entregar relatório de campanha concluída

Dependências: 053, 054, 055, 056, 057, 060, 061. Responsável: Frontend/Produto/QA.

- **Executar:** reproduzir referência 14: cabeçalho/exportar/compartilhar, desempenho, funil, heatmap, segmentos, resumo comercial, links e insights. Implementar navegação de mensagens, audiência, conversões, respostas e logs com dados correspondentes.
- **Validar:** filtros, períodos, dados tardios, ausência de conversões/custo, permissão de compartilhamento e exportação igual ao escopo mostrado. Compartilhar não cria acesso público irrestrito a contatos ou mensagens.
- **Entregar/aceite:** relatório visual completo e reconciliação com etapa 060; função de e-mail já existente é uma dependência, não substituto desta tela.

### 068 — Completar analytics agregado e comparativos

Dependências: 056, 059, 060, 061, 067. Responsável: Frontend/Backend/Produto.

- **Executar:** reproduzir referência 07: filtros globais, séries, ranking de segmentos, funil, melhores horários, campanhas de melhor resultado, comparação e rail de insights. Revalidar o comparativo já adicionado à main antes de expandir.
- **Validar:** períodos sem dados, duração diferente, filtro de canal/equipe/origem, acesso parcial e bases com taxas de amostragem distintas. “Campanhas enviadas” não pode rotular número de mensagens; funil e KPI usam as mesmas definições.
- **Entregar/aceite:** todos os filtros afetam consultas pertinentes, com estado visível; cada comparação explica período, unidade e variação absoluta ou percentual.

### 069 — Implementar estados de sistema e modais no produto real

Dependências: 018, 025, 047, 061, 063, 064, 065, 066, 067, 068. Responsável: Frontend/QA.

- **Executar:** aplicar referência 17 a telas reais: vazio, skeleton, erro, CRM indisponível, WhatsApp desconectado e sem permissão; implementar excluir, duplicar, remover supressão, cancelar e confirmar disparo com textos correspondentes ao efeito real.
- **Validar:** provocar cada estado com fixture e resposta controlada, depois testar integração em staging. Fechar modal restaura foco; erro recuperável oferece retry efetivo; excluir histórico e remover supressão respeitam política e autorização.
- **Entregar/aceite:** catálogo de estados ligado a rotas reais; não entregar apenas uma galeria isolada de componentes enquanto o produto mantém telas genéricas.

### 070 — Gate das telas operacionais

Dependências: 061, 062, 063, 064, 065, 066, 067, 068, 069. Responsável: Produto/Design/QA.

- **Executar:** apresentar referências 01, 07 e 10–14, além dos estados 17, em carvão com dataset real de staging; executar ciclo agendar→iniciar→pausar→retomar→concluir→relatório.
- **Validar:** screenshots, navegação, ações e consistência de métricas; revisão visual inclui espaçamento, colunas, rail, tipografia e composição, não somente presença de títulos.
- **Entregar/aceite:** gate G registra aprovação dessas telas e lista destinos ainda pendentes de segmentos/templates/importação/ajuda. Esses destinos impedem certificação final e serão fechados nas fases H–J.

## Fase H — Segmentação e templates completos

### 071 — Entregar biblioteca de segmentos e painel de detalhes

Dependências: 023, 024, 028, 031, 040, 056, 070. Responsável: Frontend/Backend.

- **Executar:** reproduzir referência 02 com indicadores, tabela/lista, filtros, critérios, origem, público, último uso, desempenho e painel de detalhes. Diferenciar segmento salvo, CRM e público local; origem não pode ser inferida do nome.
- **Validar:** filtros combinados, proprietário, favoritos, tags, segmento vazio/inativo e fonte indisponível. Contagens e sincronização exibem instante/origem; “tempo real” somente quando realmente suportado.
- **Entregar/aceite:** CRUD autorizado e detalhes consistentes; nenhuma linha ou indicador fictício apresentado como dado do projeto.

### 072 — Entregar construtor visual de regras versionadas

Dependências: 023, 024, 071. Responsável: Frontend/Backend/QA.

- **Executar:** reproduzir referência 03: biblioteca à esquerda, grupos AND/OR no centro, resumo à direita; campos, operadores e valores são derivados do contrato seguro do servidor. Salvar rascunho e publicar versão têm significados distintos.
- **Validar:** grupos aninhados, regras contraditórias, campo removido, valor inválido, desfazer/refazer, autosave concorrente e publicação sem critérios. AST inválida não pode virar consulta de toda a base.
- **Entregar/aceite:** equivalência entre expressão visual, AST persistida e resultado do servidor demonstrada em dataset com resultado conhecido.

### 073 — Completar filtros comerciais e RFM com dados reais

Dependências: 005, 023, 028, 055, 071, 072. Responsável: Backend/DBA/Produto.

- **Executar:** implementar recência, frequência, valor monetário, última compra, ticket, responsável e estágio somente a partir de contratos confirmados. Definir referência temporal, moeda, pedidos válidos e tratamento de devoluções/ausência de histórico.
- **Validar:** cliente sem compra, pedido cancelado, duplicata importada, mudança de vendedor e compra no limite exato do período. Comparar seleção com consulta independente; avaliar índices sobre acesso real.
- **Entregar/aceite:** filtros dos modelos funcionam e explicam critérios. Se a fonte canônica não fornecer campo necessário, registrar decisão de integração/escopo; ocultar o campo não significa implementar o requisito.

### 074 — Implementar prévia, sobreposição e resumo de segmento

Dependências: 024, 026, 056, 059, 071, 072, 073. Responsável: Backend/Frontend/Segurança.

- **Executar:** calcular tamanho, amostra autorizada, interseção/união entre segmentos e atualização; distinguir estimativa de contagem fechada. Composição demográfica exige dados fornecidos legitimamente e escopo aprovado; não inferir gênero por nome/foto.
- **Validar:** segmento idêntico, disjunto, vazio e milhões de combinações potenciais sem materialização cartesiana; amostra não vaza campos indevidos. Ausência de dados não pode gerar composição percentual inventada.
- **Entregar/aceite:** resumo real e comportamento de privacidade revisado; risco de entrega segue contrato da etapa 059, não uma pontuação visual sem cálculo.

### 075 — Entregar biblioteca visual de templates

Dependências: 031, 035, 036, 056, 070. Responsável: Frontend/Backend/Design.

- **Executar:** reproduzir referência 04: grid denso de previews, alternativa em lista, filtros, categorias, canais, status, equipe, usos e rail. Distinguir template interno salvo de template aprovado por provedor quando essa aprovação existir.
- **Validar:** texto longo, imagem ausente, áudio/documento, status não aprovado, filtro sem resultado e paginação. Prévia não deve disparar rastreamento ou carregar URL externa insegura sem mediação aprovada.
- **Entregar/aceite:** galeria fiel com ações reais de usar, editar e duplicar; indicadores calculados de usos/eventos disponíveis.

### 076 — Entregar editor completo e histórico de versões

Dependências: 013, 014, 018, 035, 036, 075. Responsável: Frontend/Backend/DBA.

- **Executar:** reproduzir referência 05 com biblioteca, editor e preview; conteúdo, variáveis, mídia, tags, categoria, status, versões e desempenho. Persistir versões imutáveis utilizadas por campanhas; evitar alteração retroativa do conteúdo enviado.
- **Validar:** edição concorrente, versão anterior restaurada como nova versão, variável inválida, mídia removida e draft reaberto. Salvar template não deve criar campanha nem enviar mensagem.
- **Entregar/aceite:** histórico navegável com autor/data e diff útil; preview usa o mesmo renderizador validado no wizard.

### 077 — Implementar variações A/B com atribuição estável

Dependências: 027, 044, 051, 053, 056, 076. Responsável: Backend/DBA/Produto.

- **Executar:** definir variantes, pesos e identidade de experimento; persistir a variante atribuída no snapshot do destinatário. Reexecução/retry preserva variante e conteúdo versionado; métricas vinculam resultado ao experimento correto.
- **Validar:** pesos inválidos, população pequena, alteração posterior do template, duplicata de contato e retries. Distribuição deve ser testada estatisticamente em fixture grande e deterministicamente por destinatário.
- **Entregar/aceite:** comparação descritiva correta; não declarar vencedor ou significância sem método, amostra e política aprovados. Não enviar duas variantes ao mesmo destinatário por acidente.

### 078 — Completar importação, duplicação e teste de templates

Dependências: 018, 036, 042, 075, 076, 077. Responsável: Frontend/Backend/QA.

- **Executar:** implementar formatos de importação aprovados com validação de esquema/limites; duplicação cria identidade nova sem estatísticas históricas; teste renderiza a versão escolhida e usa envio interno autorizado ou stub claramente identificado.
- **Validar:** arquivo malformado, fórmula CSV, HTML perigoso, nome duplicado, variável desconhecida e referência a mídia inacessível. “Testar” não deve usar a audiência inteira da campanha.
- **Entregar/aceite:** relatório por item importado/rejeitado e testes positivos/negativos; erros parciais não aparecem como sucesso integral.

### 079 — Fechar reutilização entre segmentos, templates e wizard

Dependências: 012, 015, 033, 034, 035, 038, 071, 072, 074, 075, 076, 077, 078. Responsável: Frontend/QA.

- **Executar:** conectar Usar em campanha/Usar template ao draft correto; carregar IDs e versões, restaurar origem/regras e invalidar preflight quando necessário. Alteração posterior do segmento/template precisa respeitar política de snapshot.
- **Validar:** iniciar sem draft, voltar para draft existente, template incompatível com conexão, segmento removido e deep link compartilhado com usuário sem permissão. Nenhum atalho inicia envio automaticamente.
- **Entregar/aceite:** teste integrado biblioteca→wizard→salvar→reabrir→revisar, preservando dados e bloqueando configurações incompatíveis.

### 080 — Gate de segmentos e templates

Dependências: 071, 072, 073, 074, 075, 076, 077, 078, 079. Responsável: Produto/Design/QA/DBA.

- **Executar:** demonstrar referências 02–05 em carvão; comparar layout, critérios comerciais, editor, biblioteca e previews com modelos. Rodar integração das regras e conteúdo até o snapshot de campanha.
- **Validar:** não existem tabs vazias, filtros decorativos ou A/B instável; RFM/CRM funcionam com fonte comprovada. Testar novamente as telas 08/09 para detectar regressão de componentes compartilhados.
- **Entregar/aceite:** gate H com quatro telas aceitas e dependências de dados resolvidas; problemas de fonte permanecem BLOCKED e não recebem selo de conclusão visual/funcional conjunta.

## Fase I — CRM, importação, supressão e robustez transversal

### 081 — Implementar upload e análise segura da importação

Dependências: 007, 018, 021, 022, 028, 036, 080. Responsável: Frontend/Backend/Segurança.

- **Executar:** iniciar referência 15 com upload, mapeamento de colunas, prévia e relatório de validação; suportar somente formatos aprovados e anunciados. Limitar bytes, linhas, colunas, tamanho de célula e expansão de arquivos compactados; normalizar encoding e telefone com regra explícita.
- **Validar:** CSV com aspas/quebras de linha, cabeçalho duplicado, XLSX inválido, fórmula, arquivo vazio/grande, MIME divergente e coluna obrigatória ausente. Nunca executar fórmulas nem usar upload como autorização para cadastrar indiscriminadamente.
- **Entregar/aceite:** parsing seguro, preview identificada como amostra e contagens do arquivo inteiro; dados pessoais restritos ao ambiente autorizado.

### 082 — Implementar correspondência com o CRM canônico

Dependências: 021, 023, 028, 073, 081. Responsável: Backend/DBA/Produto.

- **Executar:** reconciliar identidade externa, empresa e contato com regras aprovadas; priorizar identificadores confiáveis e distinguir equivalência exata de sugestão por similaridade. Por padrão, correspondência heurística exige revisão; percentual visual precisa de método documentado.
- **Validar:** telefone compartilhado, homônimos, múltiplas empresas, documento ausente, país diferente e dois candidatos igualmente plausíveis. Provar a identidade do CRM conectado; não presumir HubSpot, Bitrix24 ou outro sistema pelo mockup.
- **Entregar/aceite:** candidatos e motivos reproduzíveis; nenhuma fusão destrutiva automática. Dados ambíguos permanecem conflitos visíveis, não “vinculados” por conveniência.

### 083 — Implementar resolução manual de conflitos e vínculos

Dependências: 022, 081, 082. Responsável: Frontend/Backend/DBA.

- **Executar:** completar tabela de pendências da referência 15: vincular existente, criar contato local autorizado, ignorar e revisar conflito; registrar decisão/ator/origem. Escrita no CRM externo exige autorização e contrato próprios, não é presumida pela permissão de leitura.
- **Validar:** dois operadores resolvendo a mesma linha, retry após resposta perdida, candidato removido e usuário sem direito de cadastro. Criar não duplica contato; ignorar não significa consentimento de envio nem supressão global automática.
- **Entregar/aceite:** ações idempotentes, reversibilidade definida por tipo de vínculo e trilha de auditoria; nenhuma ação termina apenas em toast.

### 084 — Tornar importações retomáveis e auditáveis

Dependências: 021, 022, 025, 081, 082, 083. Responsável: Backend/DBA/SRE.

- **Executar:** processar job em lotes limitados com checkpoint, fingerprint e política de repetição; contabilizar criados, vinculados, ignorados, inválidos e pendentes como categorias explícitas. Exportar erros sanitizados e informar impacto antes de confirmar.
- **Validar:** queda após commit antes do ACK, arquivo repetido, cancelamento no meio, retomada e falha parcial de CRM. Desfazer importação não pode apagar registros preexistentes ou alterações legítimas posteriores.
- **Entregar/aceite:** relatório fecha com quantidade de linhas processáveis; rollback/compensação tem escopo aprovado e preserva origem. Importar não habilita envio automático aos contatos.

### 085 — Completar a lista de supressão e suas ações

Dependências: 021, 025, 046, 069, 080. Responsável: Frontend/Backend/Produto.

- **Executar:** reproduzir referência 06 com KPIs, filtros, tabela, paginação e rail; suportar contato conhecido e telefone avulso conforme modelo canônico. Remoção/expiração seguem política explícita; remover registro não inventa consentimento nem ignora outro bloqueio vigente.
- **Validar:** diferentes formatos do mesmo telefone, supressões simultâneas, motivo obrigatório, papel sem permissão, expiração e remoção concorrente com envio. O backend de envio deve permanecer a autoridade de elegibilidade.
- **Entregar/aceite:** CRUD auditável integrado ao predicado da etapa 025; teste demonstra bloqueio real no motor, não apenas mudança do badge.

### 086 — Completar importação, exportação e histórico de supressão

Dependências: 057, 081, 084, 085. Responsável: Backend/Frontend/Segurança.

- **Executar:** integrar importação validada, exportação filtrada, gestão autorizada de motivos e timeline real. Definir precisamente “campanhas protegidas”, opt-outs do período e bloqueios manuais; permitir rastrear a origem sem expor PII desnecessária.
- **Validar:** lista maior que a página, duplicatas, CSV com fórmula, motivo removido ainda referenciado, expiração e atualização de telefone. Histórico não pode ser editado silenciosamente junto com registro atual.
- **Entregar/aceite:** exportação corresponde ao escopo autorizado e contagens reconciliam com backend; rail não usa números fixos ou eventos fictícios.

### 087 — Executar revisão transversal de autorização e segurança

Dependências: 022, 029, 036, 052, 054, 057, 078, 084, 085, 086. Responsável: Segurança/DBA/QA.

- **Executar:** revisar permissões de tabelas, RPCs, Edge Functions, storage, filas, relatórios e CRM; testar com papéis reais de baixo privilégio. Conferir funções privilegiadas, search_path, grants, logs, acesso direto e ausência de credenciais em bundle/arquivos.
- **Validar:** leitura/escrita entre escopos, alteração de owner/tenant, IDOR, acesso a mídia de outro usuário, payload malicioso, replay e revogação de sessão. Testes não usam service_role como substituto de usuário autenticado.
- **Entregar/aceite:** inventário de fronteiras e evidências negativas/positivas; falhas críticas/altas bloqueiam release. Esta revisão complementa, não adia, a segurança já exigida desde a etapa 022.

### 088 — Reconciliar CRM, audiência e resultado ponta a ponta

Dependências: 028, 050, 060, 073, 079, 084, 085, 086, 087. Responsável: QA/DBA/Produto.

- **Executar:** usar dataset dourado autorizado: importar, resolver vínculo, segmentar por empresa/compra, aplicar supressão, revisar, executar em stub/conta interna, receber eventos e associar venda. Comparar resultado por identidade e valores agregados.
- **Validar:** CRM indisponível/atrasado, mudança comercial após snapshot, opt-out durante campanha, pedido cancelado e telefone alterado. Provar consistência entre lista, wizard, execução, relatório e exportação.
- **Entregar/aceite:** cadeia de evidências completa; conexão HTTP bem-sucedida ao CRM, isoladamente, não conta como integração comercial verificada.

### 089 — Medir performance, capacidade e custo com orçamento aprovado

Dependências: 024, 045, 058, 068, 074, 084, 088. Responsável: SRE/DBA/Frontend.

- **Executar:** medir latência p50/p95, consultas por interação, planos SQL, leituras, bundle, memória, fila e custo estimado por campanha. Fixar orçamento objetivo aprovado a partir da carga esperada; otimizar gargalos medidos, com índices seletivos e paginação limitada.
- **Validar:** datasets vazio/pequeno/grande, múltiplos operadores e campanhas concorrentes; profiling de render, tabelas, gráficos e filtros. Carga é executada em staging, sem disparos reais ou teste irrestrito de produção.
- **Entregar/aceite:** resultados antes/depois e limites de capacidade; orçamento descumprido exige correção ou decisão explícita, nunca aumento silencioso do limite do teste.

### 090 — Gate das integrações e qualidade transversal

Dependências: 081, 082, 083, 084, 085, 086, 087, 088, 089. Responsável: Produto/Design/QA/SRE.

- **Executar:** aprovar referências 06/15 em carvão, integração canônica, desempenho e proteção operacional. Revisar requisitos bloqueados desde etapas 005, 028, 055, 059 e 073; não carregar pendência escondida para o fechamento.
- **Validar:** todos os fluxos de importação/vínculo/supressão possuem testes de erro, autorização e recuperação. Garantir que não houve regressão nas fontes ZAPP e segmento salvo.
- **Entregar/aceite:** gate I sem bloqueadores críticos/altos e com capacidades de dados do escopo resolvidas; nenhuma declaração de “100% integrado” apoiada somente em fixtures.

## Fase J — Ajuda, aceite integral e publicação controlada

### 091 — Produzir ajuda correspondente ao produto entregue

Dependências: 003, 040, 050, 060, 070, 080, 090. Responsável: Produto/Documentação/Frontend.

- **Executar:** preparar referência 16 com guias de primeira campanha, segmentação, templates, supressão, agendamento, métricas e solução de erros. Conteúdo deve refletir controles e limitações reais, incluindo resultado desconhecido e impossibilidade de recolher mensagem entregue.
- **Validar:** seguir cada guia em staging com usuário que não conhece a implementação; conferir labels, links e permissões. Não inventar vídeos, quantidade de artigos, “resposta em 5 minutos” ou garantias legais para preencher o layout.
- **Entregar/aceite:** conteúdo revisado, autoria/data e recursos reais; material ainda não produzido permanece pendente se necessário à referência aprovada.

### 092 — Implementar busca, guias e canais de suporte da ajuda

Dependências: 012, 062, 091. Responsável: Frontend/QA/Produto.

- **Executar:** reproduzir referência 16 em carvão com busca, tópicos, guias, checklist e suporte; configurar destinos reais aprovados. Guia rápido abre conteúdo utilizável; busca indexa conteúdo disponível com estado sem resultado.
- **Validar:** acentos, termos inexistentes, teclado, foco, deep link, destino indisponível e permissão. Abertura de suporte não pode exfiltrar mensagens/contatos sem consentimento nem apontar para endereço placeholder.
- **Entregar/aceite:** screenshot e teste de cada CTA; ajuda acessível a partir de overview, wizard e erro recuperável.

### 093 — Fechar inventário de rotas, abas e ações dos 17 modelos

Dependências: 003, 012, 062, 069, 079, 083, 086, 090, 092. Responsável: QA/Frontend/Produto.

- **Executar:** percorrer matriz requisito→rota→controle→handler→serviço→teste; incluir menus de três pontos, filtros, exportar, compartilhar, editar, fechar, voltar, salvar, testar e todas as abas. Fechar destinos provisórios da etapa 062.
- **Validar:** acesso direto, refresh, back/forward, sessão expirada e permissão insuficiente. Buscar placeholders/handlers vazios é triagem; confirmar manualmente alcance e comportamento para evitar falsos positivos e falsos negativos.
- **Entregar/aceite:** zero ação obrigatória decorativa, rota morta ou aba “em breve”; diferenças aprovadas possuem decisão nominal, não exceção verbal.

### 094 — Executar aceite visual integral autenticado

Dependências: 002, 004, 010, 039, 040, 070, 080, 090, 092, 093. Responsável: Design/Produto/QA.

- **Executar:** comparar cada uma das 17 referências com screenshot da implementação em estado equivalente; usar originais como fonte de composição e baseline carvão aprovado como referência cromática. Conferir densidade, rail, proporções, tipografia, ícones, alinhamentos e hierarquia.
- **Validar:** viewport original, desktop menor, mobile e zoom; estados de carregamento/erro/dialog/foco dos componentes usados. Diferença automatizada complementa revisão humana, sem trocar golden automaticamente para fazer teste passar.
- **Entregar/aceite:** aprovação por tela, com antes/depois e divergências justificadas; sem sessão autenticada, aceite runtime permanece BLOCKED, não é substituído por screenshot do login.

### 095 — Executar bateria final funcional e de regressão

Dependências: 009, 049, 050, 060, 080, 087, 088, 089, 090, 093, 094. Responsável: QA/DBA/SRE.

- **Executar:** executar typecheck, lint-ratchet, build, unidades, componentes, integração SQL/RLS, contratos, E2E e testes visuais previstos; acrescentar regressão de Chat/Inbox e áreas afetadas pelo shell. Reexecutar os defeitos C01–C15 com expectativa corrigida.
- **Validar:** teste realmente falha quando a proteção é removida em ambiente temporário controlado; nenhum teste de reprodução do bug foi confundido com prova de correção. Reportar skips, flaky, falhas preexistentes e escopo não coberto.
- **Entregar/aceite:** execução vinculada ao SHA candidato com logs sanitizados; não declarar sucesso total por build verde ou contagem grande de testes sem cobertura dos requisitos.

### 096 — Preparar release imutável, migrations e rollback

Dependências: 001, 022, 050, 087, 095. Responsável: SRE/DBA/Responsável pelo projeto.

- **Executar:** atualizar/reconciliar branch sem sobrescrever trabalho alheio; fixar SHA candidato, CI, manifesto de frontend/Edge Functions e inventário de migrations únicas forward-only. Provar identidade do Supabase canônico e Vercel; ensaiar atualização em staging e recuperação de backup com procedimento autorizado.
- **Validar:** compatibilidade entre código antigo/novo e schema durante rollout; evitar dois dispatchers concorrentes sem coordenação. Verificar pendências remotas sem fabricar SQL/hash de ledger histórico; seis migrations históricas sem prova antiga continuam com limitação documental explícita, se ainda aplicável.
- **Entregar/aceite:** plano de implantação e reversão aprovado antes de mutações de produção; nenhuma rotação, alteração de ruleset, segredo ou provisionamento pago presumida por esta etapa documental.

### 097 — Executar deploy canário e smoke positivo/negativo

Dependências: 096. Responsável: SRE/DBA/QA. Ambiente: produção, somente após autorização explícita.

- **Executar:** aplicar release na ordem compatível aprovada, verificar migrations e funções pelo manifesto, ativar canário para operadores/destinatários internos allowlisted. Executar smoke autenticado de cada função alterada, incluindo negativas de autenticação, permissão e payload.
- **Validar:** login, listagem, draft único, upload, preflight, agenda, envio interno autorizado, webhook, pausa e relatório; provar efeitos no banco e versão online. HTTP 200/OPTIONS isolado não certifica a função.
- **Entregar/aceite:** GitHub SHA, deployment e estado canônico correlacionados; dados de teste identificados e limpeza explicitamente delimitada. Falha interrompe ampliação do canário.

### 098 — Ampliar rollout com critérios objetivos de interrupção

Dependências: 089, 096, 097. Responsável: SRE/Produto/DBA. Ambiente: produção autorizada.

- **Executar:** ampliar por grupos/conexões/volume conforme plano aprovado, preservando bloqueio de disparos não autorizados. Definir previamente duração por faixa, limites de erro/latência/fila, alarmes e responsável por interromper.
- **Validar:** kill switch, pausa do motor e retorno à versão compatível; confirmar que rollback não reenvia jobs nem tenta desfazer mensagens entregues. Evolução de schema reversível por compatibilidade/forward fix, não por restauração cega de backup sobre dados novos.
- **Entregar/aceite:** cada faixa só avança após janela e métricas previstas; falha crítica/alta interrompe imediatamente. Liberação de funcionalidades não autoriza campanhas a contatos reais sem comando do operador responsável.

### 099 — Observar operação e fechar falhas de campo

Dependências: 097, 098. Responsável: SRE/QA/Produto.

- **Executar:** observar ao menos a janela acordada no release, propondo 24 horas e uma fronteira real de agendamento; complementar recorrência/fusos com relógio simulado. Monitorar resultados desconhecidos, duplicatas, supressão, filas, webhooks, latência, erros JS e feedback visual.
- **Validar:** observação realmente transcorreu; registrar início/fim e consultas. Se a janela não terminou, estado permanece IN_PROGRESS. Falha reabre a etapa de origem e exige novo teste/aceite dos consumidores afetados.
- **Entregar/aceite:** relatório pós-release sem incidentes bloqueantes abertos; ausência de reclamação não substitui verificação operacional.

### 100 — Encerrar com rastreabilidade integral, não com promessa

Dependências: 003, 040, 050, 060, 070, 080, 090, 093, 094, 095, 096, 097, 098, 099. Responsável: Produto/QA/Responsável pelo projeto.

- **Executar:** consolidar diário 001–100, referências 01–17, achados C01–C15, regressões, decisões, migrations, deployment e limitações. Entregar documentação de operação, recuperação e manutenção; obter aceite do responsável pelo produto.
- **Validar:** cada VERIFIED possui evidência no código efetivamente publicado e ambiente pertinente; confirmar GitHub/produção/banco dentro do escopo do release. Nenhuma capacidade ausente, teste não executado ou aceite pendente está escondido sob “10/10”.
- **Entregar/aceite:** fechamento somente com todos os requisitos aprovados verificados, gates aceitos e observação concluída. Se houver BLOCKED/REOPENED, publicar saldo real e próximos responsáveis; não declarar perfeição nem plano cumprido integralmente.

## Matriz de cobertura dos 17 modelos

Os IDs abaixo seguem a associação registrada na auditoria. A etapa 002 deve conferir os IDs com os nomes/hash dos arquivos originais antes de qualquer implementação; em caso de divergência, corrigir o mapeamento, não reinterpretar silenciosamente o modelo.

| Referência | Entrega exigida | Etapas principais | Gate de aceite |
|---|---|---|---|
| 01 | Visão geral de campanhas, tabela e rail | 061, 062 | 070, 093, 094 |
| 02 | Biblioteca de segmentos e detalhes | 071, 073, 074 | 080, 094 |
| 03 | Construtor de segmentos AND/OR | 072, 073, 074 | 080, 094 |
| 04 | Biblioteca de templates | 075, 078, 079 | 080, 094 |
| 05 | Editor, variações e versões de template | 076, 077, 078 | 080, 094 |
| 06 | Lista de supressão e ações | 025, 085, 086 | 090, 094 |
| 07 | Analytics agregado | 051–060, 068 | 070, 094 |
| 08 | Nova campanha: informações, público, mensagem e resumo | 031–037, 039, 079 | 040, 093, 094 |
| 09 | Revisão final e confirmação | 026, 027, 038 | 040, 094 |
| 10 | Agendamento, calendário e programação | 017, 048, 063 | 070, 094 |
| 11 | Monitor ao vivo | 051, 052, 058, 064 | 070, 094 |
| 12 | Campanha em andamento e abas | 047, 058, 065 | 070, 094 |
| 13 | Campanha pausada e retomada | 047, 066 | 070, 094 |
| 14 | Relatório completo de campanha | 051–060, 067 | 070, 094 |
| 15 | Importação, vinculação CRM e conflitos | 028, 081–084 | 090, 094 |
| 16 | Central de ajuda, guias e suporte | 091, 092 | 093, 094 |
| 17 | Estados de sistema e modais críticos | 018, 025, 047, 069 | 070, 093, 094 |

O gate 094 exige 17/17 decisões visuais. O gate 095 exige capacidades funcionais correspondentes. O gate 100 exige ambos, além de publicação e evidência de banco. Uma mesma screenshot não comprova todas essas dimensões.

## Matriz de correção dos achados da auditoria

Esta tabela conecta achados a trabalho verificável; não declara que os achados continuam iguais na main futura. A etapa 001 deve revalidar cada um e reutilizar correções comprovadas.

| Achado | Frente de correção/verificação | Etapas |
|---|---|---|
| C01 | Estado de URL e ciclo de navegação | 012, 019, 093 |
| C02 | Composição visual e mensagem no wizard | 004, 031–040, 094 |
| C03 | Filtros e seleção de audiência | 023, 024, 034, 073 |
| C04 | Identidade, autosave e persistência de draft | 013–015, 020 |
| C05 | Duplicação, autoria e callbacks | 016, 019, 020 |
| C06 | Fuso, round-trip e agendamento | 017, 048, 063 |
| C07 | Validação semântica e bloqueio efetivo de ações | 018, 026, 038, 039 |
| C08 | Indicadores artificiais e fallbacks enganosos | 011, 051–060, 068 |
| C09 | Definições, unidades e coerência analítica | 006, 053–056, 059, 068 |
| C10 | Contratos de dados e fonte comercial | 005, 028, 051, 055, 073, 088 |
| C11 | Supressão incompleta/inconsistente | 021, 025, 046, 085, 086 |
| C12 | Preflight, revisão e consistência na confirmação | 026, 027, 038, 046 |
| C13 | Audiência completa e limites de materialização | 024, 027, 045, 089 |
| C14 | Motor durável, concorrência e controle de execução | 041–050 |
| C15 | Telas operacionais, logs e completude dos fluxos | 058, 063–070, 093 |

Os probes R01–R11 devem ser vinculados individualmente aos testes de regressão na etapa 009. O arquivo de reprodução da auditoria demonstra sintomas: passar um teste que espera o comportamento defeituoso NÃO comprova correção.

## Contrato de evidência por etapa

Antes de executar, criar/atualizar diário de execução separado deste plano. Nunca alterar os critérios retroativamente só para aprovar o que já foi construído. Mudanças legítimas de requisito precisam de decisão, justificativa, responsável e revalidação dos dependentes.

Modelo mínimo de registro — valores abaixo são placeholders, não evidências de execução:

```yaml
etapa: "013"
estado: PENDING
requisitos: ["draft-identidade-estavel"]
base_sha: "A_PREENCHER"
implementation_sha: "A_PREENCHER"
ambiente: "staging"
arquivos_alterados: []
migrations: []
testes:
  positivos: []
  negativos: []
  concorrencia_recuperacao: []
  comandos_e_exit_codes: []
evidencias:
  screenshots_sanitizados: []
  logs_sanitizados: []
  verificacao_banco_sem_pii: []
  comparacao_com_referencia: []
resultado_esperado: "A_PREENCHER"
resultado_observado: "NAO_EXECUTADO"
limitacoes: []
aprovacoes: []
dependencias_bloqueadas: []
rollback_ou_compensacao: "A_PREENCHER"
```

Não inserir tokens, signed URLs, telefones reais, e-mails pessoais ou payloads privados nos artefatos públicos. Logs sensíveis ficam em armazenamento restrito; o diário registra caminho controlado e resultado sanitizado.

## Regras de execução para evitar repetir a falha anterior

- **Primeira entrega demonstrável:** fechar contratos e regressões, depois apresentar 08/09 em carvão no gate 040. Não esperar a etapa 094 para descobrir rejeição visual.
- **Sem nova reescrita indiscriminada:** inspecionar implementação atual antes de alterar; commits recentes podem resolver parte dos achados. Reutilizar só depois de provar o comportamento.
- **Gate fechado interrompe sua cadeia dependente:** registrar causa, responsável e ação de desbloqueio. Trabalho independente pode continuar se não ampliar risco, mas não permite anunciar a fase bloqueada como concluída.
- **Fidelidade não significa copiar erros do desenho:** preservar composição aprovada, mas corrigir incoerências matemáticas, nomes de métricas e dados impossíveis por decisão explícita. Registrar a diferença lado a lado.
- **Frontend não contorna backend ausente:** não inserir mocks em produção, remover validação, enfraquecer RLS ou exibir sucesso prematuro para fazer o fluxo parecer pronto.
- **Sem atalhos de ledger:** não fabricar statements/hashes históricos, renomear migration já aplicada sem análise ou inserir registros manuais para mascarar drift. Usar procedimento oficial aprovado e evidência de estado estrutural.
- **Sem ensaio em clientes:** carga, caos, importações sintéticas e disparos de regressão usam staging/stub; positivos externos somente com destino interno autorizado e limites aprovados.
- **Sem snapshots autoaprovados:** mudança da imagem esperada exige comparação e aceite, não apenas comando de atualização de golden.
- **Sem redução silenciosa de escopo:** falta de contrato CRM, conteúdo de ajuda, mecanismo de tracking ou recurso do provedor exige decisão. Estado “indisponível” é obrigatório para honestidade, mas não entrega a capacidade faltante.
- **Sem nota inventada:** reportar `X/100 VERIFIED`, `Y IMPLEMENTED`, `Z BLOCKED`, telas aprovadas e gates pendentes. Percentual de etapas não representa, por si só, percentual de esforço nem prontidão de produção.

## O que “10/10” significa neste plano

Não é garantia de ausência absoluta de bugs. É um checklist de dez dimensões de aceite, todas com evidência e dentro do escopo aprovado:

| Dimensão | Prova de conclusão |
|---|---|
| 1. Fidelidade visual | 17 modelos comparados, carvão preservado, diferenças aprovadas |
| 2. Fluxos completos | Rotas, abas, filtros e ações reais sem placeholders obrigatórios |
| 3. Persistência e integridade | Draft, snapshot, versões, timezone e cardinalidades comprovados |
| 4. Integração canônica | Identidade e contratos reais do Supabase/CRM/provedor verificados |
| 5. Segurança | Autorizações, RLS, storage, secrets e fronteiras testados com baixo privilégio |
| 6. Confiabilidade de execução | Concorrência, retry, desconhecidos, pausa e recuperação testados |
| 7. Métricas confiáveis | Fonte, unidade, atribuição e reconciliação demonstradas |
| 8. Usabilidade e desempenho | Viewports, teclado, acessibilidade e orçamento de capacidade aceitos |
| 9. Publicação e operação | SHA/manifesto/banco correlacionados, canário e observação concluídos |
| 10. Evidência e manutenção | Diário completo, runbooks e aceite do responsável pelo produto |

Qualquer dimensão sem evidência impede a declaração “10/10”. Defeito crítico/alto bloqueia o release. Débito de menor severidade exige responsável, prazo e decisão explícita; capacidade obrigatória ausente não pode ser reclassificada como detalhe estético para encerrar o plano.

## Como iniciar a execução

1. Autorizar a execução do plano e indicar quem aprova produto/design e mudanças de produção; este documento, sozinho, não realiza nenhuma dessas mudanças.
2. Executar 001–010 e apresentar base atual, matriz de requisitos, decisões do wizard e orçamento inicial. Estimativas de prazo/esforço devem ser feitas após esse inventário, sem prometer datas a partir do número de etapas.
3. Implementar cada fatia com teste que demonstrava a falha, correção, regressão e evidência visual/dados pertinente. Preferir PRs pequenos e temáticos, mantendo migrations ordenadas e compatíveis.
4. Não avançar o aceite de fase sem a demonstração prevista. Ao reportar progresso, informar o próximo gate e o que ainda impede sua aprovação.

**Estado deste documento na criação:** planejamento concluído; execução das 100 etapas ainda não iniciada por este documento. Nenhum deploy, SQL de produção, alteração de segredo ou envio de campanha é realizado pela criação do plano.

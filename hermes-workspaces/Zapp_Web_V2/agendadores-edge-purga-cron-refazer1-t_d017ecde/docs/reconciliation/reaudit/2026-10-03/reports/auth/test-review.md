# Revisão semântica dos testes — Auth e lote delegado

Fonte `da307ba5626dce892f0b37cb6762463f55d14a96`. Estado: **COMPLETE**. Atualizado em 2026-10-04T06:08:12.992146+00:00.

Alocação: 88 arquivos / 14464 linhas. Leitura integral concluída: 88; parcial: 0; pendente: 0. Linhas realmente lidas: 14464.

Esta é revisão do código dos testes, não execução ou declaração de que a suíte passa. Assertions e mocks só sustentam o contrato que efetivamente exercitam. Ausência de teste genérico não gera um achado novo por arquivo.

## 1. `src/components/auth/__tests__/PasswordStrengthMeter.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 94]]; total: 94 linhas; blob: `984f85f67d040d9288e1d0d2dc4fcbda6050b3a7`.

**Contrato exercitado:** Prefixo SHA-1 de5 caracteres/UTF-8, diferença de SHA-256, header Add-Padding e veredito por sufixo HIBP.

**Fixtures e substituições:** Componente real; fetch global substituído por respostas textuais bem-sucedidas e hashes calculados por node:crypto.

**Controles positivos:** Casos de sufixo presente e ausente; senha acentuada.

**Limites e lacunas concretas:** Não alterna senha durante request pendente, nem resolve respostas fora de ordem; não afasta AUTH031. Não acessa HIBP real nem executa teste nesta auditoria.

Relacionados, sem nova contagem: R2-AUTH-031.

## 2. `src/components/calls/__tests__/ActiveCallBar.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 96]]; total: 96 linhas; blob: `ce7084fee65fcf7cd8614d9f23bd4e5cfba32b41`.

**Contrato exercitado:** Visibilidade por callStatus/view, número/duração, botão Atender para inbound e navegação ao clicar na barra.

**Fixtures e substituições:** useCallSession e navigationHistory retornam fixtures/vi.fn; fixture session.status=active pode coexistir com callStatus=idle.

**Controles positivos:** Barra ausente em idle e na própria view voip; classes h-12/shrink-0 e ausência de fixed/bottom.

**Limites e lacunas concretas:** A altura é verificada por classe, não medida. Aceite chega apenas ao spy; fixture não percorre reducer/motor nem sincronização entre dois estados.

Relacionados, sem nova contagem: TEL-RUNTIME-001.

## 3. `src/components/calls/__tests__/ActiveCallPanel.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 134]]; total: 134 linhas; blob: `a163beff0e85988a5bbab4d883d50d2ab300c58f`.

**Contrato exercitado:** Cinco estados antes do fim, rótulos, contato/canal, timer apenas active, controles, gate canReject, aria-pressed e DTMF por click.

**Fixtures e substituições:** Provider/capacidades substituídos por estados mutáveis e spies; render real de ActiveCallPanel/Keypad.

**Controles positivos:** Recusar disabled quando canReject=false; mute/teclado disabled fora de active.

**Limites e lacunas concretas:** Não monta estado ended/PostCallSummary, portanto não exercita perda de rascunho AUTH051. DTMF/aceite são spies sem transporte nem identidade concorrente.

Relacionados, sem nova contagem: R2-AUTH-051, TEL-RUNTIME-001.

## 4. `src/components/calls/__tests__/CallChannelBadge.linha.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 39]]; total: 39 linhas; blob: `d607b38239e370e18170cd305fb65f77811dde7d`.

**Contrato exercitado:** Apresentação de linha/canal e precedência do motivo D8 que oculta o nome da linha.

**Fixtures e substituições:** Props textuais fixas sobre CallChannelBadge real.

**Controles positivos:** Sem motivo mostra linha; com motivo de restrição não mostra a linha; VoIP conserva rótulo.

**Limites e lacunas concretas:** Não consulta permissões/RLS nem decide se o usuário pode conhecer o nome recebido por props.

## 5. `src/components/calls/__tests__/CallChannelBadge.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 26]]; total: 26 linhas; blob: `86d2ceb30d462611b8db2d21225caff8c68528e6`.

**Contrato exercitado:** Rótulos VoIP/WhatsApp, texto de restrição e ausência de separador com motivo null.

**Fixtures e substituições:** Componente real com props fixas e assertions de texto.

**Controles positivos:** Canal sem motivo não exibe texto adicional.

**Limites e lacunas concretas:** Cobertura de apresentação; não prova origem, seleção da linha ou autorização real.

## 6. `src/components/calls/__tests__/CallDialog.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 340]]; total: 340 linhas; blob: `85d2083baf72f952b5f78b1609f451752a11028f`.

**Contrato exercitado:** CallDialog usa dial/accept/hangup/toggleMute do provider, evita quatro mutations legadas/insert e disca uma vez mesmo com callback mudando de identidade.

**Fixtures e substituições:** Provider, Supabase, legado useCalls, dialog/button/avatar/motion substituídos; eventos por fireEvent, números/IDs sintéticos; regex adicional lê fonte.

**Controles positivos:** existingCallId e inbound sem ID não discam; mute real encaminha ao spy; encerrar fecha; ausência deliberada do alto-falante cosmético.

**Limites e lacunas concretas:** 276–283 impõe ringing_in+initialStatus answered e exige visual atendido; não prova que o flag pertence ao callId atual ou que B foi aceita. Não exercita A→B no overlay (CALL006), rejeição do aceite, mídia/DB ou provider real.

Relacionados, sem nova contagem: R2-CALL-006, R2-CALL-007, TEL-RUNTIME-001.

## 7. `src/components/calls/__tests__/CallHistoryCard.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 47]]; total: 47 linhas; blob: `67a02070ac5e68d7e7dd10ef6f39b50962b4388d`.

**Contrato exercitado:** Card apresenta total37 recebido por prop, seletor condicionado à flag e três abas com valor ativo.

**Fixtures e substituições:** Componentes reais, números/flags fornecidos diretamente e onMudar spy não acionado.

**Controles positivos:** Seletor ausente para flag falsa; aba WhatsApp selecionada por prop.

**Limites e lacunas concretas:** Teste intitulado trocar avisa o pai só verifica existência do seletor, não interage nem verifica onMudar. Número37 não veio de RPC neste teste; não prova paginação/URL/RLS.

Relacionados, sem nova contagem: TEL-PERIOD-001.

## 8. `src/components/calls/__tests__/CallHistoryCells.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 83]]; total: 83 linhas; blob: `7e5fb975c89e75a7df06245f31623a63046e1735`.

**Contrato exercitado:** Precedência peer/CRM/telefone, fallback desconhecido, foto/iniciais, resultado nulo, rótulos de direção e formatação/invalidade de data.

**Fixtures e substituições:** Helpers e células reais com fixtures sintéticas; foto apenas src atribuído, sem rede.

**Controles positivos:** Data inválida/null vira traço, nomes ausentes conservam número e reduced-motion usa classe motion-safe.

**Limites e lacunas concretas:** Asserts de cor/40px/animar limitam-se a texto/classes. Não mede estilo, acessibilidade completa nem ação do botão dentro da tabela (AUTH052).

Relacionados, sem nova contagem: R2-AUTH-052.

## 9. `src/components/calls/__tests__/CallHistoryStates.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 66]]; total: 66 linhas; blob: `0bdc18137a352e582b7b5da48e8fa2172cbcf5af`.

**Contrato exercitado:** Janela de7 páginas contém a atual, paginação marca aria-current/some com1, skeleton8 e callbacks de limpar/nova ligação/retry.

**Fixtures e substituições:** Helpers/componentes reais; callbacks spies, totais/páginas fornecidos diretamente.

**Controles positivos:** Casos início/meio/fim da janela, vazio por filtro distinto de vazio total e erro separado.

**Limites e lacunas concretas:** Não consulta dados nem testa clamp concorrente do hook MOD015; alturas verificadas por classe, não layout. Nova ligação é só um spy, não o callback do pai.

Relacionados, sem nova contagem: R2-MOD-015.

## 10. `src/components/calls/__tests__/CallHistoryToolbar.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 45]]; total: 45 linhas; blob: `c027f6810382ea7fb4673e9a2acec5954e2f667f`.

**Contrato exercitado:** Busca em3 alterações só chama onBusca uma vez após300ms; classes h-10 e catálogo de9 resultados no objeto do domínio.

**Fixtures e substituições:** Componente real com timers falsos e callbacks no-op/spy.

**Controles positivos:** Nenhuma chamada antes do debounce; valor final ana recebido pelo callback.

**Limites e lacunas concretas:** Não testa troca externa da URL ou identidade de callback entre renders. Teste de opções só inspeciona RESULT_LABEL, sem abrir Select ou verificar sua lista efetiva.

## 11. `src/components/calls/__tests__/ContactPicker.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 51]]; total: 51 linhas; blob: `8337b58180ac4bef17af088611f377b2b9aad8ba`.

**Contrato exercitado:** Busca só após2 letras, parâmetro page_size6, nomes/telefones, seleção com seta/Enter e chip quando selecionado.

**Fixtures e substituições:** ContactService retorna imediatamente dois contatos fixos; timers reais no código de teste.

**Controles positivos:** Uma letra não busca; ArrowDown+Enter escolhe segundo contato; chip esconde input.

**Limites e lacunas concretas:** page_size6 enviado não comprova backend limitar6. Não há resposta fora de ordem, erro, mudança de número após seleção ou reset do chip (MOD016).

Relacionados, sem nova contagem: R2-MOD-016.

## 12. `src/components/calls/__tests__/DialPad.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 298]]; total: 298 linhas; blob: `15ce534d480b749e861a8b08e147755fea10056f`.

**Contrato exercitado:** DialPad isolado monta12 teclas, filtros de número, estados/rótulos, enabled por conexão/número, callbacks de discar/DTMF/mute/fim e ausência deliberada dos botões conectar/desconectar.

**Fixtures e substituições:** Props de estado fixas, todos efeitos externos vi.fn, componente real com fireEvent e consultas de classes/ícones.

**Controles positivos:** Vazio/desconectado não disca; input oculta em active; * e # encaminhados como DTMF;20 clicks preservam dígitos.

**Limites e lacunas concretas:** DialPad não tem consumidor produtivo atual localizado. Aceitar número1/551 é contrato desta implementação antiga, não prova de validação do NewCallPanel ativo. Alguns testes intitulados delete/trim só verificam contagem/input, sem clicar Delete nem discar. Não mede SIP nem teclado físico global.

Relacionados, sem nova contagem: D-AUTH-51, R2-MOD-016.

## 13. `src/components/calls/__tests__/IncomingCallAlert.provider.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 133]]; total: 133 linhas; blob: `fa0ea72fe5f2dabaa4f1548e5fde94df3d8d9136`.

**Contrato exercitado:** Alerta com conexão WhatsApp chama accept/reject abstratos, evita hooks legados, mostra Ignorar e chama dismiss; timer local não decide desfecho.

**Fixtures e substituições:** Listener devolve sempre a mesma notificação WhatsApp, provider só spies, capacidades fixas e som desativado; CallDialog substituído por null.

**Controles positivos:** Sem escrita legada por answer/miss; texto de Ignorar coerente com canal;90s virtuais não disparam ações da UI.

**Limites e lacunas concretas:** A fixture testa justamente WhatsApp→provider sem verificar o destino SIP desses métodos: não afasta CALL007. Listener constante e CallDialog null removem ciclo terminal/troca A→B; assertion de não-dismiss por timeout não prova que o provider real faça desaparecer o alerta (CALL006).

Relacionados, sem nova contagem: R2-CALL-006, R2-CALL-007.

## 14. `src/components/calls/__tests__/IncomingCallAlert.ringtone.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 164]]; total: 164 linhas; blob: `b628042c931fd877db0cc7dcfeff5a4283ad11ef`.

**Contrato exercitado:** Código tenta resume no mount, reage a gesto posterior e remove listeners de gesto no unmount.

**Fixtures e substituições:** AudioContext/gain/oscillator falsos; ativação é uma variável estática manipulada pelo teste. Listener/notificação, provider e capacidades fixos; diálogo null.

**Controles positivos:** Fake continua suspended sem ativação e só muda após flag+pointerdown; unmount impede novas chamadas resume.

**Limites e lacunas concretas:** Não prova áudio audível, política real do navegador, ganho, intervalo ou chegada terminal. Comentário que diz imitar navegador não substitui esse limite; notificação constante não cobre CALL006.

Relacionados, sem nova contagem: R2-CALL-006.

## 15. `src/components/calls/__tests__/Keypad.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 54]]; total: 54 linhas; blob: `fceff6965926672082256cac17988071f778dccf`.

**Contrato exercitado:** 12 teclas, aria-labels, callback por click, disabled, dígito/backspace de window e atributo de modo.

**Fixtures e substituições:** Keypad real, callbacks spies e keyDown diretamente em window.

**Controles positivos:** Tecla a ignorada; disabled não envia click.

**Limites e lacunas concretas:** Teste chamado dentro do escopo envia evento em window, sem foco/target dentro do componente. Não verifica guardas INPUT/contentEditable, modificadores ou duas instâncias; não afasta limite D-AUTH-51.46px é classe, não medição.

Relacionados, sem nova contagem: D-AUTH-51.

## 16. `src/components/calls/__tests__/RecordingPlayer.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 37]]; total: 37 linhas; blob: `515972b1bcffd4f23463e45e9d4ced88a103fe16`.

**Contrato exercitado:** Sem status available não monta player/não invoca; available pede get-call-recording com callId.

**Fixtures e substituições:** QueryClient real sem retry; invoke devolve URL sintética imediatamente.

**Controles positivos:** Status null não faz request.

**Limites e lacunas concretas:** Teste available aguarda só a chamada invoke e afirma ausência de http no DOM; não aguarda/asserta player, src ou reprodução. O componente real usa a URL quando a query resolve, portanto texto nunca pela URL/sem URL no front não é garantia demonstrada. Não há caso404/erro/troca de chamada.

Relacionados, sem nova contagem: D-AUTH-52.

## 17. `src/components/calls/__tests__/TelefoniaTopActions.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 44]]; total: 44 linhas; blob: `822d6e2f4f7c6e913a0e9ba41bc0d5af702fb6dd`.

**Contrato exercitado:** Existência de2 chips+Select e catálogo de6 períodos/valor7dias.

**Fixtures e substituições:** useCallChannels vi.fn devolve capacidades controladas.

**Controles positivos:** Valor recebido aparece no seletor.

**Limites e lacunas concretas:** Teste que diz label reflete D8 só verifica chip existente e hook chamado, não o texto do motivo. Não abre selector nem verifica callback; nenhum gate real/RLS.

## 18. `src/components/calls/__tests__/VoIPPanel.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 470]]; total: 470 linhas; blob: `65de0183d5c6a6b36157741795ab038190f5cfac`.

**Contrato exercitado:** Composição de Telefonia,5 KPIs fornecidos, scope mine ao hook, abertura/fechamento do detalhe, encaminhamento de anotação e Enter/Escape da linha.

**Fixtures e substituições:** Auth/roles, sessão SIP, eleição, useCalls, useMyCalls, useCallsKpi, filtros e PageHeader são mocks; QueryClient/Tooltip reais. Filtro fake apenas mescla chave no useState e não escreve URL.

**Controles positivos:** agent_notes distinto de notes do provedor; ausência de config/conectar no painel; claimLeadership chamado; uma única fileira de KPIs.

**Limites e lacunas concretas:** 263–310 descreve save→reopen, mas só nega metadado do provedor na assertion final; não exige texto salvo. useMyCalls conserva fixture nota antiga, independente do builder/linhas alterado. Filtro mock não reproduz reset de página (MOD014/015). Apenas Enter na linha, não no botão interno (AUTH052); notas sem mudança de ID/latência (MOD013), KPIs sem RPC real/TEL-PERIOD.

Relacionados, sem nova contagem: R2-MOD-013, R2-MOD-014, R2-MOD-015, R2-AUTH-052, TEL-PERIOD-001.

## 19. `src/components/calls/__tests__/calls-access.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 232]]; total: 232 linhas; blob: `c9d94d1036b9f369495e57a6fa0a0b6364cd5722`.

**Contrato exercitado:** Guards de fonte para superfície não vazia, ausência de texto service_role, separação engine/React/SIP, sufixo ilike, RPC de notas, depreciação e ausência literal de Math.random.

**Fixtures e substituições:** Leitura estática de diretórios e regex sobre arquivos; fixtures positivas/negativas do detector de sufixo.

**Controles positivos:** Detector de sufixo tem amostras legítimas/proibidas; paths não podem resultar em coleção vazia; presença de fallback é exigida.

**Limites e lacunas concretas:** Regex de fonte não comprova RLS, segredo ausente em aliases/config, runtime da RPC ou todas formas equivalentes de código. JSDoc exigida menciona consumidores legados já removidos.3 it.todo são pendências explícitas, não testes executados de scope/SRTP/conferência.

Relacionados, sem nova contagem: TEL-RUNTIME-001, TEL-PERIOD-001, D-AUTH-55.

## 20. `src/components/contacts/__tests__/BulkActionsBarPermissions.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 23]]; total: 23 linhas; blob: `6a590081665524692524076438055b59a5effd63`.

**Contrato exercitado:** Barra ativa de Contatos oculta Tipo por padrão e mostra com canChangeType.

**Fixtures e substituições:** Supabase objeto vazio; props com2 IDs e callbacks spies; nenhuma mutation acionada.

**Controles positivos:** Default nega a apresentação do controle.

**Limites e lacunas concretas:** Permissão é fornecida como prop, não derivada de roles/RLS. Não testa nenhuma ação em massa, erro ou zero rows de AUTH013.

Relacionados, sem nova contagem: R2-AUTH-013.

## 21. `src/components/inbox/contact-details/__tests__/click-to-call-origens.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 76]]; total: 76 linhas; blob: `447da741b5c30cb51faafdce78b620e100aed3f2`.

**Contrato exercitado:** Strings de import/chamada dispatchStartCall, payload channel/source e ausência de strings do legado em4 origens/hosts e provider.

**Fixtures e substituições:** Leitura de5 arquivos por fs e regex, sem montar a árvore ou disparar evento.

**Controles positivos:** Canais WhatsApp e VoIP explicitamente buscados; chamada real do símbolo exigida além do import.

**Limites e lacunas concretas:** Título ninguém mais emite no app só cobre a lista fixa de arquivos. Não prova consumidor único globalmente, payload em runtime, roteamento de canal ou acesso; remete a outros testes que precisam ser adjudicados separadamente.

Relacionados, sem nova contagem: R2-CALL-007, TEL-RUNTIME-001.

## 22. `src/components/onboarding/__tests__/WelcomeModal.a11y.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 53]]; total: 53 linhas; blob: `867c521d37200b83cd2a67c340a71d1ebe2eb352`.

**Contrato exercitado:** WelcomeModal aberto tem um role dialog com aria-modal/nome via título; fechado retorna null; axe configurado verifica apenas ausência de violações region.

**Fixtures e substituições:** Componente real em DOM de teste, callbacks no-op e usuário Ana; contraste axe explicitamente desativado.

**Controles positivos:** Um único dialog evita duplicação de landmark; título referenciado existe.

**Limites e lacunas concretas:** Filtro da assertion é apenas region. Não prova foco/trap/retorno/teclado, leitor de tela nem contraste/medidas reais. A auditoria não executou axe.

## 23. `src/components/settings/__tests__/KeyboardShortcutsSettings.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 45]]; total: 45 linhas; blob: `9570fb1301eebab065c078d171008cef011c910f`.

**Contrato exercitado:** Nomes/descrições dos7 atalhos de tarefas e globais preservados na tela de configurações.

**Fixtures e substituições:** Toast mockado; componente real; textos esperados enumerados.

**Controles positivos:** Ajuda de atalhos aparece duas vezes conforme catálogo e descrições específicas permanecem.

**Limites e lacunas concretas:** Não verifica divisão de chunk/budget initial-js, import carregado sob demanda, personalização ou execução dos atalhos. Texto presente não comprova ação.

Relacionados, sem nova contagem: D-AUTH-59.

## 24. `src/components/settings/__tests__/MediaLibraryAdmin.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 1825]]; total: 1825 linhas; blob: `4e6d4ee12143ec9de7b1f84d63420d27a023938f`.

**Contrato exercitado:** 1–625 monta MediaLibraryAdmin com infraestrutura falsa e verifica três abas, consulta stickers/limit1000/order/select*, estado vazio/null/erro, contagens/soma/favoritos/categorias, refresh e atributos de controles e linhas. 627–1825 verifica apenas constantes, funções e operações recriadas no arquivo de teste: filtros/seleção/estatísticas/URLs/MIME/progresso/mapeamentos/classificação/insert/revert/rename/preview/duração/prompt. Pode verificar essas fixtures, não os respectivos handlers de produção.

**Fixtures e substituições:** Supabase from/storage/functions/Auth substituídos por builders e spies; factories sticker/audio/emoji com URLs sintéticas. Escritas padrão devolvem error:null. A suíte Pure Logic tem mapas locais, getFn/getBucket/getField e extractStoragePath local (1419 declara a réplica). Reverts e limpeza são atribuições manuais, sem renderHook, promise rejeitada ou interação com handlers reais.

**Controles positivos:** No componente real montado, vazio/null não quebra render, top usados some sem dados, soma use_count10+5 aparece, refresh faz nova chamada à tabela. Fixturas locais incluem nulos, seleção parcial e vazia, categoria desconhecida, path alternativo, tamanho exato 10MiB, prompt vazio e demais limites; sua utilidade está restrita à lógica duplicada.

**Limites e lacunas concretas:** 214–220 exige catálogo vazio após erro retornado, sem verificar aviso/retry. Revisão produtiva da frente Inbox confirmou toast.error em useMediaLibrary109–116; não é prova de silêncio total. Assertions com títulos de acessibilidade, edge cases e performance frequentemente verificam apenas tag INPUT, footer ou título; loops não medem desempenho ou efeitos duplicados. Casos Pure Logic não falhariam se handlers produtivos divergissem: duração1090–1095 compara literais consigo mesmos; fallback743–745 é objeto criado no teste; rollback1498–1510/1595–1615 e erro de reclassificação1661–1691 são simulações locais. Não prova autorização/RLS, persistência, storage/upload/playback/IA reais, erro de mutação, concorrência ou recuperação de recursos.

**Adjudicação:** Leitura integral1–1825 concluída; nenhuma execução. Casos intitulados integração usam o mesmo mock Supabase. INB-051/053 são referências aos limites de janela/erros de reclassificação; não absorvem um novo achado de carga. Parent agrupará cópias de lógica na família de evidência de testes, sem ID Auth separado.

Relacionados, sem nova contagem: R2-INB-051, R2-INB-053.

## 25. `src/components/settings/__tests__/SLAConfigurationManager.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 131]]; total: 131 linhas; blob: `1f80efcb467cff843a9bcd78baa87b628a3bb2c7`.

**Contrato exercitado:** Lista/título, nomes/prioridades/default/tempos de2 configs, botão Novo abre diálogo e existem switches.

**Fixtures e substituições:** Supabase ignora nome de tabela e retorna2 fixtures fixas; toda escrita devolve sucesso; QueryClient/BrowserRouter reais.

**Controles positivos:** Config default distinta e formatação5/15min; abertura real do diálogo por click.

**Limites e lacunas concretas:** Nenhum submit/toggle/delete é acionado; não verifica payload, autorização, erro, exclusividade de default ou primeira resposta fixa por decisão. Fixtures chamadas from database são dados sintéticos.

Relacionados, sem nova contagem: D-AUTH-43.

## 26. `src/components/settings/__tests__/SLARulesManager.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 166]]; total: 166 linhas; blob: `c34d6211cefb2f31f75dde572fa76898f211af7f`.

**Contrato exercitado:** Seis abas, estados vazios, abertura/formulário/cancelar/criar e helper de formatação de minutos.

**Fixtures e substituições:** Todos encadeamentos Supabase resolvem dados vazios/sem erro; QueryClient/Router reais; toast spy.

**Controles positivos:** Troca de abas por click e descrição acessível presente; limites59/60/90/125min no helper.

**Limites e lacunas concretas:** Abas distintas recebem sempre mesmo vazio; não prova filtro SQL nem ausência de vazamento entre escopos. Não cria/edita/remove regra, não confirma payload/clamp/key/reset do formulário nem trata error.

Relacionados, sem nova contagem: D-AUTH-43.

## 27. `src/components/settings/__tests__/SettingsView.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 111]]; total: 111 linhas; blob: `d2be3e6bae44f0bb90261d455ec5702c5b54832d`.

**Contrato exercitado:** SettingsView real mantém os doze painéis staff fora do DOM de agente e presentes para admin/supervisor; verifica também barra de quatro abas pessoais e dois painéis pessoais.

**Fixtures e substituições:** Papel, userSettings e onboarding falsos; todos os painéis são stubs. TabsContent foi substituído para renderizar sempre, isolando o guard externo.

**Controles positivos:** Matriz negativa agente e positiva admin/supervisor detecta remoção do guard de composição mesmo quando uma aba está inativa.

**Limites e lacunas concretas:** Não prova navegação Radix, autorização backend/RLS, permissões internas dos painéis ou persistência. Os doze stubs não exercitam os controles operacionais relacionados.

Relacionados, sem nova contagem: R2-AUTH-045, R2-AUTH-046, R2-AUTH-047, R2-AUTH-048, R2-AUTH-049.

## 28. `src/components/settings/__tests__/ThemeCustomizer.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 99]]; total: 99 linhas; blob: `75e2f998eb0019e85b237e7b73bf562f93486694`.

**Contrato exercitado:** ThemeCustomizer real aplica presets/radius/dataset/storage, restaura corporate, renderiza radios e chama setTheme light.

**Fixtures e substituições:** ResizeObserver vazio, toast spy e useTheme falso; DOM/localStorage de teste reais.

**Controles positivos:** Transição GX→ocean verifica snap de radius e reset confirma valor persistido.

**Limites e lacunas concretas:** Teste Salvar64–69 exige somente toast.success; não induz falha de storage. Não cobre ThemeInitializer e storage null de SK-02, nem render visual/contraste ou mudança real de tema do sistema.

Relacionados, sem nova contagem: SK-02.

## 29. `src/components/settings/ai-providers/__tests__/AIProviderHealthPanel.sem-observacoes.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 101]]; total: 101 linhas; blob: `dac2e4b264396d24d42c6a581bbcc5735c6ac7a5`.

**Contrato exercitado:** Painel real distingue ausência de observações, taxa zero de erros, taxa 50% da amostra mista e p50 excluindo durações null.

**Fixtures e substituições:** React Query real isolado sem retry; builder Supabase ignora filtros e devolve logs sintéticos openrouter/ai-proxy, com variável de erro disponível.

**Controles positivos:** Amostra quatro com fallback no denominador e cinco durações com duas não medidas têm assertions de números e rótulos.

**Limites e lacunas concretas:** Nenhum caso atribui logsDaConsulta.erro. Todos function_name='ai-proxy' e mesmo provider; não testa completude de coleta/filtro/limite ou outros provedores. Consulta e observações de produção não executadas.

Relacionados, sem nova contagem: R2-API-043.

## 30. `src/components/settings/theme/__tests__/BorderRadiusControl.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 41]]; total: 41 linhas; blob: `9ea1dd7f9bbd76e6fa1ca9a043591cfe47303412`.

**Contrato exercitado:** BorderRadiusControl real apresenta cinco presets, callback20, indicação de ativo, aria-label do slider e valor em pixels.

**Fixtures e substituições:** ResizeObserver vazio, onChange spy, props escalares.

**Controles positivos:** Click no preset redondo exige argumento20; value0 corresponde à classe ativa.

**Limites e lacunas concretas:** Não interage com slider/teclado e não prova clamp, aplicação CSS ou persistência do consumidor.

## 31. `src/components/settings/theme/__tests__/PresetCard.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 45]]; total: 45 linhas; blob: `b8b7520169c9e4552e6d7b1cb2ed9ad9f436f2a6`.

**Contrato exercitado:** PresetCard real com preset importado usa radio/aria-checked/tabIndex, chama callback com id no clique e duas keydowns Enter/Space.

**Fixtures e substituições:** Preset gx-classic produtivo; callback spy, DOM simulado.

**Controles positivos:** Estados ativo/inativo verificados; identidade do preset do clique é exata.

**Limites e lacunas concretas:** fireEvent.keyDown não realiza ativação nativa completa ou navegação em radiogroup; não prova foco entre presets, persistência ou aparência. Duas keydowns intencionais produzem duas chamadas, sem cenário de default click do navegador.

## 32. `src/components/settings/theme/__tests__/presets.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 404]]; total: 404 linhas; blob: `c6db001a6d77593eadc9e18f0550080261b3ee6c`.

**Contrato exercitado:** Importa catálogo e funções produtivas:19presets, ids/ordem/cores/categorias, conjunto de tokens, radius clamp, cleanup/cache, import/export e normalização. Exercita sequências de persistência/reload/reset com DOM local. Calcula razões de contraste em oracle HSL→RGB local aplicado a duas duplas de tokens light/dark de cada preset, exigindo limiar3.

**Fixtures e substituições:** Sem mock das funções presets; DOM/localStorage do ambiente de teste. Expectativas de cores e ids fixadas no arquivo; funções auxiliares de contraste locais21–50.

**Controles positivos:** Rejeita JSON/preset/tipo radius inválidos, clamp negativo/excessivo/NaN, id desconhecido no-op e persistCache:false. Compara CSS_VARS sem duplicatas aos tokens corporate.

**Limites e lacunas concretas:** Contraste3 de duas duplas de tokens não atesta contraste de todos os elementos, transparências, estados, tamanhos de texto ou acessibilidade da aplicação. Oracle não tem fixtures de calibração no arquivo. Reload chama loadThemeConfig/applyThemePreset manualmente, sem montar ThemeInitializer; não cobre stored null/SK-02. Storage indisponível/corrompido parcialmente delegado a outro arquivo; remoção de classe transitioning não é aguardada/assertada.

Relacionados, sem nova contagem: SK-02.

## 33. `src/components/settings/theme/__tests__/theme-storage.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 81]]; total: 81 linhas; blob: `8bf2be2f3da9452eb46392fcfa66117d4d549f66`.

**Contrato exercitado:** load/save produtivos fazem round-trip v6, migração v5/ids antigos, clamp, default para versão/JSON inválidos, preservação de cache no merge e retorno false por quota.

**Fixtures e substituições:** localStorage do ambiente; um caso substitui Storage.prototype.setItem e restaura em finally.

**Controles positivos:** Falha concreta QuotaExceededError verifica retorno false; migração confirma v persistido6 e radius preservado.

**Limites e lacunas concretas:** Não monta consumidor ThemeCustomizer para conferir reação ao false, nem ThemeInitializer para null/SK-02. JSON literal null e getItem lançando não são injetados neste arquivo.

Relacionados, sem nova contagem: SK-02.

## 34. `src/components/settings/theme/__tests__/tokens-sync.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 55]]; total: 55 linhas; blob: `dfe4236f247b2c3d5bfb0e2d2a71349d02ec6119`.

**Contrato exercitado:** Lê tokens.css real e compara todas CSS_VARS_TO_APPLY produtivas ao corporate light/dark, com fallback root quando dark não define.

**Fixtures e substituições:** Parser textual local com profundidade de chaves/regex CSS; conjunto de divergências permitidas vazio.

**Controles positivos:** Sem exceções ativas, todas chaves do contrato são comparadas; resolve herança root no dark.

**Limites e lacunas concretas:** Não é parser CSS completo nem testa cascade/computedStyle ou tokens fora CSS_VARS_TO_APPLY; compatibilidade visual não estabelecida.

## 35. `src/hooks/__tests__/useAgents.presence.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 39]]; total: 39 linhas; blob: `51cc599da7ce61e56339fc13d89e5fee8089a283`.

**Contrato exercitado:** useAgents real prefere mapa de presença away para u2 e fallback offline com updated_at vazio para u1.

**Fixtures e substituições:** Duas profiles fixas e Supabase builder falso; useAgentPresenceMap devolve apenas u2:away; React Query isolado.

**Controles positivos:** Distingue identidade de usuário do perfil no resultado e cobre override versus ausência de mapa.

**Limites e lacunas concretas:** Não cobre atualização em realtime, heartbeat, TTL, profiles RLS, usuário ativo com updated_at recente nem correção de contagem de chats.

Relacionados, sem nova contagem: R2-AUTH-011, R2-AUTH-020.

## 36. `src/hooks/__tests__/useAgents.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 93]]; total: 93 linhas; blob: `ebaf901e4db69bc166d967af1e09c34076871349`.

**Contrato exercitado:** Dois casos montam useAgents real e verificam quantidade de profiles retornadas/resultado não vazio.

**Fixtures e substituições:** Duas profiles com estados ativos diferentes, queue/membro e dois contatos atribuídos a p1 devolvidos por Supabase falso; React Query real.

**Controles positivos:** Caso66–74 exige exatamente duas entradas após loading terminar.

**Limites e lacunas concretas:** 76–81 não chama hook/utilitário: única assertion80 é expect(true).toBe(true), explicitamente placeholder. Não prova status. 83–91 intitula contagens corretas, mas só verifica agents.length>0; não verifica contagem de chats, histórico/ativo, queues, RLS ou erros.

**Adjudicação:** Locus de placeholder encaminhado ao parent para família agregada de evidência de testes, sem achado Auth novo.

Relacionados, sem nova contagem: R2-AUTH-011, R2-AUTH-020.

## 37. `src/hooks/__tests__/useAuth.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 101]]; total: 101 linhas; blob: `6dbc3ea95b1f49bca1985c2093dc7dbe22f3a719`.

**Contrato exercitado:** AuthProvider real inicializa loading/user null; signIn delega serverLogin, aplica tokens por setSession, evita signInWithPassword e retorna sem erro; signOut chama Supabase.

**Fixtures e substituições:** Auth SDK, from/profile e serverLogin falsos; onAuthStateChange só devolve subscription sem emitir eventos. QueryClient estável por teste.

**Controles positivos:** Asserts argumentos de credenciais e tokens exatos, e ausência do caminho client password.

**Limites e lacunas concretas:** Não invoca callback SIGNED_OUT nem coloca entrada no cache para afirmar limpeza, apesar dos comentários37–51. signOut verifica só chamada do SDK. Não cobre falha setSession/serverLogin, obtenção/troca tardia de perfil, duas identidades/logout, inatividade/MFA ou validade real dos tokens.

Relacionados, sem nova contagem: R2-AUTH-003, R2-AUTH-004, R2-AUTH-005, R2-AUTH-021.

## 38. `src/hooks/__tests__/useCallHistory.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 79]]; total: 79 linhas; blob: `c07c73857a89e5aa7f7213ceeac80dc2799df64a`.

**Contrato exercitado:** useCallHistory real não consulta sem profile; constrói filtros de direction/channel/result e busca por IDs de contatos; busca sem contatos evita query paginada.

**Fixtures e substituições:** Builder único compartilhado por history/stats/contact lookup, com spies e respostas vazias/contato1; QueryClient criado dentro do wrapper.

**Controles positivos:** Vazio de busca exige calls=[] e range não chamado; sem perfil exige nenhuma chamada from.

**Limites e lacunas concretas:** Caso intitulado filtros em ambas queries verifica cada spy chamado ao menos uma vez no builder compartilhado; não distingue aplicação em history versus stats. Não prova RLS, totais, paginação ou comportamento de erro.

## 39. `src/hooks/__tests__/useCalls.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 165]]; total: 165 linhas; blob: `ffc26c1fd047576b7a79684e42f8a974723fbb25`.

**Contrato exercitado:** useCalls real retorna id/booleans em start/answer/end/miss e delega addCallNotes à RPC com id e notas exatos, inclusive texto vazio.

**Fixtures e substituições:** Auth usuário1, Supabase profile/calls/RPC, log e toast falsos; todas respostas bem-sucedidas.

**Controles positivos:** Asserts nome da RPC e corpo de notas; start sem contactId ainda retorna registro, conforme contrato legado.

**Limites e lacunas concretas:** Não confere payload/escopo das mutations de lifecycle, erros, contagem de linhas ou transporte. getContactCalls apenas Array.isArray. Leitura produtiva anterior estabeleceu uso atual de notas; lifecycle deste hook legado não foi estabelecido como caminho do discador ativo.

Relacionados, sem nova contagem: R2-AUTH-051.

## 40. `src/hooks/__tests__/useCalls.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 157]]; total: 157 linhas; blob: `297ec8445fd1fb68c9fa9940f5387f8d14dccfa4`.

**Contrato exercitado:** useCalls real inicia com estado vazio, retorna id de start e true em answer, delega notas à RPC e retorna false quando ela falha.

**Fixtures e substituições:** Supabase falso por tabela, profilep1/Authu1 e log/toast mock; auth nunca muda.

**Controles positivos:** 146–155 induz error da RPC e exige false, controle negativo concreto contra sucesso local nesse hook.

**Limites e lacunas concretas:** endCall110–118 só exige from('calls'), sem status/callId/duração persistidos. Não verifica tratamento do retorno false pelo consumidor/editor, concorrência/troca de chamada, RLS ou lifecycle real de telefonia.

Relacionados, sem nova contagem: R2-AUTH-051, R2-MOD-013.

## 41. `src/hooks/__tests__/useConnectionQueues.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 46]]; total: 46 linhas; blob: `991724aba32d88a40dce130a31e9aa531ced049e`.

**Contrato exercitado:** Hook real consulta whatsapp_connection_queues e expõe funções add/remove; estado inicial sem id é vazio.

**Fixtures e substituições:** Builder Supabase fixa uma associação conn1/q1; todas mutations mock sucesso.

**Controles positivos:** Tabela consultada é assertada após loading.

**Limites e lacunas concretas:** Não confere eq do connectionId ou resultado da associação; teste 'does not fetch' não verifica from não chamado. add/remove apenas typeof function, sem execução/erro/RLS. Não testa mudança de conexão e resposta tardia.

## 42. `src/hooks/__tests__/useGlobalSearchShortcut.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 53]]; total: 53 linhas; blob: `f3313a1aa68bbe9799ed409c8476b586cf3a62d3`.

**Contrato exercitado:** Hook real abre uma vez em Ctrl+K/Cmd+K, não abre em K simples/Ctrl+A e remove listener ao desmontar.

**Fixtures e substituições:** Callbacks spies e KeyboardEvent enviado diretamente ao document; removeEventListener spy restaurado.

**Controles positivos:** Dois controles negativos de combinações e cleanup explícito.

**Limites e lacunas concretas:** Não verifica preventDefault ou alvos editáveis, callback atualizado, duplicação com outros shortcuts montados, remapeamento ou comportamento do navegador.

## 43. `src/hooks/__tests__/useIncomingCallListener.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 416]]; total: 416 linhas; blob: `11fbf042011208729b748929a6697816cc45d340`.

**Contrato exercitado:** Listener real assina INSERT scoped ao usuário, mapeia metadados, distingue callId da notificationId, deduplica por linha/evento/callId, filtra tipos/status e consulta status antes de publicar alerta. Promises controladas testam lookup legado antigo não sobrescrevendo chamada nova e completion após cleanup; terminais no momento da consulta são ignorados e erro de consulta permanece fail-open explicitamente.

**Fixtures e substituições:** Auth fixo user1/profile1; callbacks de canal Supabase capturados e disparados manualmente. Builders falsos para contacts/calls, promises deferred e logger spy.

**Controles positivos:** 243–278 exercita duas entregas fora de ordem;280–300 impede commit após unmount;350–366 verifica consulta exata por call42; replay e duas chamadas legítimas separados.

**Limites e lacunas concretas:** Não monta IncomingCallAlert ou CallSessionProvider; não simula chamada viva que termina depois de publicar alerta, tela fechada/reaberta, ação WhatsApp/SIP ou mudança de usuário. Controles de consulta inicial não eliminam CALL006–008. Cleanup verifica removeChannel chamado, sem confirmação de transporte real; não há tempo/TTL de dedupe ou realtime real.

Relacionados, sem nova contagem: R2-CALL-006, R2-CALL-007, R2-CALL-008.

## 44. `src/hooks/__tests__/usePermissions.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 160]]; total: 160 linhas; blob: `2e3e9dba4aac8e8dacbb2c1e7a2ef2e3c06b0190`.

**Contrato exercitado:** usePermissions real produz vazio/nega sem usuário, carrega lista e calcula hasPermission/Any/All com permissões positivas e negativas das fixtures.

**Fixtures e substituições:** Auth fixo por caso e builder Supabase permissivo por tabela; agent também recebe role_permissions pelo mock, sem RLS.

**Controles positivos:** Nomes inexistentes negados e Any/All recebem listas mistas; caso deslogado retorna [].

**Limites e lacunas concretas:** Não monta troca de usuário/logout com pedidos pendentes, cache/refresh ou erro de leitura. Não executa grant/revoke e não cobre role_permissions SELECT restrito ao staff; fixture agent com permissão é premissa falsa para provar acesso direto ao banco vigente.

Relacionados, sem nova contagem: R2-AUTH-009, R2-AUTH-011.

## 45. `src/hooks/__tests__/useReauthentication.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 195]]; total: 195 linhas; blob: `69560cfc208e9f91a37ab99324b4cb06562c4686`.

**Contrato exercitado:** Hook real obtém email, reautentica via serverLogin/setSession, diferencia senha incorreta de indisponibilidade, recusa usuário ausente e gerencia pendingAction/dialog/cancelamento. confirmReauth chama callback após resposta bem-sucedida e limpa dialog/ação; rótulos de cinco ações verificados.

**Fixtures e substituições:** GetUser/setSession/serverLogin e toast mocks; tokens sintéticos e callback spy resolvido.

**Controles positivos:** Erro auth-edge503 tem mensagem própria, distinta de credenciais, quando serverLogin devolve unavailable:true.

**Limites e lacunas concretas:** Não prova que endpoint upstream preserve503 (AUTH021), nem autorização/AAL da ação protegida. Não injeta erro setSession, callback rejeitado, requisições concorrentes/cancelamento durante await ou mudança de identidade. Labels não demonstram consumidores operacionais para cada ação.

Relacionados, sem nova contagem: R2-AUTH-003, R2-AUTH-021.

## 46. `src/hooks/__tests__/useSipClient.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 1054]]; total: 1054 linhas; blob: `a0dcb54e8eb039045f615c4f78f1d7df115fc312`.

**Contrato exercitado:** Hook SIP real atravessa engine/adapters até RPC mock: estados/register/disconnect, provisionamento host/user/porta, guard de registro, identidade e lifecycle ringing→answered→ended, cancelamento de INVITE pendente, motivos locais/remotos/486/falha, timer, fila de persistência, retentativa e watchdog. Testa entrada SIP, rejeição ocupada com id separado, microfone bloqueado/ausente/ocupado, devolução de tracks da sondagem e transições leader/follower simuladas.

**Fixtures e substituições:** Todas classes SIP.js são doublês, callbacks de estado disparados manualmente; UA/start/stop/register/invite/media sem rede. Supabase Edge/RPC/consultas, toast e tabLeaderStore falsos. Fake timers em casos de duração/watchdog; promises controladas em INVITE e duas primeiras RPCs. Helper escoar aguarda número fixo de microtarefas. Números/credenciais são fixtures sintéticas.

**Controles positivos:** 362–377 distingue UA existente não registrado de UA nulo;463–474 cancela enquanto invite não resolve. 693–719 verifica três upserts mesmo sessionId;734–747 força três erros e toast;828–858 prova que answered/ended não ultrapassam ringing pendente. 542–615 cobre timer congelado, repeated Established sem intervalo duplicado, segunda chamada resetada e zero timers após término;873–918 inclui negativa de microfone tanto em discar como atender. 1018–1052 fecha ponte evento do adapter→última RPC para busy/failure, sem depender somente do classificador puro.

**Limites e lacunas concretas:** Não há servidor SIP, áudio real, credenciais reais, RLS ou banco; eleição real delegada ao teste de tabLeaderStore. Não testa login/logout/troca de usuário ou fluxo WhatsApp→SIP no overlay. 535–540 'clean up interval on unmount' não cria chamada/timer e não contém assertion; controles de timer601–615 são de término de chamada, não de unmount ativo. 380–388 intitula registro antes de invite resolver, mas await discar usa invite já resolvido.722–731 diz mesmas três gravações, porém só emite até Established e compara duas; ciclo completo existe separadamente693–719. Mocks de listeners acumulam funções e evento chama todas; não modela transporte nem isolamento multissessão real. Não adjudica CALL006–008 nem remoção de UA no logout.

Relacionados, sem nova contagem: R2-CALL-001, R2-CALL-002, R2-CALL-006, R2-CALL-007, R2-CALL-008.

## 47. `src/hooks/__tests__/useUserSettings.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 135]]; total: 135 linhas; blob: `3529d7805736ae219875b43667bb522114eb269f`.

**Contrato exercitado:** useUserSettings real lê duas propriedades da fixture, usa defaults sem usuário e após promise rejeitada, e expõe updateSettings.

**Fixtures e substituições:** Auth falso por caso, builder maybeSingle/upsert falso e fixture ampla de horários/mensagens/automações/tema/TTS.

**Controles positivos:** Exceção de DB não prende loading; defaults de dias, idioma, quiet hours, speed e método de atribuição são comparados.

**Limites e lacunas concretas:** Nenhum teste chama updateSettings/saveSettings/toggleWorkDay ou confere upsert, campos enviados, erro retornado e usuário trocado. Defaults após erro não provam que ajustes salvos têm executor operacional, nem sincronização user_settings→global_settings.

Relacionados, sem nova contagem: R2-AUTH-049.

## 48. `src/hooks/__tests__/useWebAuthn.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 196]]; total: 196 linhas; blob: `5470096867150636c2386fd8ff14b3d393559454`.

**Contrato exercitado:** Hook real nega operações sem usuário ou sem PublicKeyCredential; fetch vazio sem usuário evita DB, fetch autenticado expõe fixture; rename/delete retornam success no mock.

**Fixtures e substituições:** Supabase/from/invoke e Auth mocks; ambiente assume PublicKeyCredential ausente. Nenhuma credencial browser é criada/obtida e nenhum desafio criptográfico é fornecido.

**Controles positivos:** Fetch sem usuário exige nenhuma consulta, lista exata da fixture é conferida no caso autenticado.

**Limites e lacunas concretas:** Registro/autenticação só percorrem early return por suporte ausente/sem usuário. Não chama verifier Edge, não prova challenge/signature/origin/RP/UV/expiry nem estabelecimento de sessão. Título 'delete ... correct params'100–123 verifica apenas success, não id/user/table do delete; rename137–160 idem para payload/nome. Nenhuma recusa RLS/zero linhas/erro de mutação.

Relacionados, sem nova contagem: R2-AUTH-001, R2-AUTH-002.

## 49. `src/hooks/auth/__tests__/useAuthForm.email.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 119]]; total: 119 linhas; blob: `f6bea07e70b0a83ded5fd2d6ae4631dc18306c5b`.

**Contrato exercitado:** Hook useAuthForm real em formulário mínimo escolhe email do estado quando DOM diverge e usa DOM como fallback quando estado está vazio; controlo sem divergência envia valores digitados.

**Fixtures e substituições:** Auth signIn spy sucesso, WebAuthn indisponível, navigate/loginAttempts/toast/Supabase falsos. Setter nativo de input injeta valor sem onChange.

**Controles positivos:** A/B84–102 assegura DOM=B e signIn(A), com negativa explícita para B; caso105–117 preserva autofill no estado vazio.

**Limites e lacunas concretas:** Simula divergência DOM/React, não realiza autofill do browser, tela Auth completa ou requisição auth-login. Comentário sobre medição histórica não é revalidado por este teste lido.

## 50. `src/hooks/auth/__tests__/useAuthForm.senha.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 113]]; total: 113 linhas; blob: `4d77ac5c995089c65848b4e84845d339b6f04e5e`.

**Contrato exercitado:** Hook real limpa password DOM não controlado após recusa; segundo submit sem redigitar não faz nova requisição; primeiro submit aceita senha injetada por setter DOM.

**Fixtures e substituições:** Formulário mínimo com email controlado/password não controlado, signIn sempre Invalid login credentials e demais integrações mock.

**Controles positivos:** A/B83–99 confere contagem permanece uma e a senha recusada só aparece em uma chamada; controle102–111 preserva autofill inicial.

**Limites e lacunas concretas:** Não cobre motivo lock/outage, sucesso de sessão, submit concorrente ou preenchimento pelo navegador real. Campo é equivalente mínimo, sem PasswordInput e página Auth montados.

## 51. `src/hooks/calls/__tests__/linhaDoCanal.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 90]]; total: 90 linhas; blob: `00cc1e6ce52b3167b82cf3e5115bbc657eb51e86`.

**Contrato exercitado:** Funções produtivas selecionam linha da conversa antes de default, tratam id ausente/E2E/vazio e rótulos D8; capacidade receive respeita conexão selecionada/role.

**Fixtures e substituições:** Fixtures de conexão conectada/desconectada/default/E2E e argumentos de papel; funções reais importadas.

**Controles positivos:** Linha da conversa desconectada não herda receive da default conectada; D8 oculta nome mesmo se dado da linha for fornecido.

**Limites e lacunas concretas:** Não monta hook/consulta RLS nem inicia chamada. Fallback de id não resolvido para default é regra explícita verificada, não tratado como defeito. CanReceive não prova roteamento correto da ação no overlay.

Relacionados, sem nova contagem: R2-CALL-007.

## 52. `src/hooks/calls/__tests__/useCallChannels.d8.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 58]]; total: 58 linhas; blob: `d11afa262feb4965a43ee3d4cb2cff692e79d0e8`.

**Contrato exercitado:** Mapper puro distingue agente sem linha visível (restrito supervisores) de staff sem linha (unavailable), preserva comportamento sem campo e rótulo D8.

**Fixtures e substituições:** Nenhuma consulta: capacidadesPorCanal/describeReason produtivos recebem objetos com role/linha fornecidos pelo teste.

**Controles positivos:** Confere canDial/canReceive false sem linha e capacidade receive com linha conectada mesmo podeVerWhatsApp:false, regra explícita48–56.

**Limites e lacunas concretas:** Título 'sob RLS' não executa RLS; visibilidade é premissa de fixture. Não prova permissão efetiva de receber/controlar chamada, nem ação correspondente do overlay.

Relacionados, sem nova contagem: R2-CALL-007.

## 53. `src/hooks/calls/__tests__/useCallChannels.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 226]]; total: 226 linhas; blob: `b2afe1f0b59b7a0c613d026ffe17fdf6e33dce8b`.

**Contrato exercitado:** Mapper real calcula capacidades VoIP conforme registro/microfone/motivo e WhatsApp conforme conexão/default/E2E; filtro de prefixo E2E e canRecord=false são verificados.

**Fixtures e substituições:** Supabase e CallSessionProvider cortam grafo; funções puras reais recebem fixtures de conexão/status.

**Controles positivos:** Mic unknown também bloqueia discar; sem linha registrada não permite recusar; status de conexão escolhido altera receive. Lista E2E+default real mantém só a válida.

**Limites e lacunas concretas:** Não monta useCallChannels ou provider; sem RLS/provisionamento/ação. Título217 diz WhatsApp indisponível mas assertions223–224 exigem receive true e no_outbound por existir outra linha real conectada; avaliar pelo corpo, não pelo título.

Relacionados, sem nova contagem: R2-CALL-007.

## 54. `src/hooks/calls/__tests__/useCallsKpi.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 66]]; total: 66 linhas; blob: `19cf9a94bbb19b781153f0652242362d53e0e6ee`.

**Contrato exercitado:** periodoParaIntervalo real converte hoje/ontem/7d/30d/mês/mês passado/fallback a limites locais; KPI_ZERADO tem seis campos zero.

**Fixtures e substituições:** Instante AGORA fixo com offset-03; expectativas construídas em timezone local do processo.

**Controles positivos:** Mês passado cobre setembro inteiro e janelas incluem hoje; ontem compara largura de dia local.

**Limites e lacunas concretas:** Não monta useCallsKpi nem confere RPC/normalização all/agente/status de erro. Comentário de portabilidade a qualquer fuso não é demonstrado: AGORA é instante fixo enquanto datas esperadas são outubro2 local; em fusos que mudam seu dia local há diferença. Nenhuma matriz TZ foi executada.

## 55. `src/hooks/crm/__tests__/useAgentsLite.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 77]]; total: 77 linhas; blob: `3ca6ffe162dfc417cf817d225b0c2cd9e69f75cb`.

**Contrato exercitado:** useAgentsLite real devolve Map vazio inicial, indexa profiles por id e mantém vazio quando React Query chegou de fato ao status error.

**Fixtures e substituições:** Builder profiles permissivo devolve dois perfis; QueryClient isolado/limpo e componente desmontado após cada caso.

**Controles positivos:** 65–75 aguarda estado de erro, distinguindo-o de loading; mapeamento exige objetos de ambos IDs e undefined para desconhecido.

**Limites e lacunas concretas:** Não testa RLS de perfil comum vendo só a si, usuário/cache trocados, refresh realtime ou feedback no consumidor quando Map fica vazio.

Relacionados, sem nova contagem: R2-AUTH-011.

## 56. `src/hooks/gmail/__tests__/gmailApi.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 34]]; total: 34 linhas; blob: `8d3c03d554d36eb431c01f3f65f589c152e64a35`.

**Contrato exercitado:** Wrapper Gmail real preserva status403 e classifica recusa conclusiva, classifica falha fetch como resultado desconhecido e evita invoke sem sessão.

**Fixtures e substituições:** Auth getSession e functions.invoke spies; erros FunctionsHttpError/FetchError sintéticos.

**Controles positivos:** 29–32 exige rejeição e zero invoke sem sessão;403 explicitamente outcomeUnknown:false contra transporte true.

**Limites e lacunas concretas:** Não verifica headers/corpo ou respostas de sucesso/erro no data, renovação de sessão, backend Gmail/OAuth e UI de retry. Não envia email.

## 57. `src/hooks/sip/__tests__/useSipConnection.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 252]]; total: 252 linhas; blob: `a6f9188def517df6627c210a16dd04827a2fa0fd`.

**Contrato exercitado:** useSipConnection real instala delegate, diferencia REGISTER403 de500, evita novo UA ao conectar novamente, cancela retries no disconnect/unmount, limita seis falhas e consulta liderança viva no gate.

**Fixtures e substituições:** UA/Registerer SIP.js fake, callbacks de transporte/estado e options capturados; tabLeaderStore isLeader mutável, fake timers e toast spies.

**Controles positivos:** 137–155 desconecta no backoff e espera sem UA novo;172–189 desmonta com retry pendente;192–212 força seis falhas;234–250 follower→leader permite mesmo connect após mudança de papel.

**Limites e lacunas concretas:** Não verifica UA.stop/unregister no unmount, novas credenciais ou segunda conexão após disconnect explícito, duas connect concorrentes antes de await e reconexão iniciada que termina após cleanup. Contagens após timer não são validação do transporte real. REGISTER403 como linha em uso é contrato do código/fixture, sem provar resposta de provedor. Auth/logout não participam deste harness.

**Adjudicação:** Relacionado à área Calls do root: controles parciais de backoff não afastam as corridas de conexão revisadas na produção.

Relacionados, sem nova contagem: R2-CALL-004, R2-CALL-005.

## 58. `src/lib/__tests__/emailCompanyLinks.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 27]]; total: 27 linhas; blob: `298bab83098de1dd08c2946efb4f9f62ce6c22e3`.

**Contrato exercitado:** Helpers reais normalizam domínio nu para HTTPS, recusam esquemas executáveis/credenciais/host social enganoso e só mantêm URLs de plataformas conhecidas.

**Fixtures e substituições:** Strings sintéticas e array de objetos, sem mock de funções produtivas ou acesso à rede.

**Controles positivos:** Linkedin.com.evil é negativo pareado a www.linkedin.com; handles sem URL e plataforma facebook excluídos.

**Limites e lacunas concretas:** Não testa redirects/DNS, URLs completas em consumidores, renderização de links ou autorização dos dados da empresa. Não implica varredura de destinos externos.

## 59. `src/lib/__tests__/formatBirthday.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 49]]; total: 49 linhas; blob: `8beec7addcfb9e840077842fe01b4aaa54ed8055`.

**Contrato exercitado:** Formatter real calcula idade antes/no/depois do aniversário, regra local de29/02, rejeita datas impossíveis/ausentes e conserva label futura sem idade.

**Fixtures e substituições:** NOW construído em data local e datas ISO fixas; função produtiva importada diretamente.

**Controles positivos:** Casos29/02 e datas normalizáveis indevidas (30/02, mês13, ano0085) são asserts de comportamento concreto.

**Limites e lacunas concretas:** Não exercita parsing de servidor/consumidor UI e não faz matriz de timezone ou formatos fora do contrato ISO esperado.

## 60. `src/lib/calls/__tests__/WhatsAppCallAdapter.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 160]]; total: 160 linhas; blob: `8543c3cc55a088748a6fc04901cd8ba43588bc4e`.

**Contrato exercitado:** Adapter WhatsApp real recusa dial via NotSupported, envia payload inbound/answered ou declined por porta injetada, abre contato no aceite e propaga resultado de persistência falha.

**Fixtures e substituições:** Portas persistir/abrirConversa spies, fixture callId/contato/telefone, sem banco/DOM. Classe real importada.

**Controles positivos:** 73–94 confere channel explícito/id/contactId/phone/answeredAt válido e ausência de answeredBy; reject não marca atendimento nem abre contato;111–121 preserva ok:false.

**Limites e lacunas concretas:** Não monta consumidor IncomingCallAlert/CallSessionProvider, portanto existência de adapter correto não prova que botões o chamem (CALL007). RPC/answered_by e operação no aparelho são comentários/contratos externos, não executados. 148–158 afirma ausência de rede por desenho das portas e contagem local, mas não intercepta fetch ou qualquer cliente global; a ausência de endpoint depende também da leitura do adapter.

Relacionados, sem nova contagem: R2-CALL-007.

## 61. `src/lib/calls/__tests__/callStatus.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 349]]; total: 349 linhas; blob: `1fe1a05f5067e455135c68fe491dcfba6dc4e547`.

**Contrato exercitado:** Funções reais normalizam status/direction legados e inválidos, mapeiam dez resultados e oito códigos SIP, reconhecem terminais, rótulos e tons.

**Fixtures e substituições:** Tabela de cenários com answered_at/ended_at fixos e chamadas puras.283–318 cria Record/objetos locais tipados para ilustrar EndedBy/CallEndOutcome.

**Controles positivos:** Status atrasado answered/ringing com ended_at segue desfecho, direção ausente tem fallback, valores de tipos errados e códigos desconhecidos são tratados explicitamente.

**Limites e lacunas concretas:** Não testa emissão/ordenação dos eventos nem persistência/RLS ou qual chamada recebe terminal (CALL001/008).283–318 demonstra shape local, não origem real do desfecho; alegação de exaustividade depende de typecheck, que não foi executado nesta revisão.

Relacionados, sem nova contagem: R2-CALL-001, R2-CALL-008.

## 62. `src/lib/calls/__tests__/capabilities.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 88]]; total: 88 linhas; blob: `a68020a709c63d0a5937fd02a8fac91d94dab79e`.

**Contrato exercitado:** describeReason/REASON_LABEL reais cobrem motivos obrigatórios, null/undefined/desconhecido e vocabulário sem termos técnicos listados.

**Fixtures e substituições:** Strings esperadas e objetos tipados ChannelCapability definidos no próprio teste; sem rede/mocks de implementação.

**Controles positivos:** 43–45 rejeita motivo desconhecido; todas chaves do mapa têm rótulo não vazio.

**Limites e lacunas concretas:** 48–88 cria manualmente capacidades e verifica os próprios campos/rótulos: não calcula capacidades nem testa canais disponíveis. Objeto 'voip indisponível' inclui canReceive:true por fixture, sem consequência produtiva. Fonte do mapper é testada separadamente no roster53.

**Adjudicação:** Exemplos de shape tipado não equivalem a teste de regra de disponibilidade; sem novo ID por si só.

## 63. `src/lib/calls/__tests__/duration.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 145]]; total: 145 linhas; blob: `4cb91ea6d1a996dcb1b79c9c5b8c7ec8e7847628`.

**Contrato exercitado:** Helpers reais preferem talk_seconds inclusive zero, usam timestamps como fallback, recusam intervalo negativo e parse inválido, formatam minutos/horas e ausência de duração.

**Fixtures e substituições:** Números, strings ISO, Date e epoch sintéticos; funções de produção sem mocks.

**Controles positivos:** talk_seconds0 não é substituído por258 dos timestamps; NaN/Infinity e formatos inválidos têm asserts.

**Limites e lacunas concretas:** Não prova momento em que snapshots de duração são capturados/persistidos; CALL002 nasce antes desse formatter, em leitura tardia do relógio na fila. UI e tempo real não executados.

Relacionados, sem nova contagem: R2-CALL-002.

## 64. `src/lib/calls/__tests__/events.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 263]]; total: 263 linhas; blob: `ece57efea4f7648113d3d18a03040e69054fff6e`.

**Contrato exercitado:** Dispatch/listener produtivos fazem round-trip document do evento novo e window do legado, preservam payload e autoDial, validam formato, entregam múltiplos listeners e fazem cleanup idempotente e independente.

**Fixtures e substituições:** DOM CustomEvent real do ambiente de teste; console.warn spy e payloads fixos, sem provider/SIP.

**Controles positivos:** Payload inválido gera quatro avisos e nenhuma entrega; nomes de evento semelhantes são ignorados. Após cleanup nenhuma nova entrega e outra assinatura continua ativa.

**Limites e lacunas concretas:** Não verifica consumidor onStartCall montado, navegação real ou qual canal/sessão recebe ação; não normaliza telefone por design. Comentário134 sobre emissor legado não comprova que ContactActionButtons ainda emita esse evento; roster21 verifica fontes atuais separadamente.

Relacionados, sem nova contagem: R2-CALL-007.

## 65. `src/lib/calls/__tests__/persistence.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 379]]; total: 379 linhas; blob: `d21ddc395f5da6757a769cb627dff3870ae77851`.

**Contrato exercitado:** Persistência produtiva mapeia input para p_* explícitos, omite nulls, tenta até3 vezes com mesmo id, retorna erro final inclusive rejeição, calcula desfechos e serializa fila sem travar após falha.

**Fixtures e substituições:** Somente Supabase.rpc mock; funções produtivas importadas. Respostas sequenciais/deferred controlam ordem e erro; crypto substituído para fallbacks e restaurado.

**Controles positivos:** Contrato de payload é igualdade exata37–85; retry mantém identidade e para no primeiro sucesso.337–362 mantém segunda/terceira pendentes até primeira concluir;364–378 prova que erro não bloqueia próximo trabalho. Fallback sem randomUUID e sem crypto conserva formato UUIDv4, e três IDs gerados distintos; outcomes incluem CANCEL com200, failure durante/antes e ausência legada.

**Limites e lacunas concretas:** Não executa nem lê assinatura da migration no teste: nomes p_* são constantes esperadas, não contrato automaticamente reconciliado com SQL. Não prova idempotência/RLS/upsert do servidor. Título290 'id SEMPRE uuid' limita-se à geração sem sessionId;135–138 intencionalmente aceita sessionId literal fornecido. Não é validador de entrada externa. Fila recebe payload já construído neste teste; não cobre leitura tardia de relógio/estado dentro do consumidor que gera CALL002.

Relacionados, sem nova contagem: R2-CALL-002.

## 66. `src/lib/calls/__tests__/phone.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 206]]; total: 206 linhas; blob: `82fce9dbe93f24afce0f2769b5a50e2f883b054c`.

**Contrato exercitado:** Helpers de telefone reais normalizam dez grafias BR, preservam fixos e DDD55, formatam, comparam E164 com DDD, produzem sete variantes e só vinculam match único.

**Fixtures e substituições:** Strings e arrays sintéticos, imports reais inclusive identidade de reexports legados.

**Controles positivos:** Suffix de8/DDD distinto/fixo versus celular são negativos; dois contatos equivalentes resultam null; inputs inválidos não geram variantes.

**Limites e lacunas concretas:** Não consulta banco/RLS nem prova cobertura de formatos internacionais ou completude do conjunto de candidatos retornados por limite. Comentário153–154 sobre44% do banco é alegação histórica, não medição deste teste.

## 67. `src/lib/calls/__tests__/session.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 561]]; total: 561 linhas; blob: `96f8b01739a316a5148a0833514d9f46b14a1a34`.

**Contrato exercitado:** Reducer/estado e mappers reais percorrem tabela de transições válidas e inválidas, invariantes de sessionId/answeredAt/reset, busyHere e motivos/status persistidos. Fixtures de estado são replay de eventos reais, exceto ending explicitamente hidratado. Conecta estado encerrado ao toResult real para manter completed na apresentação; garante identidade do reexport sipCodeToEndReason.

**Fixtures e substituições:** Clock fornecido por at fixo; console.warn spy, sem transporte/provider. Tabelas de eventos/expectativas locais exercitam reduce importado.

**Controles positivos:** Transições inválidas mantêm mesma referência e um warn com status/event/sessionId; tentativa DIAL com id novo não troca sessão. INVALIDAS161 + assertions245–259 confirma ringing_in/HANGUP_REMOTE inválido. CANCEL_REMOTE/TIMEOUT corretos encerram ringing_in e answeredAt só nasce em ESTABLISHED.

**Limites e lacunas concretas:** Não vincula o produtor realtime de HANGUP_REMOTE ao reducer nem verifica id de evento tardio, cuja ausência é relevante a CALL001/008. 'Todas transições do plano' usa tabela manual, sem extrair plano formal ou explorar interleavings. Lista EndReason[]521 não força exaustividade futura de união pelo tipo; assertions cobrem os onze valores enumerados, não geram automaticamente um caso para novo valor. UI/SIP/SQL não executados.

Relacionados, sem nova contagem: R2-CALL-001, R2-CALL-008.

## 68. `src/lib/calls/__tests__/tabLeaderStore.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 316]]; total: 316 linhas; blob: `f66e1673ec2cfaaf8b4458366f3cda6d1913cb86`.

**Contrato exercitado:** Store produtivo reimportado por aba simula eleição inicial, follower com lock vivo, expiração/heartbeat/release, dois claims no boot, fallback sem canal, subscription e identidade de snapshot. 239–283 interrompe o intervalo da líder e prova que follower assume após TTL;286–314 verifica uso de crypto no jitter e fallback do id sem crypto.

**Fixtures e substituições:** FakeBroadcastChannel importado, localStorage do ambiente, fake timers com tempo fixo; resetModules cria instâncias do singleton. Spy captura IDs dos intervalos para parar só a líder.

**Controles positivos:** Líder parada deixa de renovar lock antes do takeover; follower só assume após expiração. Boot simultâneo exige exatamente uma líder e leaderId coerente.

**Limites e lacunas concretas:** Não retoma o heartbeat da líder antiga após takeover: parar permanentemente seu intervalo239–283 simula morte, não suspensão/retorno, portanto CALL003 permanece não coberto. Mocks não reproduzem escalonamento/entrega de eventos entre processos de browser ou storage desabilitado. Caso sem crypto só importa módulo e lê id, sem tentar claim/jitter.

Relacionados, sem nova contagem: R2-CALL-003.

## 69. `src/lib/calls/__tests__/terminoRemoto.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 36]]; total: 36 linhas; blob: `e1b30e7d1beac24ba4ed77bc3836cdd8a1e04916`.

**Contrato exercitado:** Helper real retorna HANGUP_REMOTE apenas para linha terminal cujo id iguala o argumento EM_CURSO; rejeita status ativo/desconhecido e ids divergentes/ausentes.

**Fixtures e substituições:** Objetos de linha e id passados diretamente, sem React/provider/realtime.

**Controles positivos:** 21–23 isola id alheio e25–28 ausência de linha/sessão.

**Limites e lacunas concretas:** Assume que segundo argumento já é a sessão global correta. Não testa hook que passa id observado nem se HANGUP_REMOTE é evento válido em ringing; CALL008 permanece fora dessa ponte.

Relacionados, sem nova contagem: R2-CALL-008.

## 70. `src/lib/calls/__tests__/toqueDaChamada.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 57]]; total: 57 linhas; blob: `ed6cc769b1a69e54006f245a56a5128eafdfe206`.

**Contrato exercitado:** FSM de toque real inicia com convite, para em quatro eventos e pode iniciar novamente depois de parada.

**Fixtures e substituições:** Estados/eventos escalares, constantes e funções produtivas puras.

**Controles positivos:** Quatro eventos de parada iterados e novo convite após todos volta a tocar.

**Limites e lacunas concretas:** Não reproduz AudioContext, emissão do TIMEOUT/HANGUP pela UI ou identidade da chamada; provar transição pura não garante entrega do evento nem limpeza do overlay.

Relacionados, sem nova contagem: R2-CALL-006, R2-CALL-008.

## 71. `src/lib/calls/adapters/__tests__/CallEngine.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 685]]; total: 685 linhas; blob: `f47027b77e680cc87d65be4c716c5ae4a241d330`.

**Contrato exercitado:** Engine e grande parte SipCallAdapter reais exercitam mute pela propriedade enabled lida, DTMF Established, ordem createInviter/create/invite, Call-ID, delegate onReject e outcomes local/remoto/reject/failure. Cobre remoção de elemento áudio no dispose, watchdog/finalização idempotente antes de nova chamada, cancelamento do watchdog em Established, onFinished antes status ended e rejeição486 de segundo convite sem alterar sessão.

**Fixtures e substituições:** TestAdapter sobrescreve host/dialable/createInviter/invite; sessões/UA/sink falsos. fakeAudioTrack20–21 é objeto simples tipado como MediaStreamTrack, não track capturada real. Sink.create retorna imediatamente call-1 por padrão, microtarefas contadas e fake timers em watchdog. MediaStream substituído para DOM de áudio.

**Controles positivos:** Track com setter que recusa escrita224–241 impede exibir mudo sem efeito; vídeo permanece intocado; DTMF fora de Established não chama insertDTMF. 176–201 verifica ordem e IDs;566–582 impede reemissão terminal logo após watchdog,588–604 prova chamada longa atendida sem timeout;651–683 protege sessão ocupada.

**Limites e lacunas concretas:** Não é áudio/microfone/DTMF de rede real; comentário 'track de verdade'8–9 excede fixture objeto simples. 450–475 verifica flags limpas sequencialmente, mas não injeta evento da sessão velha depois que B começa.566–582 só envia Terminated tardio antes de criar B; CALL001 não coberto. 495–517 aceita expect.any(Number) com create imediatamente resolvido; não mede duração após persistência lenta (CALL002). Sem Auth/autorizações ou transporte SIP.

Relacionados, sem nova contagem: R2-CALL-001, R2-CALL-002.

## 72. `src/providers/__tests__/CallSessionProvider.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 690]]; total: 690 linhas; blob: `c01f65d934919a00e6879d84b0283fab5069f394`.

**Contrato exercitado:** Provider real integra reducer e useNavigationHistory/MemoryRouter: discar navega mantendo sessão, oferece campos legados, adota id compartilhado com SIP, converte status/outcome a eventos e evita transição terminal duplicada. Monta sem Router como AppProviders, protege DIAL por microfone, aceita segunda entrada após terminal e reconstrói fim presumido quando outcome real chega, preservando id/answeredAt. TTL de ringing_in encerra por timeout, aceite o cancela e unmount cancela exatamente o timer criado.

**Fixtures e substituições:** useSipClient inteiro substituído por snapshot h.value mutável e callbacks spies; onEnd capturado manualmente. Sonda mínima exibe contexto, sem overlay, PostCallSummary ou transporte real.

**Controles positivos:** 235–246 cobre ausência de Router;297–321 compara ID DIAL→SIP;329–341 garante que microfone negado não gera sessão. 547–605 injeta status ended antes do outcome fino, exigindo correção sem perda de identidade;668–685 verifica timer específico e contagem zero após unmount.

**Limites e lacunas concretas:** Término observado aqui vem do status/callback SIP falso, não do hook useTerminoRemoto; correto CANCEL_REMOTE255–267 não cobre HANGUP_REMOTE incorreto do outro produtor (CALL008). Não monta listener de notificação WhatsApp/overlay, portanto não verifica ações por canal ou aviso antigo persistente (CALL006/007). Não monta editor de notas durante reset automático3s (AUTH051). Alegações de SIP de fato desligado532–533 verificam só spy hangUp, e fluxo completo no banco não é exercitado. Auth/logout, origem de eventos de sessões antigas e conexão pendente ausentes.

Relacionados, sem nova contagem: R2-CALL-001, R2-CALL-006, R2-CALL-007, R2-CALL-008, R2-AUTH-051.

## 73. `src/services/__tests__/auth.service.signIn.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 48]]; total: 48 linhas; blob: `56fa00a864354bc2da366e96a3fe148484ddc089`.

**Contrato exercitado:** AuthService.signIn real usa serverLogin/setSession e preserva lock/indisponibilidade sem fallback signInWithPassword.

**Fixtures e substituições:** serverLogin/SDK/log falsos; resposta ok/tokens, lock ou unavailable sintéticos.

**Controles positivos:** Recusa não chama setSession nem password login; sucesso compara shape inteiro e outage exige mensagem de indisponibilidade.

**Limites e lacunas concretas:** Não executa endpoint auth-login/GoTrue e não verifica erro/throw de setSession. unavailable:true é premissa, não prova do mapeamento de outage upstream (AUTH021).

Relacionados, sem nova contagem: R2-AUTH-021.

## 74. `src/services/__tests__/auth.service.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 67]]; total: 67 linhas; blob: `b22cc67a26e654ac2b2c0577cd228d7db99eef27`.

**Contrato exercitado:** Serviço real deduplica leituras getSession simultâneas sem guardar promise resolvida indefinidamente; refreshSession uma vez e retry de profile após PGRST301.

**Fixtures e substituições:** SDK/from falsos, promise deferred no primeiro getSession e respostas sequenciais no maybeSingle.

**Controles positivos:** Confere duas chamadas totais do SDK após o lote concorrente e nova leitura; perfil final só retorna após segunda consulta.

**Limites e lacunas concretas:** Não emite SIGNED_OUT ou troca de usuário durante request; dedupe não invalida resposta de perfil tardia no AuthProvider(AUTH005). Não verifica eq user_id, refresh falho ou cache limpo.

Relacionados, sem nova contagem: R2-AUTH-005.

## 75. `src/styles/__tests__/prefersContrastMedia.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 31]]; total: 31 linhas; blob: `f6bdaf1ca52487f9fe86244934811400f1117c52`.

**Contrato exercitado:** Guarda textual lê accessibility.css e exige media prefers-contrast:more, recusando condição com high via regex.

**Fixtures e substituições:** Fonte CSS lida por fs a partir de cwd do teste; sem browser/parser CSS.

**Controles positivos:** Negativa procura condição @media, não palavra high solta nos comentários.

**Limites e lacunas concretas:** Não avalia media query/computed style nem contraste visual. Descrição de medição histórica não é reproduzida; nenhuma conclusão de acessibilidade integral.

## 76. `src/test/mocks/auth.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 61]]; total: 61 linhas; blob: `19c9198b8c7a49925010c9f7a24b7799d2a3b1e9`.

**Contrato exercitado:** Arquivo de apoio define fixtures autenticada/deslogada, spies resolvidos e MockAuthProvider que só devolve children; não possui testes/assertions.

**Fixtures e substituições:** User/profile/session de teste fixos e tokens fictícios; casts any. expires_at usa Date.now()+3600 em28; valores não são tokens/sessões reais.

**Controles positivos:** Perfis/usuário têm IDs distintos e user_id consistente; contexto deslogado zera três identidades.

**Limites e lacunas concretas:** MockAuthProvider ignora value e não instala contexto por design(comentário59), então apenas mock direto de useAuth pode fornecer valor aos consumidores. Não prova provider/Auth real, expiração, erros de login ou logout. expires_at de fixture não modela unidade do contrato de sessão em segundos.

## 77. `src/utils/__tests__/whatsappFileTypes.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 50]]; total: 50 linhas; blob: `86d0d8deb926ba22df64adfa24b4803def648a85`.

**Contrato exercitado:** Somente verifica quatro arrays MIME e seis extensões definidos dentro do próprio teste, incluindo negativos contra esses arrays.

**Fixtures e substituições:** Nenhum import de produção; allowlists locais5–8 e extensões locais44.

**Controles positivos:** Negativos BMP/TIFF/executable são úteis apenas para conferir a fixture declarada, sem ponte ao produto.

**Limites e lacunas concretas:** Não chama validator/uploader/endpoint produtivo, não cria File e não inspeciona bytes.10–13 itera a própria lista para provar includes;43–48 só verifica ponto e comprimento de literais, não valida extensão de entrada. Pode continuar verde com política produtiva completamente diferente.

**Adjudicação:** Encaminhado ao parent para GOV003, extensão agregada de evidência de testes, sem novo achado Auth.

## 78. `supabase/functions/_shared/__tests__/gmail-helpers.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 33]]; total: 33 linhas; blob: `979600795c9f2734d46c68aeda604d5d5ce8985b`.

**Contrato exercitado:** Helpers Gmail reais tratam nome Unicode com vírgula citado, decodificam UTF8 base64url e extraem texto/html/anexo de MIME aninhado.

**Fixtures e substituições:** Deno.test com payload MIME sintético e helper local apenas para codificação da fixture; funções de produção importadas.

**Controles positivos:** Compara objetos completos da lista de endereços e attachment metadata; acentos preservados.

**Limites e lacunas concretas:** Não executado; não chama Gmail real, OAuth, anexos externos, sanitização HTML ou formatos MIME malformados/profundidade extrema.

## 79. `supabase/functions/_shared/__tests__/gmail-mime.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 41]]; total: 41 linhas; blob: `cd590a805499c1e62515a2ad311d4d5810e53546`.

**Contrato exercitado:** Builder MIME real inclui In-Reply-To/References, codifica assunto UTF8, estrutura multipart e mantém strings base64 de dois anexos; encoder base64url tem vetor literal.

**Fixtures e substituições:** Dados de email/anexos sintéticos e Deno asserts, sem cliente Gmail.

**Controles positivos:** Bytes base64 são conferidos por sequência exata com CRLF e tipos multipart; encoder compara w78_.

**Limites e lacunas concretas:** Não faz parse round-trip por parser independente, envio/recepção Gmail, coerção de headers adversariais, limites ou sanitização. Includes não prova mensagem completa válida em todos leitores.

## 80. `supabase/functions/_shared/__tests__/talkx-delivery-connection.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 21]]; total: 21 linhas; blob: `c0806ca8a8f738a654ca15e76094d3f8e5108cc1`.

**Contrato exercitado:** Helper produtivo só retorna instance_id aparado com status connected; rejeita conexão ausente, desconectada, connecting, id nulo/vazio/não string.

**Fixtures e substituições:** Objetos escalares sintéticos com Deno assertEquals; sem DB/provider.

**Controles positivos:** Positivo trim pareado a sete entradas inválidas.

**Limites e lacunas concretas:** Não comprova autorização/seleção da conexão ou entrega TalkX; valida somente formato/estado fornecido ao helper.

## 81. `supabase/functions/get-call-recording/index.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 53]]; total: 53 linhas; blob: `18185f06dfad51d43a024f305564754695c044d3`.

**Contrato exercitado:** Helper cabecalhosDoAudio real aplica Content-Type default, Content-Length/Range/Accept-Ranges fornecidos, Cache-Control private/no-store e CORS.

**Fixtures e substituições:** Deno asserts com objetos de metadados/CORS; importa helper do index, sem requisição ao handler.

**Controles positivos:** Ausência de tamanho/faixa não cria headers; dados de range são comparados exatamente.

**Limites e lacunas concretas:** Não testa401/403/200 do handler, RLS, streaming ou forwarding do header Range ao upstream.42–48 só procura URL/provedor em headers produzidos de input que não contém URL; não prova ausência de URL em corpo, redirect, frontend ou outros headers fornecidos.

**Adjudicação:** Comentário1–7 explica recorte puro; preservar essa limitação ao citar aceite T73.

## 82. `supabase/functions/get-sip-password/index.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 40]]; total: 40 linhas; blob: `caa14f3c6b424e3adc006aba7c335a5c03a43720`.

**Contrato exercitado:** Função provisionamentoSip real usa env accessor injetado, defaults e porta numérica/fallback para string vazia ou não numérica.

**Fixtures e substituições:** Accessors semEnv/comEnv sintéticos, sem ler ambiente vivo; Deno asserts de objeto exato.

**Controles positivos:** Host/user/porta alternativos prevalecem em conjunto e wsPort é number.

**Limites e lacunas concretas:** Não testa auth/role/IP/secret do handler, retorno de senha, conexão SIP ou consumo frontend. Portas negativas/acima do intervalo e hostname inválido não fazem parte dos casos.

## 83. `supabase/functions/sentiment-alert/index.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 26]]; total: 26 linhas; blob: `43bf01b376e89df08642d042a99c99bfcd351f55`.

**Contrato exercitado:** Handler real responde405 a GET,401 a POST anônimo com corpo inválido e200 a OPTIONS.

**Fixtures e substituições:** Requests locais edge.invalid, sem SDK mock definido no arquivo; helper assertStatus só confere status.

**Controles positivos:** POST body não JSON continua401; OPTIONS antecede exigência de autenticação no resultado observado pela assertion.

**Limites e lacunas concretas:** Não injeta JWT válido/inválido, papel/autorização de objeto, emissão de alerta ou persistência. Título 'before reading secrets' não instrumenta env; status405 sozinho não prova ausência de leitura de segredo. Nenhum teste executado nesta revisão.

## 84. `supabase/functions/talkx-report/index.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 14]]; total: 14 linhas; blob: `c700a16dc873aa8b246bc395089be9768fc4ea58`.

**Contrato exercitado:** escHtml real substitui caracteres de um vetor com script, aspas e ampersand; exige ausência de tag literal e entidades esperadas.

**Fixtures e substituições:** String sintética e helper assert local; nenhuma chamada ao handler do relatório.

**Controles positivos:** Vetor reúne os cinco caracteres especiais em uma entrada.

**Limites e lacunas concretas:** Não prova que todos os campos do template passem por escHtml, contexto de atributo/URL seguro, PDF/render final ou autorização/envio do relatório.

## 85. `supabase/functions/webhook-diagnostic/diagnostic.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 41]]; total: 41 linhas; blob: `110d6ab1032e255fc63d1d3767860f80b7d18a9a`.

**Contrato exercitado:** Normalizer produtivo converte events string para array, preserva array e trata null/ausência/vazio.

**Fixtures e substituições:** Objetos WebhookRecord tipados locais; Deno asserts, sem endpoint Evolution.

**Controles positivos:** Casos array/string/undefined/null são distintos, com saídas exatas.

**Limites e lacunas concretas:** 33–40 só verifica campos do objeto que criou; afirmação de aceitar tipo depende de typecheck. Não executa autenticação/diagnóstico, contrato GO versus v2 ou schemas malformados em runtime.

## 86. `tests/contracts/ai-endpoints-auth.contract.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 150]]; total: 150 linhas; blob: `d44ca8078a085c1725c3a5c77222c36fecddeb71`.

**Contrato exercitado:** Contrato textual lê fontes reais, remove imports e verifica existência/ordem lexográfica de guard→provedor, assinatura→audit e visibilidade→download, além de credencial de sessão do voice-agent e allowlist textual.

**Fixtures e substituições:** fs lê fontes, regex semImports e listas fixas de quatro endpoints/dois canais de gasto; não executa handlers ou helpers de auth.

**Controles positivos:** Índices exigidos >-1 impedem passar quando chamadas desaparecem;60–67 tenta distinguir import de ocorrência do corpo. Verifica source user token e proíbe duas formas conhecidas de anon key no voice-agent.

**Limites e lacunas concretas:** Ordem textual não prova ordem de execução em branches, nem guard rejeitando requisição, fluxo de exceção ou validação de assinatura; substring pode casar comentários/definições. 138–145 aceita presença da atribuição mediaUrl antes do download sem testar condição em que mediaUrl=null mantém URL solicitada. Não afasta bypass por objeto confirmado pela frente Providers. 116–124 procura ausência literal de details:body e presença de nomes de campos; não demonstra exclusividade da allowlist.147–149 só exige texto identity.kind user, não sua dominância no fluxo. Nenhuma autorização/RLS/criptografia foi executada.

**Adjudicação:** Guarda estrutural útil, não prova semântica de segurança ponta a ponta. O ramo media_url=null corresponde a R2-API-027 confirmado pela frente Providers; sem achado novo aqui.

Relacionados, sem nova contagem: R2-API-027.

## 87. `tests/contracts/axe-configuracoes.contract.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 21]]; total: 21 linhas; blob: `59ff9afde892fb37815133eb2927b5619fac1d38`.

**Contrato exercitado:** Guarda textual encontra tag PopoverContent não vazia em SidebarUserPill e presença da sintaxe aria-label.

**Fixtures e substituições:** Leitura fs de fonte; regex limitada a400caracteres antes do fechamento da tag.

**Controles positivos:** Exige bloco encontrado antes de verificar atributo, evitando sucesso vazio.

**Limites e lacunas concretas:** Não executa axe/Chromium e não prova nome acessível não vazio, conteúdo renderizado ou contraste. Os comentários sobre medição histórica e dois outros achados não são revalidados pelo teste; path ~/evidencias é referência externa.

## 88. `tests/contracts/evolution-call-handler.contract.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 123]]; total: 123 linhas; blob: `97c24824bddcace3f669d79d956414c9edd06a3b`.

**Contrato exercitado:** Handler handleCallEvent real normaliza oferta/boolean isVideo e parâmetros da RPC atômica, mapeia seis status sem notify, propaga erro da persistência e evita consultas sem telefone do chamador.

**Fixtures e substituições:** getConnectionByInstance/getContactByPhone substituídos; demais helpers importados reais. Simulação RPC captura argumentos e devolve call1 ou error; from lança se consultado.

**Controles positivos:** 56–81 compara payload inteiro incluindo direction inbound e provider_event_id;106–112 força erro e exige rejeição;115–121 ausência de from impede lookup/persistência.

**Limites e lacunas concretas:** Nome 'persists and notifies once' cobre uma chamada do handler, sem replay/concorrência e sem executar RPC/notificação. 'caller identity absent' é ausência de from no evento, não JWT/Auth ou autorização da instância. Não prova gateway/assinatura, RLS, direção fromMe=true ou resultado externo do webhook.

**Adjudicação:** Sem novo ID: preservada distinção entre contrato de argumentos produtivo e atomicidade/efeitos do banco simulado.


# Revisão complementar de testes — lote database 104–155

Fonte fixada em `da307ba5626dce892f0b37cb6762463f55d14a96`. Leitura integral de 52 arquivos / 4082 linhas, com hash SHA-256, blob Git e faixas 1–EOF conferidos. Nenhuma suíte, SQL ou serviço foi executado. A cobertura compartilhada de axe-campanhas deve ser deduplicada na união global.

Os testes que importam helpers ou handlers reais foram separados de réplicas locais, contratos textuais, suporte de mocks e integração condicional. Réplicas locais de normalização e RLS foram comunicadas ao root como evidência da família GOV003/TC011, sem novo ID neste lote.

## 104. src/lib/__tests__/mapboxCostGuard.aviso-antecipado.test.ts

Faixa: 1–112; blob `816743b96f0c47f0c7dcdcd2cf3d80f3196fe5d4`. Categoria: `runtime_unit_with_mocks`.

Importa mapboxCostGuard real; verifica limiares 7/8/9/10 para teto 10, evento e payload, deduplicação e teto 20.

RPC e logAudit são mocks; não demonstra persistência no banco, faturamento Mapbox, virada do mês ou múltiplas abas.

## 105. src/lib/__tests__/mapboxCostGuard.evento-mensal.test.ts

Faixa: 1–47; blob `06859085701c4069c0903c1518e9f140485ed69d`. Categoria: `runtime_unit_with_mocks`.

Reseta o estado em memória preservando localStorage e exige um único log após refresh repetido.

Simula reload pelo helper de teste; não recarrega navegador nem confirma escrita de audit_logs. Não atravessa mês.

## 106. src/lib/__tests__/mapboxCostGuard.test.ts

Faixa: 1–85; blob `ccaa199b6a63d645429e8cf2226a0c19fba9acb0`. Categoria: `runtime_unit_with_mocks`.

Estado inicial, abaixo/acima do teto, deduplicação e rejeição da RPC são observados no helper real.

A falha só parte do estado inicial true; não verifica preservação do estado degradado false. RPC/persistência são mocks.

## 107. src/lib/__tests__/mapboxCostGuard.teto-configuravel.test.ts

Faixa: 1–79; blob `eaf51eb27bc2925aa83769ef1184f0e8bb4b4c09`. Categoria: `runtime_unit_with_mocks`.

Helper real respeita teto configurado, fallback inválido e releitura do valor após vi.stubEnv.

A alteração dinâmica do import.meta.env no teste não prova que uma aplicação Vite já compilada receba nova variável de implantação sem rebuild/reload; é limite da promessa nas linhas 67–77.

## 108. src/lib/__tests__/mapboxSession.sessaoFantasma.test.ts

Faixa: 1–102; blob `c1a96a6c9a1bcebc4a9d3df026efbfff7b301d03`. Categoria: `runtime_unit_with_mocks`.

Helper real conta uma sessão por token, conta primeira suggest/retrieve e propaga source; abrir/fechar sem nota não registra.

Chama noteSuggestCall/noteRetrieveCall diretamente com fetch mockado; não prova que o consumidor as chama somente em requisições faturáveis nem preço/cobrança do provedor.

## 109. src/lib/__tests__/notificationDedupe.test.ts

Faixa: 1–43; blob `0a8f0eb791084c9e289df1874a8a417d87ec016c`. Categoria: `runtime_unit`.

Helper real testa TTL inclusive fronteira, identidades independentes, 300 eventos, TTL misto, limite 2000 e liberação após expiração.

Escopo é mapa em memória com relógio explícito; não testa deduplicação entre processos/abas ou escolha da identidade pelo consumidor.

## 110. src/lib/__tests__/phoneNormalization.test.ts

Faixa: 1–104; blob `c2ce76c0b761d62d14fa1c5518b14e0c6a861be5`. Categoria: `local_replica_only`.

Exemplos exercitam as funções locais de normalização declaradas nas linhas 5–12.

Não importa evolution-webhook nem verifica seu código; mudanças reais passam despercebidas. Encaminhado à família GOV003/TC011.

## 111. src/lib/__tests__/postgrestFilters.test.ts

Faixa: 1–34; blob `5157c2395397c3c1e0f1fc8de4c39c795861bd83`. Categoria: `runtime_unit`.

Importa escapeOrFilterValue real e compara escapes exatos de aspas, barra, vírgula, parênteses e vazio.

Não submete strings ao parser PostgREST real nem verifica cada chamador.

## 112. src/lib/__tests__/retry.random.test.ts

Faixa: 1–86; blob `d695160206e071f5a08c840d40daa787cc484c70`. Categoria: `runtime_unit_with_mocks`.

withRetry real agenda 1250 ms, repete a operação e respeita máximo 1100 ms com fonte aleatória controlada.

Dois cenários recuperam na segunda tentativa; não demonstram limite de tentativas, predicado de retry ou distribuição do jitter.

## 113. src/lib/__tests__/rlsConversationAccess.test.ts

Faixa: 1–184; blob `44918070c4e355c45f0ebee7e88f1b888eeeabe2`. Categoria: `local_replica_only`.

Matriz de papéis/autenticação/atribuição é calculada por funções locais das linhas 29–58.

Nenhum SQL, migration ou helper real é importado. A equivalência alegada com políticas RLS não é verificada; mistura user.id e atribuição sem mapear profiles. Família GOV003/TC011.

## 114. src/lib/__tests__/rlsGroupAccess.test.ts

Faixa: 1–149; blob `dcd5a3f038bbda19927dc9d8c59d3fbe9316cfe7`. Categoria: `local_replica_only`.

Exemplos CRUD executam funções locais de papéis e autenticação.

A afirmação de correspondência com RLS não consulta políticas nem banco; mudanças reais não afetam esses testes. Família GOV003/TC011.

## 115. src/lib/__tests__/secureRandom.test.ts

Faixa: 1–100; blob `d8afa895b5a8aa00e410d2597dd5b41f3ccafc0e`. Categoria: `runtime_unit`.

Helpers reais verificam intervalos, parâmetros inválidos, alfabeto e chamada de crypto.getRandomValues.

Amostragem de unicidade não prova ausência de colisões; exigir 1000 floats distintos pode falhar por acaso. Não é certificação criptográfica.

## 116. src/lib/__tests__/singuLabels.test.ts

Faixa: 1–80; blob `517346845e6609796ee618c407f7b2bb953460fe`. Categoria: `runtime_unit`.

Dicionários e funções reais verificam rótulos, fallback cru/null, asa e ordem/limite de dois metaprogramas.

Não valida o modelo comportamental nem integração com dados remotos; testa apresentação local.

## 117. src/lib/__tests__/storage_object_reference.test.ts

Faixa: 1–67; blob `1f1baaf4f3f11dc4404ee7525bb5cbca77dd7ead`. Categoria: `runtime_unit`.

Parser real verifica três tipos de URL Storage, retirada de credencial, allowlists de origem/bucket e paths inválidos.

Não executa Storage, RLS ou renovação de URL; um localizador público não prova que o objeto seja público.

## 118. src/lib/__tests__/urlSafety.test.ts

Faixa: 1–34; blob `6470dcfb3ea580638bb072051cb935033aac7a59`. Categoria: `runtime_unit`.

isSafeHttpUrl real aceita HTTP(S) absoluto e rejeita esquemas ativos, relativos, tipos inválidos e tamanho excessivo.

Escopo de protocolo/formato para links; não constitui proteção SSRF nem valida cada consumidor.

## 119. src/lib/__tests__/utils.test.ts

Faixa: 1–54; blob `0e96d39dc1f93d0dddda25d364b77fd2e34bd46d`. Categoria: `runtime_unit`.

cn real combina condicionais, arrays, objetos e conflitos Tailwind com valores esperados.

Strings de classes não comprovam CSS computado, layout ou acessibilidade.

## 120. src/lib/__tests__/zappSchemas.test.ts

Faixa: 1–173; blob `6c0a678304dce40a4bdb0b608f74c045667a487f`. Categoria: `runtime_unit`.

Schemas reais fazem safeParse/parse para defaults, status, UUID, coerção numérica e contato; templates/filtros reais são inspecionados.

Não verifica persistência nem consumidor do schema. Coerção de ativo testa só string true, não false.

## 121. src/lib/aiRequest/__tests__/context.test.ts

Faixa: 1–121; blob `15f97afe48fdbee38f131eafde7b6036fe782055`. Categoria: `runtime_hook`.

Helpers e hook reais verificam identidade, geração, troca de contato/período, invalidate, snapshot e preservação após render sem mudança de contexto.

Não prova que todo consumidor usa isCurrent antes de aplicar uma resposta; unicidade é amostra de 200 IDs.

## 122. src/services/__tests__/chat.service.test.ts

Faixa: 1–60; blob `c42bf27aab52fb100a90ccd61618b20d619cf46f`. Categoria: `runtime_unit_with_mocks`.

ChatService real exige path/contentType do upload, gera localizador sem token e propaga erro sem chamar getPublicUrl.

Storage é mock; retorno tem path de fixture diferente do pedido e só contém bucket. Não valida ACL ou acesso real.

## 123. src/services/__tests__/external-crm.service.test.ts

Faixa: 1–77; blob `b696f3e54701c018f2a0038d3e094f4a0bb17fb7`. Categoria: `runtime_unit_with_mocks`.

Service real divide 205 contatos em lotes 100/100/5, preserva resultado parcial e falha total; sidebar verifica ação/payload e propaga erro.

CRM é mock; tamanho >=205 não confirma correspondência de todos os telefones originais. Não valida contrato externo/RLS.

## 124. src/test/fakeBroadcastChannel.ts

Faixa: 1–35; blob `f0b63ab6c5a02ed03ded66d0ec1fa5a67d7dd97f`. Categoria: `test_support`.

FakeBroadcastChannel entrega a pares do mesmo nome sem eco e expõe reset.

Entrega síncrona sem structured clone; close é vi.fn sem remover peer. Suporta testes específicos, não reproduz ciclo de fechamento ou agendamento do navegador.

## 125. src/test/guardaDeRede.test.ts

Faixa: 1–47; blob `6443515d7177950bf7f22af2ba5a03ac4e8450cb`. Categoria: `runtime_harness_guard`.

Testes chamam fetch e exigem rejeição identificável da guarda para domínio Supabase e passagem de destino local.

Não executado nesta revisão. Depende do setup; não prova bloqueio de todas as APIs de rede e não revalida as medições históricas citadas nos comentários.

## 126. src/test/mocks/supabase.ts

Faixa: 1–67; blob `ca3791fb8542bf946248037f493694cc8c4f892f`. Categoria: `test_support`.

Mock cria builder Promise, métodos rastreáveis e respostas configuráveis por tabela, auth e canal.

eq/order/limit/range/mutations não alteram resultado; consultas ignoram filtros salvo assertions explícitas do consumidor. Não emula banco/RLS/realtime.

## 127. src/utils/__tests__/notificationSounds.test.ts

Faixa: 1–122; blob `c9cb51caf0e251f7d2471793e589eecb190773e8`. Categoria: `runtime_unit_with_mocks`.

Função real é chamada com AudioContext construtível; caso inválido quiet avança timers e exige criação de oscilador (107–116), controle positivo contra silêncio.

A maioria dos casos 49–104 verifica apenas not.toThrow, insuficiente quando catch engole erro. Sem áudio real, ganho/volume ou autoplay verificado.

## 128. supabase/functions/_shared/__tests__/ai-audio-authz.test.ts

Faixa: 1–50; blob `4118cc1c8138fb6a2a45a90269b90b5f84bdc3d7`. Categoria: `runtime_unit`.

Helper real rejeita messageId ausente/inválido e Bearer ausente com status definidos.

O teste 41–49 compara duas strings UUID inválidas; não representa objeto inexistente versus objeto de outro usuário. RLS real e autorização de objeto ficam fora deste arquivo, como reconhecido no cabeçalho.

## 129. supabase/functions/_shared/__tests__/avatar-storage-path.test.ts

Faixa: 1–53; blob `deb5c469a9381d35e38dc7c49e796264c17185cb`. Categoria: `runtime_unit_with_mocks`.

Helper real normaliza telefone, usa path fixo/upsert e verifica que list/remove não são chamados; URL recebe versão.

Fetch e Storage são mocks com sucesso único; não simula uploads concorrentes, validação de bytes ou falha remota.

## 130. supabase/functions/_shared/__tests__/evolution-send-instance-token.test.ts

Faixa: 1–66; blob `71af0212e47b28b525ea739972a71ba6cf5cd42f`. Categoria: `runtime_unit_with_mocks`.

evoFetch real e rota tradutora recebem token explícito/fallback; sem token exige 400 e nenhuma chamada ao fetcher.

Só rota de texto GO; não confirma todos os chamadores e associação correta entre conexão e token. withEnv não usa finally para exceção síncrona de fn, embora os casos atuais sejam async.

## 131. supabase/functions/_shared/__tests__/postgrest-filters.test.ts

Faixa: 1–28; blob `bd711fdf54f43cc4f364c41c1efb9c3a10b87a2f`. Categoria: `runtime_unit`.

Helper Edge real retorna escapes exatos para injeção de OR, aspas, barra e parênteses.

Não executa parser PostgREST nem endpoint consumidor.

## 132. supabase/functions/_shared/__tests__/ssrf.test.ts

Faixa: 1–62; blob `4d405ba5afc322c08fb84d73e3b3b1ab5e6d5475`. Categoria: `runtime_unit`.

Primitivas reais classificam IPs especiais e validam origem/bucket/path em URLs Storage, incluindo sufixo malicioso e dupla codificação.

Não exercita resolução DNS, redirects, TOCTOU ou download efetivo; escopo explícito de primitivas.

## 133. supabase/functions/_shared/__tests__/talkx-v20-window-business-hours.test.ts

Faixa: 1–48; blob `d8e3fd8c711627ac7faffd604cddf33be855d3df`. Categoria: `runtime_unit`.

Funções reais verificam alteração de horário/dias, parse de JSON inválido e retomada de daily_limit apenas no dia seguinte.

Fixtures usam meio do dia e conexão sempre connected; não verificam fronteiras de meia-noite/DST, persistência ou worker.

## 134. supabase/functions/_shared/__tests__/webhook-signature-ambiguity.test.ts

Faixa: 1–43; blob `a63dfb0b3cfc5bbd4419add162489b71bcbf5dbb`. Categoria: `runtime_unit`.

Parser real recusa chaves repetidas, aceita ordem/espaços e verificador devolve malformed_signature.

Não cria HMAC válido nem testa tolerância temporal/secret real; esse arquivo é dedicado à ambiguidade.

## 135. supabase/functions/_shared/messaging/__tests__/index.test.ts

Faixa: 1–60; blob `1ebfc61c4297f435dbf74571a3fbc7f2adb512dc`. Categoria: `runtime_exports_smoke`.

Importa face pública real do kernel, confere tipos das funções, constantes e amostra de correlation IDs.

Smoke de exports não prova comportamento de envio/elegibilidade/mídia nem importação pelos dois consumidores em si; título e comentários delimitam parte do objetivo.

## 136. supabase/functions/ai-auto-tag/auth_test.ts

Faixa: 1–44; blob `8845684d6db07545d964e1c083063f316706a245`. Categoria: `conditional_network_integration`.

Descreve dois POSTs contra endpoint configurado exigindo 401 por credencial ausente/inválida.

ignore: !BASE pula ambos sem SUPABASE_FUNCTIONS_URL; não executado. Status pode vir do gateway e não demonstra autorização por objeto ou caminho autenticado.

## 137. supabase/functions/message-delivery/index.test.ts

Faixa: 1–51; blob `c489b27e5e79cfde674759159dcd9d5e97db238f`. Categoria: `runtime_handler_and_unit`.

Handler real rejeita GET e POST sem auth; providerPayload real monta rota/número de poll, rejeita contato inválido e preserva quote sem caption de placeholder.

Não percorre caminho autenticado de claim/persistência/provedor; não espiona leitura de secrets apesar do título, nem confere todos os campos de poll.

## 138. supabase/functions/multiplix-dispatch/__tests__/f53-rate-limit.test.ts

Faixa: 1–75; blob `2c5c17c02ac1d86a971f5306b77a0e44d795a859`. Categoria: `source_contract`.

Lê arquivos de produção e exige enforceRateLimit, Retry-After por ocorrência textual de 429 e chave por conexão.

Todas as assertions são texto; inclusive audience/dispatch não montam resposta HTTP real. Janela de oito linhas pode aceitar token sem relação de fluxo; não prova quota efetiva.

## 139. supabase/functions/public-api/index.test.ts

Faixa: 1–35; blob `06d0bc1946d75248db613dff791287058d7ad4a0`. Categoria: `runtime_handler`.

Handler real retorna tombstone 410/no-store para POST inválido com chave legada e preserva preflight permitido.

Só uma origem e uma credencial de fixture; não demonstra todas as origens/métodos nem espiona efeitos, embora fluxo seja estreito.

## 140. supabase/functions/sync-call-records/index.test.ts

Faixa: 1–66; blob `493bcad266d9e6559334617770c2243b3cb78a2a`. Categoria: `runtime_unit`.

Helpers reais testam janela ±90 s, match por últimos nove dígitos, ausência de candidato, campos fechados e gravação/duração.

Não executa reconciliador inteiro nem observa INSERT/UPDATE; frase nunca cria chamada é maior que prova dos helpers. Não simula múltiplos candidatos ambíguos.

## 141. tests/contracts/ai-auto-tag-writes.contract.test.ts

Faixa: 1–81; blob `68a825b796184e8022eafd92100e0dc1ab6e100a`. Categoria: `source_contract`.

Contrato textual reconhece explicitamente que lê fonte; exige normalização, RPC transacional e tratamento de erro, e proíbe antigo delete/insert.

Regex/tokens não exercitam transação, autorização ou propagação real do erro; relações de fluxo não são validadas semanticamente pelo teste.

## 142. tests/contracts/ai-json-extraction.contract.test.ts

Faixa: 1–79; blob `624199877b491734431fceb069ca2ead10e92791`. Categoria: `runtime_unit`.

Helpers reais verificam extração gulosa, cercas, aninhamento, conteúdo inválido/truncado e objeto dentro de array.

Contrato preserva deliberadamente extração gulosa; não valida schema do conteúdo ou todos os consumidores.

## 143. tests/contracts/ai-response-envelope.contract.test.ts

Faixa: 1–107; blob `c5fb0ba53315533a352741df0a063d4e58e45f61`. Categoria: `source_contract`.

Lê consumidores reais e exige acesso ao envelope, propagação textual de erro e ausência de defaults numéricos antigos.

Não renderiza UI nem injeta envelope; ocorrência de payload.error não demonstra que erro é exibido no ramo correto.

## 144. tests/contracts/ai-values.contract.test.ts

Faixa: 1–110; blob `4c9c77ead778bf27dc821bb687b48f0dfc6a6252`. Categoria: `runtime_unit`.

Normalizadores reais distinguem ausência/zero/escala/faixa, agregam amostras válidas e verificam identidade exata dos exports frontend/Edge.

Não valida todos os consumidores ou persistência; contrato de escala é testado localmente e não certifica dados de origem.

## 145. tests/contracts/alert-sound-persistence.contract.test.ts

Faixa: 1–85; blob `782f9c8351fe87f4f1e843d7a12ace1f5d42a22d`. Categoria: `source_contract`.

Remove comentários para parte das verificações; testa tokens de volume persistido, divisão por 100 e ausência de imports do volume de mídia.

Não toca áudio nem altera preferência no fluxo real; divisão textual não prova ganho aplicado. Regex de imports só cobre mesma linha.

## 146. tests/contracts/axe-campanhas.contract.test.ts

Faixa: 1–36; blob `627e6a882892ba771d68a8765aff4d8b3fa196a9`. Categoria: `source_contract`.

Verifica aria-label de três SelectTrigger no arquivo real de Multiplix e quantidade mínima.

Não executa axe nem monta DOM; medições históricas referidas no comentário não foram revalidadas. Arquivo já adjudicado no lote próprio de 73; leitura compartilhada não é cobertura adicional única.

## 147. tests/contracts/axe-shell-landmarks.contract.test.ts

Faixa: 1–64; blob `1be79af86aaaf67fd5018fd1cfb7018b738065ea`. Categoria: `source_contract`.

Confere roles, labels, id, um único token dialog e nav no fonte do shell.

Não executa axe/DOM. Linhas 54–56 só provam presença de componentes e não que sejam irmãos fora do AppShell, apesar do título.

## 148. tests/contracts/cors-origins.contract.test.ts

Faixa: 1–74; blob `382588264e25dbb1b09eabdc9593849b7883d24c`. Categoria: `source_contract`.

Inspeciona allowlist, padrões de origem e string canônica nas duas superfícies reais.

Não chama getCorsHeaders nem avalia regex contra origens adversariais; slice/token depende de forma do fonte, não fluxo HTTP.

## 149. tests/contracts/error-format.contract.test.ts

Faixa: 1–66; blob `6288148ea80357377d89ddad7584a93b06c55cf6`. Categoria: `runtime_unit`.

Schemas/helpers reais geram Response 422 com JSON, versão, paths e suporte a ZodError/FieldError; ausência é assertada antes de guards.

Não chama endpoints consumidores; não prova que cada handler usa o formato.

## 150. tests/contracts/ia053-streaming-registrado.test.ts

Faixa: 1–98; blob `26a74c00c3fb4c8a63124caa3e43fbbad71a04bf`. Categoria: `source_contract`.

Delimita ramo textual de stream e exige medidor, registrador, fatos de desfecho e null para uso desconhecido.

Contrato de ligação textual explicitamente separado de testes comportamentais; não transmite stream, verifica cancelamento nem observa gravação ou waitUntil real.

## 151. tests/contracts/ia055-custo-no-relatorio.test.ts

Faixa: 1–122; blob `92eff9123f4d5b984b61c9e939e795050328f9d1`. Categoria: `source_contract`.

Lê migration específica, hook e tela; exige vigência, moeda única, invoker, RPC e apresentação de custo com ausência.

Não executa SQL ou UI; não resolve redefinições posteriores da RPC. Evidência é sintaxe em migration fixa, não estado efetivo do banco ou custo calculado.

## 152. tests/contracts/ia057-indicadores-de-saude.test.ts

Faixa: 1–83; blob `bbf96c1078f85afdeed1e49b0608f0579b4880c2`. Categoria: `source_contract`.

Verifica fonte do painel quanto a ausência de amostra, denominadores, filtros e nomes de percentis com ordem textual do vazio.

Não calcula percentis com dados nem renderiza indicadores; tokens não provam efeito visual/consultas completas.

## 153. tests/contracts/media-volume-surfaces.contract.test.ts

Faixa: 1–88; blob `eca098e7580df94f75686634d94ba62cd350ec8f`. Categoria: `source_contract`.

Lista superfícies e isenções explícitas e verifica identificadores de controle de volume no código/documentação local.

Ocorrência de import/token pode satisfazer integração sem aplicar ganho; catálogo fixo não descobre novas superfícies automaticamente. Não toca players reais.

## 154. tests/contracts/notification-events.contract.test.ts

Faixa: 1–104; blob `0aaffc7d520774561d23f20d6ceacb034e30421c`. Categoria: `runtime_unit`.

Helpers reais normalizam estados/vídeo, recusam notificação fora de ringing/offer, constroem identidades e escapam rótulos.

Não verifica entrega/RLS, consumo de evento no overlay, roteamento WhatsApp/SIP ou desfecho remoto; não fecha CALL006–008.

## 155. tests/contracts/schemas.contract.test.ts

Faixa: 1–142; blob `d10d54df21762277327c8ac5530cd72317bcc2e8`. Categoria: `runtime_unit`.

Tabela executa schemas reais com payloads válidos/inválidos e Responses 422; compara exports com tabela e testa SafeString.

Não invoca handlers nem APIs externas. Aceitar shape interno ElevenLabs não valida tradução ao provedor ou action da UI (MOD070); ausência de esquema na tabela é detectada, mas completude de cenários não.

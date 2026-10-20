# Leitura estática dos scripts shell — providers

Fonte `da307ba5626dce892f0b37cb6762463f55d14a96`. **12/12 arquivos, 3.558/3.558 linhas, leitura integral.** Nenhum script, Docker, SQL, suíte ou novo probe foi executado. Nenhum novo finding contado.

Cada entrada inclui todo o shell, SQL/Node embutido, fixture, asserções e cleanup. Os hashes foram comparados com o roster e os blobs do HEAD antes de registrar.

## `scripts/db-audit/ai-block03-vocabulary-contract.test.sh`

Faixa lida: 1–573. SHA-256 `5765ba7fcb5686f1deac124730e24661c5ea1f97c2f20b036470263c77ccb43b`. Blob `f2b6914a8c0553106b395b761016075756be919b`.

**Asserções e fluxo:**

- Backfill de 1.200 contatos, contagens canônicas e preservação de nomes; seis CHECKs validados, defaults NULL e ACL das RPCs.
- Dois mutantes da migration em cópias: remoção dos UPDATEs deve falhar no VALIDATE; normal→high é detectado pelo valor persistido. Hash/cmp confirmam original intacto.

**Fixtures e SQL embutido:**

- Preestado mínimo com roles e tabelas. Corpos de persist_conversation_analysis e replace_ai_conversation_tags são cópias inline; a chamada service é deliberadamente aceita até erro de coluna ausente.
- Aplica o arquivo real 20260930150000_ai_block03_vocabulary_contract.sql ou argumento alternativo. Três containers PostgreSQL 17, não iniciados nesta revisão.

**Cleanup:** trap EXIT/INT/TERM remove somente nomes de containers com prefixo e PID previstos; mktemp e cópias apagadas pelo trap.

**Adjudicação:** Bom contrato de backfill, constraints, defaults e sensibilidade da migration específica. Não demonstra persistência bem-sucedida das RPCs nem preservação de tags humanas; esses corpos são fixtures e a chamada service espera erro. Nenhum novo achado.

**Limites:**

- Reversão demonstra apenas restaurar um default/CHECK, não desfaz os dados, todas as constraints e ACLs.
- Nenhuma execução desta revisão. Não aplica cadeia integral nem substitui a definição SQL vencedora revisada por database.

**Loci:** 147–344: funções e tabelas inline; 384–505: migration real e assertivas; 507–573: reversão parcial e mutantes.

## `scripts/db-audit/catalog-manifest.test.sh`

Faixa lida: 1–255. SHA-256 `53f9bbd0b9706a0d4359efec2a5d5dbb3a8e959c2b5d117a8941a1229722a66b`. Blob `90ee8c16dcb323b1046fd42c099bd3844fb75130`.

**Asserções e fluxo:**

- Catálogo/manifesto versão 2, PostgreSQL 17, assinaturas de overloads, dezesseis seções e fingerprints; duas bases com OIDs distintos normalizam iguais.
- Mutações reais de defaults, constraints, domínio, enum, índice, RLS, policies, trigger, corpo/overload de função, ACL de tabela/coluna/tipo/rotina/default e view alteram as seções esperadas.

**Fixtures e SQL embutido:**

- Fixture SQL cria as mesmas estruturas nas bases a/b; somente a recebe ruído previamente descartado para deslocar OIDs.
- Invoca arquivos reais catalog.sql e manifest.sql por caminhos relativos ao cwd; Node embutido valida JSON e deepEqual após remover data/identidade da base.

**Cleanup:** Container nomeado com PID e regex de remoção; trap EXIT limpa container e arquivos temporários.

**Adjudicação:** Controle positivo de estabilidade de catálogo e sensibilidade a alterações estruturais, com produtor real. Não há achado novo.

**Limites:**

- Fixture sintético não esgota objetos/ACLs da aplicação; diversas mutações simultâneas comprovam diferença por seção, não cada subcaso isoladamente.
- Depende de iniciar no cwd esperado; não executado.

**Loci:** 59–113: fixture SQL; 121–172: geração e equivalência; 176–254: mutações e diferenças.

## `scripts/db-audit/check-mcp-exec-acl.test.sh`

Faixa lida: 1–345. SHA-256 `9979e8c0b9fa1193be4e0333deaa4a82456da74b9e33e6661bdaf5c85f362f5b`. Blob `d7678ba2125f35ceae92cf809b044b792779eb16`.

**Asserções e fluxo:**

- Baseline exige status zero, marcador OK e dois MD5s de corpos; negativos exigem erro não zero com marcador FALHA ACL.
- Mutações cobrem função ausente/overload/owner/SECURITY DEFINER/volatilidade/grants/search_path/default/body, memberships INHERIT/SET/ADMIN e caminhos indiretos.

**Fixtures e SQL embutido:**

- Aplica migration real mcp_exec_functions_harden e guard SQL real; reset acrescenta REVOKE/GRANT explícitos do baseline.
- Roles/topologia reduzida, alternativa compacta de corpo e manipulação de pg_proc.proacl em fixture isolado. Imagem padrão PostgreSQL 16, não o ambiente real mencionado nos comentários.

**Cleanup:** trap EXIT/INT/TERM remove container apenas se nome satisfaz prefixo+PID.

**Adjudicação:** Negativos substanciais do guard e prova textual de status/marcadores. Aceita variantes previstas por hashes distintos. Não prova segurança de todo SQL que mcp_exec pode executar; nenhum achado novo.

**Limites:**

- Teste funcional da versão compacta usa substring 1 em saída formatada; evidência principal desse caso é o hash/guard.
- Migration isolada e topologia artificial não certificam ACL implantada; não executado.

**Loci:** 46–160: reset e assertivas; 181–201: variante compacta; 203–345: variantes legítimas e mutações negativas.

## `scripts/db-audit/check-reconcile-ledger-drift.test.sh`

Faixa lida: 1–185. SHA-256 `dc79f624dfbadcbe199f9ba055a261a11a98de2f702b34696bafe0b70071dc1c`. Blob `ca84a96c7a3d6add5df78d551b33e5c01c4456d6`.

**Asserções e fluxo:**

- Nome do ledger fica estável para mcp_exec limpo, híbrido, hash divergente e statements NULL; colisão reconhecida renomeia e segunda aplicação é estável.
- Referência Gmail antiga é corrigida apenas em statements[3], os dois primeiros statements são preservados e hash da linha não muda no replay.

**Fixtures e SQL embutido:**

- Tabela schema_migrations mínima; statements de fixtures são dados textuais, incluindo BODY_PLACEHOLDER, nunca executados como SQL de funções.
- Aplica migration real 20260829060000_reconcile_ledger_drift.sql em cada cenário.

**Cleanup:** Container isolado sem publicação de porta; trap EXIT/INT/TERM com regex prefixo+PID; reset por TRUNCATE somente da tabela fixture.

**Adjudicação:** Controla autorização do rename pela evidência textual e estabilidade do replay. Não representa reconstrução de toda a história de migrations. Nenhum achado novo.

**Limites:**

- A assinatura histórica do fixture é selecionada para o contrato; o roteiro não mede ledger de produção nem prova semântica do corpo armazenado.
- Não executado.

**Loci:** 50–78: insert/assert helpers; 100–151: colisões positivas/negativas; 153–185: Gmail, preservação e replay.

## `scripts/db-audit/check-webhook-failures-acl.test.sh`

Faixa lida: 1–141. SHA-256 `16e4d11984d140d4f346b641dda9f31994c0ec41253b75c04d3b9b580442b786`. Blob `26092b40ca35ef7047bbcfe539092d0d8458b881`.

**Asserções e fluxo:**

- Migration original deve ser recusada, baseline endurecido aceito; hardening remove grants legados de coluna.
- Negativos incluem grants de tabela/coluna, policy PUBLIC/adicional, RLS desabilitada, TRUNCATE/GRANT OPTION service_role e tabela ausente; exigem não zero e marcador FALHA.

**Fixtures e SQL embutido:**

- Roles anon/authenticated/service_role e default grants amplos modelam preestado; aplica duas migrations reais e o guard SQL real.
- Reset derruba só a tabela webhook_failures fixture e reaplica arquivos.

**Cleanup:** trap EXIT/INT/TERM com remoção do container por regex prefixo+PID.

**Adjudicação:** Controle útil do contrato do guard e da migration ACL com negativos específicos. Não é teste de processamento de webhook/retry/opt-out, portanto não refuta API006–008. Nenhum novo ID.

**Limites:**

- Primeiro caso original inseguro só exige status não zero, sem confirmar a causa; os negativos seguintes exigem marcador.
- Não aplica toda a cadeia e não executado.

**Loci:** 46–84: reset, status/marcador; 92–118: default grants e hardening; 120–141: mutações negativas.

## `scripts/db-audit/inbox-contact-authorization.test.sh`

Faixa lida: 1–234. SHA-256 `4ab1b30d0cde4ad45ca96f5caf62418d121f65c5c69a8536a68b01d9adf4c8e9`. Blob `a7272fe7302f3857da8bc61761e1cc01f1c75d2d`.

**Asserções e fluxo:**

- Runtime JSON valida hash de definições, RLS, quatro policies, guards/EXECUTE/grants; checks SQL adicionais de privilégios.
- Visibilidade de owner/fila/special/admin versus outsider/inativo; IDOR e spoof caller; contagens de tabs; CRUD de notas, autoria imutável, ausência de escrita e replay.

**Fixtures e SQL embutido:**

- Tabelas mínimas, seis perfis, helper admin hardcoded por UID e funções antigas de conveniência; migration real substitui helpers-alvo.
- Psql SET ROLE e claim sub modelam caller; arquivo runtime SQL real fornece evidência estrutural.

**Cleanup:** trap EXIT/INT/TERM remove só container nomeado com prefixo+PID.

**Adjudicação:** Controles de RLS e efeitos concretos, incluindo zero linhas para outsider e remoção própria. Esperar qualquer erro nos negativos reduz a precisão causal; sem novo finding produtivo.

**Limites:**

- expect_failure 31–41 não exige SQLSTATE/mensagem: erro SQL não relacionado também satisfaz o cenário.
- Após UPDATE legítimo 217 só se conta conjunto de notas, sem conferir conteúdo atualizado. Fixture admin/roles não prova integração Auth real. Não executado.

**Loci:** 59–152: fixtures; 154–195: runtime/hash e ACL; 197–234: comportamentos e replay.

## `scripts/db-audit/l11-departments-acl-escrita.test.sh`

Faixa lida: 1–271. SHA-256 `6bfb278386b1a4882a549d1a0ab115f1faa8be8447c147393102c23b6909c7f0`. Blob `b519e30d1a5d1fc66550c0d4a1c52b200abe2ed3`.

**Asserções e fluxo:**

- Privilégio efetivo de coluna antes/depois: segredos fechados para authenticated, colunas públicas preservadas, anon sem escrita, service_role mantém chave.
- Mutante A sem REVOKE de tabela deve falhar; mutante B sem REVOKE de coluna verifica ausência de UPDATE em segredos e documenta redundância esperada.

**Fixtures e SQL embutido:**

- Grants de tabela default mais grants de coluna do mesmo grantor em quatro bases descartáveis; migration real e duas cópias modificadas.
- Assertivas has_column_privilege medem grant efetivo, sem confundir REVOKE de coluna com fechamento de grant de tabela.

**Cleanup:** Container regex prefixo+PID; diretório TMPDIR/.tmp com sufixo PID removido por pattern, sem tocar arquivo original da migration.

**Adjudicação:** Boa discriminação da revogação necessária versus redundância. Alegações do cabeçalho sobre medição histórica não foram tomadas como evidência live nesta reauditoria. Nenhum novo ID.

**Limites:**

- Mutante B 263–267 imprime OK tanto se o contrato falha quanto se passa; asserts anteriores restringem somente UPDATE nos dois segredos, não tornam obrigatória toda equivalência de privilégios.
- Asserções de ACL não executam INSERT/UPDATE via PostgREST/RLS; não executado.

**Loci:** 88–141: checa_contrato e detecção de falha; 182–227: grants e migration; 230–271: mutantes A/B.

## `scripts/db-audit/talkx-events-contract.test.sh`

Faixa lida: 1–328. SHA-256 `f6818d8608bd74fcfeb93cd354f2779c4f2593c98ba89cb097c10a7c528c2952`. Blob `cd9867192d16e735161056dc3e665a4328262fe7`.

**Asserções e fluxo:**

- V11/V11.1 reais: tipos de evento, alvo obrigatório/XOR, formato de entidade, owner/admin/supervisor, anon, append-only e replay de constraints/policies.
- CASCADE de campanha é verificado por superuser para não confundir filtro RLS com remoção real.

**Fixtures e SQL embutido:**

- Fixture usa user_roles em helper SECURITY DEFINER e mantém profiles.role agent como controle contra helper legado.
- X021 299–309 é CHECK copiado inline, não aplicação da migration X021. A tabela campaigns fixture não habilita RLS; events habilita.

**Cleanup:** trap EXIT/INT/TERM e nome de container prefixo+PID.

**Adjudicação:** V11/V11.1 têm vínculo com migrations reais e assertivas positivas/negativas. O fecho X021 apenas testa SQL local copiado; locus enviado à família TC-011/GOV003, sem novo ID API.

**Limites:**

- X021 copiado continuaria aceito mesmo se o CHECK produtivo divergir; suíte irmã citada precisa evidência independente.
- CASCADE prova remoção, mas o fixture não prova a autorização de excluir campanha sob a RLS produtiva; não executado.

**Loci:** 104–184: fixture e roles; 186–290: migrations V11/V11.1 e asserts; 299–328: CHECK X021 copiado e cascade.

## `scripts/db-audit/talkx-settings-rls.test.sh`

Faixa lida: 1–146. SHA-256 `6f1b3a91fe0741889444be599aaddf6aae021c50efc4ab30fe19d3985c4728b8`. Blob `b7aaba71b98db126251e38a0426131f78f07fa8b`.

**Asserções e fluxo:**

- Red-first verifica valor inalterado sem UPDATE policy; migration V06 e X014 reaplicadas; anon perde SELECT e authenticated mantém.
- Admin persiste novo valor, agente não altera e continua lendo.

**Fixtures e SQL embutido:**

- Helper is_admin_or_supervisor local lê profiles.id/role; fixture iguala profile.id e user_id; não usa user_roles canônico.
- Campaigns e tabelas de links mínimas permitem carregar role gates, mas RPCs/gatilhos dessas tabelas não são exercitados.

**Cleanup:** Container com RANDOM/PID; trap EXIT com regex e três tentativas removem o mesmo nome gerado.

**Adjudicação:** O teste distingue UPDATE silencioso de persistência real. Não comprova o mapeamento de papel em produção; divergência do helper foi encaminhada à família TC-011/GOV003, sem finding API.

**Limites:**

- Não há usuário supervisor no roteiro, apesar do título/fecho admin/supervisor.
- Helper de conveniência e id=user_id podem ocultar erro de identidade; leitura usa substring 09:00. Não executado.

**Loci:** 48–87: helper e fixtures; 89–111: red-first e replay; 113–146: role gates e valores.

## `scripts/db-audit/talkx-template-history-behavior.test.sh`

Faixa lida: 1–588. SHA-256 `46db0e4480dc56022f87f3bb6c11d9d8007cfe92973027c46045b679514fd236`. Blob `40e569e66b1011c1972b57bdc3921a58882a3b4e`.

**Asserções e fluxo:**

- Migration real de canonização: snapshots preservam estado anterior/autoria, RPC atualiza e retorna timestamp persistido; stale/outsider/mídia inválida recusados.
- ACL, variants ownership/admin, bypass de definer irmão, trigger imutável mesmo com grant+policy permissiva; counter não altera revision token.
- Dois writers em processos psql separados exigem exatamente um sucesso e um stale; estado final 2 versões; cascade físico e runtime hash/estrutura.

**Fixtures e SQL embutido:**

- Fixture de runtime preexistente ou migration A/B conforme flag; três preestados inválidos opcionais e mutuamente exclusivos abortam com diagnóstico específico.
- get_profile_id_for_user e admin helper são definições locais sobre profiles, não a cadeia completa de user_roles; chamadas de RPC reais após migration.

**Cleanup:** Container RANDOM/PID e diretório mktemp prefixado /tmp; trap EXIT/INT/TERM com guards; funções/policies permissivas de teste são removidas antes do runtime proof.

**Adjudicação:** Harness comportamental substancial de edição/snapshot e concorrência da migration específica. Flags opcionais não contam como cenários executados automaticamente. Nenhum novo achado.

**Limites:**

- Não aplica migrations posteriores que podem substituir RPCs; não refuta defeitos na cadeia vencedora.
- Helper de papéis simplificado; não há rede/provedor nem execução nesta auditoria. Imutabilidade/atomicidade decorrem apenas dos cenários concretos descritos.

**Loci:** 30–262: validação de modos e preestados; 268–472: migration, RPCs e negativos; 474–530: concorrência e cascade; 532–588: runtime/hash.

## `scripts/db-audit/talkx-v15-replied-count-guard.test.sh`

Faixa lida: 1–116. SHA-256 `c62d35f5416056c8fa6064a29edd2c376b0d63bef515ea1da6667dd6f063f6ab`. Blob `e9b19d54da20223a1cb7fc355a6825e68b81b0fd`.

**Asserções e fluxo:**

- GREEN exige mensagem talkx_delivery_state_managed_by_worker após UPDATE replied_count; consulta pg_proc exige ausência de increment_talkx_template_use.
- RED só recusa uma substring de erro específica; não mede valor persistido.

**Fixtures e SQL embutido:**

- Helper admin sempre false, campanha mínima e trigger antigo copiado; claims simulados em conexão postgres, sem SET ROLE authenticated.
- Nunca cria increment_talkx_template_use no preestado; wrapper usa ON_ERROR_STOP=0 até para carregar a migration real.

**Cleanup:** Container RANDOM/RANDOM com regex de prefixo; trap EXIT/INT/TERM.

**Adjudicação:** Locus concreto TC-011/GOV003: ausência final de RPC não comprova DROP, porque ela já não existia no fixture. Remover o DROP manteria essa assertiva verde. GREEN do guard é controle parcial válido. Encaminhado ao root, sem novo ID API.

**Limites:**

- ON_ERROR_STOP=0 pode deixar migration/fixture falharem sem encerrar psql; RED aceita erro diferente do marcador, e não verifica SQLSTATE 42501 prometido no cabeçalho.
- Claims em conexão postgres testam ramo de guard, não ACL/RLS como role authenticated. Não executado.

**Loci:** 9: ON_ERROR_STOP=0; 36–96: fixture sem RPC; 98–116: RED/GREEN/ausência final e fecho.

## `scripts/db-audit/wa-tag-and-status-authorization.test.sh`

Faixa lida: 1–376. SHA-256 `48c7a5651d2966b22d1cee710e4a61f0ab2b73111bc65ce22cb6715fe19da9cb`. Blob `fb58006b18814835643845da79a46a7d6c513da7`.

**Asserções e fluxo:**

- Preestado permite outsider fechar contato e operar tags globais, com efeitos SQL medidos; migration real fecha acesso indevido e preserva próprios/fila/admin.
- Após negativas verifica status/closures e tags intactos, preserva service_role/cron e bloqueia anon; FSM termina archived.

**Fixtures e SQL embutido:**

- Corpos anteriores e predicates inline; schema reduzido, auth.uid/role leem claims e user_roles realista distingue perfil de auth UID.
- Replica seed entre antes/depois; funções após migration são reais, helpers de visibilidade/ACL remanescentes continuam fixtures reduzidos.

**Cleanup:** trap EXIT/INT/TERM remove diretório mktemp e container regex prefixo+PID; DELETEs de seed restritos ao banco descartável.

**Adjudicação:** Vínculo migration→recusa→ausência de efeito é substancial para status/tags. Não torna equivalentes esses predicados simplificados à cadeia SQL vencedora. Nenhum novo finding.

**Limites:**

- Caso B1 promete 42501 mas exige apenas texto contact_not_authorized, apesar do helper permitir SQLSTATE; B4b título open→open na verdade reenvia resolved.
- Caso cron usa session_user postgres com SET ROLE service_role: prova caminho privilegiado específico, não configuração pg_cron implantada. Não executado.

**Loci:** 99–244: preestado e corpos copiados; 246–309: seed e RED com efeitos; 314–376: autorização, negativos sem efeitos e privileged paths.

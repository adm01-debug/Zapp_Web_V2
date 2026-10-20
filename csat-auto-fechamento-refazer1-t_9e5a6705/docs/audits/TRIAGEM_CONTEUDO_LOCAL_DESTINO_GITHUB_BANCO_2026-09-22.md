# Triagem — o que ainda está local e deve ir ao GitHub ou ao banco

Data: 22/09/2026. Commit auditado: `a11efb7d5c096a1f91e183fe44c0330c1bee0b07`.
Banco canônico: `tnnnlkbymytvtqngbbqh`.
Branch isolada: `audit/codex-sync-20260922`.

## 1. Veredito

**Não encontrei no working tree ativo nem nas 28 branches locais uma migration exclusiva válida esperando aplicação no banco. Os quatro merges locais também não contêm blobs exclusivos da máquina.**

O material que merece publicação agora é **a documentação sanitizada da auditoria, com esta triagem atualizada e sua evidência**, em PR exclusivamente documental.

Existem rascunhos antigos recuperáveis e arquivos ignorados. Não é correto promovê-los em lote: há versões substituídas, fixtures de teste, probes com expectativas invertidas e snapshots anteriores a revogações de permissões.

Isso não certifica ausência absoluta de bugs nem todos os requisitos do plano. A finalidade desta rodada é decidir **destino e necessidade de publicação**, com evidência própria.

## 2. Atualização em relação à auditoria da manhã

O outro agente continuou publicando. A base passou de `36a5b4fa` para `a11efb7d`.

| Item | Antes | Agora |
| --- | --- | --- |
| Checkout original atrás da main | 69 commits | 128 commits |
| Caminhos diferentes | 55 | 79 |
| Migrations na main/banco | 446 | 446 |
| Evidência atual de deployment completo | Insuficiente | Novo run de escopo all, 67 funções |
| Fontes atuais versus manifesto desse deploy | Não comprovado | Zero diferenças nas entradas das 67 funções |
| Quatro merges temporários | Commits não alcançáveis por heads remotas | Mesmo resultado, mas zero blobs exclusivos |
| Probes antigos | Triagem histórica citada | Substituição deliberada confirmada nos arquivos do GitHub |

Não usar a pendência antiga de “26 funções sem evidência atual” como justificativa para outro deployment indiscriminado. As evidências novas e suas ressalvas estão na seção 7.

## 3. Escopo e método

Foram examinados:

- Dois worktrees conhecidos, 28 branches locais e 69 heads remotas no snapshot das 14:50 UTC.
- Conteúdo de árvores/merges, paths de migrations e alcançabilidade de blobs pelo histórico remoto.
- 60.144 arquivos ignorados, agrupados por origem.
- Objetos recuperáveis: o fsck contou 69 commits, 314 trees e 236 blobs não alcançáveis desconsiderando reflogs.
- 51 versões de arquivos fora das heads remotas, encontradas nas árvores dos commits examinados.
- 194 conteúdos adicionais; 127 associados a algum caminho em árvores recuperáveis e 67 sem caminho recuperado nessa busca.
- Os 245 conteúdos candidatos, aproximadamente 7,1 MB, passaram pelo Gitleaks com saída redigida: exit 0.
- Diffs específicos de SQL/CRM/TalkX, políticas de descarte dos probes, artefatos novos de banco e deployment.
- 158 testes locais dirigidos: todos passaram.

As contagens de “não alcançável pelo fsck” e “fora das heads remotas atuais” usam conjuntos diferentes. Não somar esses números como arquivos perdidos.

A localização por similaridade dos 194 objetos é **heurística, não prova funcional**. Os diffs e fontes citados sustentam as decisões específicas abaixo; não houve homologação funcional individual de todos os objetos antigos.

O escopo não cobre toda a pasta pessoal do usuário, outros projetos ou dados de outras aplicações.

## 4. Matriz de destino

| Material | GitHub | Banco canônico | Decisão |
| --- | --- | --- | --- |
| Relatório anterior e inventário | Publicar como snapshot histórico | Não | Apontar para a triagem atualizada |
| Este relatório e evidência sanitizada | Publicar por PR documental | Não | Entrega útil que permanece local |
| Quatro merges de tmp/integracao-e50 | Não há necessidade funcional demonstrada | Não | Conteúdo de arquivos já alcançável no remoto |
| 17 PNGs TalkX + 3 arquivos de apoio | Já versionados | Não | Nenhuma entrega esquecida nesse conjunto |
| Migrations das branches locais | Já têm contraparte na main | Ledger atual reconciliado | Nenhuma versão exclusiva descoberta |
| Drafts SQL recuperados | Não promover como migrations novas | Não reaplicar | Publicação atual contém hardening posterior |
| Fixture mínima G-12 | Só se convertida em fixture formal necessária | Nunca como schema produtivo | Estrutura reduzida de teste |
| Oito probes/configurações históricos | Não restaurar na suíte como estão | Não | Expectativas de defeito; substituição documentada |
| Snapshots antigos de schema/deployment | No máximo arquivo histórico marcado | Não | Não representam o estado desejado atual |
| .claude/settings.local.json | Não | Não | Configuração específica da máquina/agente |
| deno.lock local | Decisão separada de reprodutibilidade | Não | Não copiar cegamente |
| Dependências, builds, caches | Não no código-fonte | Não | Artefatos reproduzíveis |
| Índices Graphify | Não automaticamente | Não | Derivados, potencialmente obsoletos |
| Secrets | Nunca no Git | Apenas no mecanismo próprio de secrets quando necessário | Nunca em migrations |
| Dados de clientes e mensagens | Não no Git | Não há carga local aprovada identificada | Não importar arquivos sem origem e escopo definidos |

## 5. Conteúdo local: análise específica

### 5.1. Os quatro merges não equivalem a quatro melhorias perdidas

```text
e772c599e4fb9d83546cf22be116a1721660c2d1
f25cbd07b1eda6e7eb4e5f7446a2e72e1b0ab637
477a1d9ec55ff54fd2ac409359be2be3fa226d53
e92754dc4ab624876bf7e570c548eec2adeea291
```

Para cada um, todos os blobs da árvore estão alcançáveis a partir das heads remotas examinadas. O remerge-diff não indicou resolução manual exclusiva.

A combinação das árvores pode não ter um commit idêntico na main porque a ordem dos merges difere. A ausência do hash de merge não significa ausência de seu conteúdo.

**Parecer:** preservar durante o trabalho paralelo, sem merge duplicado apenas para igualar hashes. Nenhuma exclusão ou garbage collection foi feita.

### 5.2. Branches antigas com patches diferentes

As branches antigas de CRM, inbox e TalkX com patch-id diferente da main já possuem seus commits no histórico remoto examinado. “Está no GitHub” não significa necessariamente “foi incorporado funcionalmente à main”.

Não classifiquei essas branches como entregas exclusivas locais. Fazer merge de todas exigiria nova análise de integração e poderia restaurar implementações antigas.

Nenhum path de migration de qualquer branch local estava ausente da main auditada.

### 5.3. Sete upgrades recuperáveis já constam da main

| Dependência | Versão do upgrade encontrado | Main |
| --- | --- | --- |
| TypeScript | 5.9.3 | ^5.9.3 |
| @radix-ui/react-toast | 1.2.23 | ^1.2.23 |
| input-otp | 1.5.0 | ^1.5.0 |
| globals | 17.12.0 | ^17.12.0 |
| @radix-ui/react-slot | 1.3.3 | ^1.3.3 |
| @radix-ui/react-progress | 1.1.16 | ^1.1.16 |
| react-i18next | 17.0.14 | ^17.0.14 |

Os lockfiles intermediários tratavam apenas de parte das atualizações. **Não restaurar um package.json/bun.lock antigo por ser diferente.**

### 5.4. Drafts de CRM/TalkX substituídos por versões mais protegidas

A comparação dos conteúdos recuperáveis com a main mostrou:

- talkx-send: timeout/AbortSignal, escopo correto do timer, backoff antes de dispatch e substituição de dados de contato em passe único estão na versão atual.
- talkx-scheduler: a main reutiliza deliveryWindowStatus e schedule_timezone; o draft tinha helper duplicado e fixo em São Paulo.
- crm-integration: a versão atual restringe ações de cron, usa leases, exige credencial externa de serviço no servidor e valida identidade antes da escrita.
- useSyncToCRM: a main envia identidade do contato; o backend deriva metadados. O draft confiava nos metadados enviados pelo browser.
- Busca global/hooks CRM: autorização, vinculação ao contato local e controle de concorrência de respostas foram acrescentados na versão atual.
- catalogShared: o mapa curado de ícones substituiu uma importação mais ampla.

**Parecer:** não cherry-pickar esses drafts. Isso não certifica todos os fluxos de negócio, mas demonstra por que não constituem uma atualização superior apenas por existirem localmente.

### 5.5. Oito drafts SQL com cinco contrapartes versionadas

1. 20260908180000_crm_contact_links_and_sync_outbox.sql
2. 20260908220000_harden_crm_sync_outbox_leases.sql
3. 20260909120000_validate_crm_outbox_acl_and_atomic_merge.sql
4. 20260911200000_persist_talkx_schedule_timezone.sql
5. 20260912130000_harden_talkx_draft_save.sql

A versão publicada acrescenta, conforme a migration:

- Constraints de lease, sucesso, telefone e limites de IDs externos.
- Atualização de vínculo CRM condicionada ao mesmo identificador externo e falha em conflito.
- Verificação de perfil ativo, mensagem não vazia após trim e conexão WhatsApp válida.
- Tratamento de INSERT/DELETE no trigger de mutabilidade.
- Separação entre aplicação da constraint e validação histórica, evitando validação cega de linhas legadas.

**Parecer:** não reaplicar os drafts nem registrá-los como versões novas. O guard vivo reconciliou as versões atuais.

### 5.6. Snapshot antigo com permissões revogadas

O blob cce8e93c... de supabase/schema-manifest.json contém um estado anterior. A main tem três índices adicionados, um removido e **48 entradas de grants a anon/authenticated removidas nas tabelas TalkX**.

Restaurar esse baseline aceitaria permissões que não constam mais do estado desejado. **Não reconstruir grants no banco a partir desse arquivo.**

### 5.7. Probes históricos não são testes esquecidos

O [índice histórico versionado](./TALKX_AUDIT_ARCHIVE_2026-09-11.md) documenta a retirada dos oito probes/configurações.

Exemplos de expectativas antigas: duas gravações criam duas campanhas; alterar filtro não salva; disparar sem confirmação chama start. O PASS desses probes significava defeito reproduzido.

A cobertura positiva correspondente está em:

- src/components/talkx/__tests__/useCampaignEditor.test.tsx
- src/components/talkx/__tests__/TalkXView.route.test.tsx
- src/components/talkx/__tests__/talkxCampaignDraft.test.ts
- src/hooks/integrations/__tests__/useTalkXSegments.test.ts
- scripts/db-audit/talkx-campaign-state-transitions.test.sh
- scripts/db-audit/talkx-draft-save.test.sh
- scripts/db-audit/talkx-draft-recipients.test.sh
- Testes de leases, janela e scheduler.

**Parecer:** não reintroduzir expectativas invertidas. Os probes antigos não foram executados contra produção.

### 5.8. Fixtures e objetos sem proveniência completa

Dois blobs SQL contêm uma fixture estrutural mínima G-12. Criam tabelas/funções reduzidas para teste, não uma atualização produtiva.

Outros objetos intermediários de UI, relatórios e testes não têm commit/caminho completo recuperado. Estão inventariados, mas não aprovados individualmente como funcionalidades prontas.

**Parecer:** preservar, não apagar nem promover automaticamente. Recuperações futuras devem partir de uma necessidade funcional identificada e ser convertidas em código/teste atual com revisão.

## 6. Arquivos ignorados

| Grupo | Quantidade |
| --- | ---: |
| node_modules | 58.587 |
| dist | 764 |
| Graphify | 712 |
| coverage | 57 |
| Husky gerado | 17 |
| playwright-report | 1 |
| test-results | 1 |
| supabase/.temp | 1 |
| Caches TypeScript | 2 |
| Configuração local + deno.lock | 2 |
| **Total** | **60.144** |

Configuração local do Claude: 555 bytes. Para classificação, foram vistas somente as chaves de primeiro nível permissions/model; os valores não foram expostos. Deve permanecer local.

deno.lock: 14.901 bytes, formato 5, 83 entradas remotas, expressamente ignorado. A CI usa Deno v2.x e não declara uma política frozen desse lock. A oportunidade é definir reprodutibilidade, regenerar de forma controlada e testar — não publicar cegamente o arquivo desta máquina.

As 17 imagens TalkX e INDEX.html, MANIFESTO.json e README.md já estão versionados. Um antigo Zone.Identifier ainda é recuperável como objeto Git; não deve ser restaurado.

## 7. Banco e deployments atuais

### 7.1. Banco

[DB Live Guard #35742672654](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/35742672654), commit a11efb7d:

- Endpoint oficial e TLS comprovados pelo workflow.
- 446 versões reconciliadas.
- Catálogo e manifesto frescos baixados e novamente comparados: iguais aos arquivos versionados, desconsiderando metadados de geração.
- Tipos e ACLs aprovados.
- Manifesto fresco de 14:46:59 UTC.

A prova remota veio da CI e seus artefatos. Não houve SQL direto desta sessão.

Continua a limitação histórica: **431 entradas com critério satisfeito + 11 sem prova histórica fixadas no manifesto + 4 avisos adicionais = 446**. Essas 15 não são migrations esquecidas para aplicar.

### 7.2. Deployment completo agora comprovado como execução

[Run #35737945858](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/35737945858):

- Commit a126659e..., escopo all.
- 67 funções e 67/67 smokes aprovados.
- Mesmo manifesto de fontes da main a11efb7d: zero diferenças.

[Run #35742846771](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/35742846771):

- Commit a11efb7d, escopo csp-report.
- Inventário das 67 funções: todas ACTIVE, com timestamps presentes.
- 67/67 smokes aprovados, mesmo manifesto de fontes.

Fingerprint de fontes:

```text
cc85593e8d23a5260e50ff0840e26d1b37ec2dd48ce282dfbd038f0030bbcca2
```

A ausência de evidência atual de deployment completo foi superada. **Não equivale a comparação binária independente de cada fonte com o pacote compilado, nem a E2E autenticado integral.**

### 7.3. Ressalva de proveniência dos bundles

Sete digests remotos mudaram entre os atestados, sem mudança do manifesto local:

- csp-report: implantado explicitamente pelo segundo run.
- gmail-webhook, message-delivery, promogifts-catalog, public-api, talkx-link e whatsapp-webhook.

As seis últimas têm timestamp remoto de 14:10:27 UTC, posterior à primeira captura, de 14:09:57 UTC. Pode haver efetivação posterior/consistência da API ou outra ação de deployment. **A causa não foi demonstrada.**

Recomendação: estabilizar coleta pós-deploy por versões/digests e guardar a proveniência por função. Isso é uma melhoria da prova operacional, não evidência de um arquivo produtivo ainda exclusivamente local.

## 8. Pendências reais e ordem recomendada

1. **PR documental:** publicar relatórios e inventários sanitizados, com o relatório anterior identificado como histórico.
2. **Coordenação de Git:** alinhar o checkout com o outro agente; o original continua 128 commits atrás, intocado.
3. **Preservação:** guardar objetos recuperáveis antes de limpeza; não misturar com código produtivo.
4. **Guard de paridade:** corrigir o sumário que imprime sucesso global com duas verificações puladas sem credencial. É um bug já no GitHub, não uma correção pronta esquecida localmente.
5. **Proveniência Edge:** coleta estabilizada, artefatos por função e vínculo com pacote/build.
6. **Deno/runtime/lock:** definir política explícita em PR própria.
7. **Ledger:** documentar corretamente as 15 limitações e formalizar os quatro avisos; não fabricar hashes.
8. **Configuração runtime:** ampliar verificações de Cron, Realtime, Storage, autovacuum e backups conforme escopo autorizado.

Não recomendo SQL ou novo deploy só para “esvaziar pendências locais”.

## 9. Testes e limitações

- 127 testes locais de migrations, catálogo, manifesto, paridade, edges e integração CRM: PASS.
- 31 testes locais de scheduler, E90, timezone, leases e outbox: PASS.
- **158 PASS; 0 FAIL; 0 SKIP.**
- Gitleaks em 245 conteúdos recuperáveis: exit 0.
- [CI/CD #35742672801](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/35742672801): success.
- [DB offline #35742672430](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/35742672430): success.
- [CodeQL #35742672418](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/35742672418): success.

Os smokes remotos foram executados pelo workflow, não disparados novamente por esta sessão.

Não foi reexecutada localmente toda a suíte UI, não houve restauração de backup, envio de mensagens ou homologação funcional individual dos 245 históricos. Ausência de findings no scanner não garante ausência absoluta de qualquer informação sensível.

A comparação estrutural de public não certifica todos os dados, secrets ou configurações dos serviços.

## 10. Entregáveis e preservação

- [Evidência estruturada desta triagem](./evidence/2026-09-22-local-triage.json)
- [Auditoria anterior](./AUDITORIA_PARIDADE_LOCAL_GITHUB_SUPABASE_2026-09-22.md)

Não houve push, commit, merge remoto, deploy, mudança de secrets ou SQL produtivo nesta sessão. Apenas o worktree da auditoria avançou por fast-forward até a main de referência, preservando os documentos próprios.

Os documentos continuam locais e não rastreados. Precisam de PR documental para publicação. O diretório /tmp é temporário, não um backup permanente.

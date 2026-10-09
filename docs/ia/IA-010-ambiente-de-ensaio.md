# IA-010 — Ambiente de ensaio (dados sintéticos, perfis distintos, credenciais de homologação)

**Etapa do plano:** `IA-010` `[M]` *Preparar ambiente de ensaio* — "Definir dados sintéticos de Vendas,
Compras, Logística, Financeiro, SAC e RH, com usuários de permissões diferentes e credenciais
exclusivas de homologação."
**Aceite:** ensaios **não** enviam mensagens reais nem acessam bancos-fonte ou dados pessoais
desnecessários.

## 1. Estado atual do ambiente (medido, leitura somente, banco canônico `tnnnlkbymytvtqngbbqh`)

| Item | Valor | Fonte |
|---|---|---|
| Tabela `departments` | **0 registros** (existe, está vazia) | consulta somente-leitura no banco canônico, 29/09/2026 |
| Tabela `queues` | **1 registro** | idem |
| `profiles` | **7 usuários** | idem |
| Papéis em `user_roles` | `admin`, `supervisor`, `agent` — **não existe papel "somente leitura"** | idem |
| `chatbot_flows` ativos | **0** | idem |
| Credencial de QA dedicada | arquivo `/workspace/.secrets/zapp-v2.env` (143 bytes) exporta `ZAPP_QA_EMAIL` / `ZAPP_QA_PASSWORD` — lido por referência, **nunca** copiado, impresso ou commitado | existência verificada; conteúdo não lido |
| Credencial do CI E2E | secrets `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` e `SUPABASE_SERVICE_ROLE_KEY` | `.github/workflows/e2e-logado.yml:76-90` |
| Fixtures de teste existentes | `e2e/fixtures/e2e-contact.ts` (contato com mensagens **de texto**), `e2e/fixtures/seed-talkx-segment.sql`; sessão gravada em `e2e/.auth/user.json` | `e2e/` |

Consequência direta: **não há hoje departamentos** e o papel "somente leitura" **não existe** no
modelo. Antes de qualquer ensaio por departamento é preciso decidir como esses dois conceitos são
representados (ver §3).

## 2. Especificação de dados sintéticos (a criar)

| Grupo | Conteúdo sintético |
|---|---|
| Perfis | 4 identidades de ensaio: `admin`, `supervisor`, `agent`, **somente leitura** (a representação do 4º é decisão pendente) |
| Departamentos | Vendas, Compras, Logística, Financeiro, SAC, RH |
| Por departamento | 1 fila, 1 conexão de ensaio, 6 contatos, 3 conversas com histórico (texto), 1 conversa longa (> 200 mensagens) para exercitar IA-063 |
| Casos de borda | conversa sem análise, contato sem memória, áudio sem transcrição, conversa com áudio/autorização negada, outro contato com o **mesmo** telefone (IA-098) |
| Marcadores | nomes com prefixo `ENSAIO-`, e-mails em domínio de teste, telefones fora de qualquer faixa real do cliente, **nenhum** CPF/CNPJ real, nenhum dado pessoal de cliente existente |
| Proibido no ensaio | disparar para destinatário real; usar banco-fonte/CRM externo; reusar contato de produção como fixture |

## 3. Decisões pendentes (precisam de decisão antes de provisionar)

1. **Onde provisionar:** (a) *seed versionado no banco canônico*, com prefixo `ENSAIO-` e reversão por
   prefixo — classe aditiva (DML com `WHERE`), mas é **escrita em produção**; ou (b) projeto/branch
   Supabase de homologação separado. Recomendação técnica: (a) para os dados de UI/RLS (o objetivo é
   exercitar o **mesmo** schema e as **mesmas** policies), com o seed isolado por prefixo e marcado como
   não-produção. Requer autorização explícita do Joaquim por ser escrita no banco canônico.
2. **Representação de "somente leitura":** hoje há `admin`/`supervisor`/`agent`. Ou entra um papel novo
   (decisão de produto + migration), ou o ensaio usa um `agent` sem permissões específicas — o aceite da
   IA-015 ("um perfil somente leitor recebe sugestões sem poder provocar mudanças indiretas") só é
   provável com uma identidade que não possa alterar nada.
3. **Departamentos:** a tabela existe vazia; criar 6 departamentos de ensaio é DML aditivo reversível.

## 4. Regras para qualquer ensaio

- Nenhuma chamada a provedor com chave de produção para teste: usar teto de custo, chave de teste e
  destinatário controlado (IA-193).
- Nenhum ensaio roda contra dados de cliente; quando um caso exigir volume, gerar dado sintético.
- Áudio/voz de ensaio: amostra autorizada ou sintética (IA-187), nunca conversa real de cliente.
- Toda evidência de ensaio registra: ambiente, período, filtro, amostra e comando — não "print de tela"
  como prova de integridade.

## 5. Aceite da etapa

- [x] Dados sintéticos definidos por departamento e por caso de borda, com faixas/marcadores reservados.
- [x] Usuários com permissões diferentes especificados (4 perfis), com a pendência do 4º declarada.
- [x] Credencial de homologação identificada por referência (arquivo de secrets + secrets do CI),
      sem expor valor.
- [x] Regra de "não enviar mensagem real / não tocar dado de cliente / não usar banco-fonte" escrita
      como condição de ensaio.
- [~] Provisionamento — **artefato versionado pronto; execução pendente de autorização**. O gerador
      `scripts/ia/ensaio-provisionamento.mjs` (cartão SL-059) produz, de forma determinística, o DML
      aditivo, idempotente e reversível por prefixo **dos dados da §2 — departamentos, filas,
      contatos e mensagens** —, e **não fala com banco nenhum**: a única aplicação autorizada a um
      agente é no banco LOCAL da cópia de trabalho
      (`bun scripts/ia/ensaio-provisionamento.mjs --sql | zapp-db-local psql <cópia> [nome]`).
      **Nenhum perfil, usuário ou papel é provisionado**: `profiles.user_id` e `user_roles.user_id`
      são FK NOT NULL para `auth.users` e o login exige `auth.identities` — criar as identidades da
      §2 obrigaria a escrever no schema `auth`, fora do escopo e do permitido neste cartão. Os 4
      perfis seguem apenas especificados (§2), e a reversão não toca nas tabelas de identidade (§6).
      Escrever no banco canônico continua sendo escrita em PRODUÇÃO e segue dependendo de autorização
      explícita do Joaquim (ver §3.1 e §6).

## 6. Estado do provisionamento em 08/10/2026 (ponta de dia) — cartão SL-059

**Artefato:** `scripts/ia/ensaio-provisionamento.mjs` (gerador, determinístico, sem acesso a banco) e o
contrato `tests/contracts/sl059-ia010-provisionamento.contract.test.ts` (13 conferências do plano, do
DML e dos marcadores contra este documento, contra `supabase/schema-manifest.json` e contra a paleta
real do sistema).

**Saída medida** (`node scripts/ia/ensaio-provisionamento.mjs --plano`, 08/10/2026):

| Item | Valor |
|---|---|
| Departamentos | 6 (Vendas, Compras, Logística, Financeiro, SAC, RH) com 1 fila cada |
| Contatos | 36 (6 por departamento), nomes `ENSAIO-*`, e-mails `@ensaio.invalid` |
| Conversas de texto | 18 (3 por departamento) |
| Conversas longas | 6 (216 mensagens cada — acima das 200 da IA-063) |
| Mensagens | 1374 |
| Perfis | 4 especificados na §2 — **0 provisionados pelo DML** (3 com papel no enum `public.app_role`, o 4º pendente do SL-058) |

**O que NÃO foi provisionado (e por quê):**

1. **Perfis, usuários e papéis — NÃO provisionáveis neste cartão.** O DML não cria nenhuma
   identidade: `public.profiles.user_id` e `public.user_roles.user_id` são FK NOT NULL para
   `auth.users` (migrations `20251215024517` e `20251215025014`), com o trigger
   `on_auth_user_created` → `public.handle_new_user()` inserindo em `profiles` a partir de
   `auth.users`, e o login exige `auth.identities`. Provisionar os 4 perfis da §2 obrigaria a
   escrever no schema `auth` — fora do escopo e do permitido neste cartão. Pela mesma razão a
   reversão (`--remover`) **não** apaga `auth.users`, `auth.identities`, `profiles` nem
   `user_roles`: ela reverte exatamente as 4 tabelas que o provisionamento escreve.
2. **4º perfil ("somente leitura") — PENDENTE.** O enum `public.app_role` tem só `admin`,
   `supervisor` e `agent`; criar o papel é decisão de produto + migration, fora das regras deste
   cartão (sem DDL/migration) e objeto do cartão **SL-058**. O gerador declara a pendência e não
   inventa papel.
3. **Caso de borda "outro contato com o mesmo telefone" (IA-098) — BLOQUEADO.** O schema canônico tem
   o índice único `contacts_phone_key` em `contacts.phone`
   (`supabase/schema-manifest.json` → `indexes.contacts.contacts_phone_key`): dois contatos com o
   mesmo telefone não são graváveis hoje. O ensaio desse caso exige decisão sobre onde ele é
   representado (contato, `is_lid_legacy`, ou canal) antes de virar fixture.
4. **Aplicação no banco canônico — NÃO executada.** É escrita em produção e depende de autorização
   explícita (§3.1). O DML está pronto para quando (e se) ela vier; enquanto isso, os ensaios rodam
   no banco LOCAL da cópia, com os mesmos dados e as mesmas policies (regra R1 da Arquitetura V2).

**Propriedades travadas pelo contrato:** todo nome/fila/contato nasce com o prefixo `ENSAIO-`; todo
e-mail é do domínio de teste; telefone fora de faixa real; nenhum CPF/CNPJ; cores de fila restritas à
paleta que o sistema já tem (`src/components/queues/CreateQueueDialog.tsx`); todo `insert` traz
`on conflict`; toda remoção (`--remover`) filtra por prefixo; **a reversão apaga só tabelas que o
provisionamento escreve** (paridade, com lista de exceções deliberadas vazia); o DML não menciona
`conversation_analyses` nem `conversation_memory` (os casos "conversa sem análise" e "contato sem
memória" valem por omissão provada); e o gerador recusa host de banco que não seja local
(`conferirAlvoLocal`).


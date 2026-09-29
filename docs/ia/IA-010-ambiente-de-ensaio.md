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
- [ ] Provisionamento — **não executado**: é escrita no banco canônico e depende de autorização
      explícita (ver §3.1).

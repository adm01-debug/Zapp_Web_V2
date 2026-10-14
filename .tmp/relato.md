Especialista: edgar
Especialista: Edgar (area-edge-api)

FATOS MEDIDOS (conferidos por mim no diff deste commit): 3 arquivos alterados —
`supabase/functions/crm-integration/index.ts`, `supabase/functions/crm-integration/index.test.ts` e
`.tmp/relato.md`; 1 arquivo de teste; 7 casos de teste novos.

## Sensibilidade
Toca a checagem de papel da Edge (`view_contacts`, a mesma do `safeRolesLookup`). Nada foi afrouxado:
o `select` genérico continua admin-only; a nova ação é negada a credencial de serviço/cron (400) e, sem a
permissão, a Edge responde 403 ANTES de ler o CRM (provado no teste). Nada de produção; nenhuma ação
existente mudou de contrato — só foram acrescentadas duas ações de leitura.

## O que mudou e por quê
- `supabase/functions/crm-integration/index.ts`: nova ação `companyNames`/`roleNames` — leitura ESTREITA
  das sugestões do formulário de contato, sob `view_contacts`. Antes o front precisava de
  `rpc`→`search_contacts_advanced` (admin-only) e recebia LINHAS de contato (nome, telefone) só para
  extrair um texto: o atendente batia em 403 e o supervisor pagava até 5×200 linhas por abertura.
- `supabase/functions/crm-integration/index.ts`: `distinctNameSuggestions`/`distinctCompanyNames` são a
  projeção pura (trim, descarta vazio, deduplica, ordena, corta no teto `MAX_NAME_SUGGESTIONS`). A saída é
  `string[]`; o nome de empresa usa a mesma prioridade do contexto de Email (fantasia → CRM → razão). A
  consulta externa seleciona só a coluna do nome e é limitada pelo teto.
- `supabase/functions/crm-integration/index.test.ts`: casos novos que dirigem o HANDLER REAL por papel
  (atendente sem/com `view_contacts`, credencial de serviço, parâmetro extra) e que provam a projeção, o teto
  e a prioridade do nome de empresa.

## Prova
- vermelho antes: `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/crm-integration/index.test.ts` sobre o `index.ts` da base → `error: Type checking failed.` (os símbolos da ação e da projeção não existem na base; os testes dependem da mudança).
- verde depois: mesmo comando com a mudança → `ok | 41 passed | 0 failed`.
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (239s)` (dependencias OK, db_guard OK, tipos OK, lint OK, migrations OK; no modo rápido o banco local não é verificado — este cartão não mexe em banco).

## O que NÃO fiz e por quê
- Não troquei o front (`src/services/crm/external-crm.service.ts` e os hooks `useExternalEmpresas/Cargos`):
  não estão em ARQUIVOS QUE PODE TOCAR. É o cartão filho t_de90369c (hugo). O cache de 30 min vive no front
  e continua lá — não é tocado por este cartão.
- Não regenerei `supabase/deployment-manifest.json` (derivado; é do integrador).

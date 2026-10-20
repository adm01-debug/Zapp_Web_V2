Especialista: iris
- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 42s;OK lint 3s;OK migrations 1s

## FATOS MEDIDOS PELO FECHAR (14/10 06:51, gerados por máquina: valem mais que números escritos à mão)
```
 .tmp/relato.md                                     |  84 ++++++----
 src/components/admin/AdminCRMDashboard.tsx         |  76 +++++++--
 .../AdminCRMDashboard.explorer-crm360.test.tsx     | 175 +++++++++++++++++++++
 3 files changed, 292 insertions(+), 43 deletions(-)
```
- Testes alterados neste cartão (1 arquivo[s]) rodados AGORA no seu commit: Test Files 1 passed (1);Tests 4 passed (4)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Passada adversarial da 1ª entrega: sem critérios refutados
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — Jev inseguro sobre o relato


## O que mudou (3 defeitos do mesmo painel, 1 arquivo + 1 teste)
Arquivo: `src/components/admin/AdminCRMDashboard.tsx`
Teste: `src/components/admin/__tests__/AdminCRMDashboard.explorer-crm360.test.tsx` (novo)

1) Explorer abre o CRM 360. O botão "Explorer Completo" chamava `navigate('/#crm360')` do
react-router-dom. O roteador grava a URL por `history.pushState`, e isso NÃO dispara
`hashchange` nem `zapp:navigate`; nada lê `location.hash` na V2 — a navegação canônica é
`?view=<id>` (`useNavigationHistory`). Resultado: o clique não trocava de tela e a URL ainda
perdia o `?view=` da tela atual. Agora o botão usa `navigateToView('crm360')` (o helper
compartilhado), sem react-router no arquivo.

2) Top 5 mostra o cliente. A lista mostrava `customers.vendedor_nome` — que é o VENDEDOR, não
o cliente. O nome do cliente mora em `companies` (`razao_social`/`nome_fantasia`), alcançado
por `customers.company_id`. Como o embed depende da relação PostgREST da origem externa
(a Edge aceita `select` cru, mas não dá garantia de embed), fiz duas consultas explícitas:
`customers` (top 5 por valor) e depois `companies` com `filters: [{ column: 'id', operator:
'in', value: companyIds }]`. Exibição: `razao_social || nome_fantasia || nome_crm || '—'`.

3) Falha nunca vira 0. Os seis cartões usavam `record_count ?? 0` e os três painéis caíam em
lista vazia (0/vazio) quando a consulta falhava ou o CRM estava fora do ar. Agora os seis
cartões e os três painéis usam `isError || meta.unavailable` (helper local `dadosIndisponiveis`,
que estreita `meta.unavailable` sem mexer no tipo compartilhado `ExternalDBQueryResult`) e
mostram '—' + "Dados não disponíveis".

## Prova (tela real, dentro do Router como no App)
Comando: `npx vitest run src/components/admin/__tests__/AdminCRMDashboard.explorer-crm360.test.tsx`

VERMELHO antes (componente anterior, obtido por `git show c837ced8d8:...`, sem `git stash`):
`Test Files 1 failed (1) | Tests 3 failed | 1 passed (4)` — falhavam "Top 5 mostra o nome do
cliente" e os dois cenários de indisponibilidade/erro; passava só o do Explorer.

VERDE depois (com os 3 ajustes): `Test Files 1 passed (1) | Tests 4 passed (4)`

Vizinhos que também montam a tela do admin (sem regressão):
`npx vitest run .../AdminView.a11y.test.tsx .../AdminView.section-error-boundary.test.tsx` →
`Test Files 2 passed (2) | Tests 7 passed (7)` (com o cartão novo: 3 arquivos, 11 testes).

Verificação do cartão (critério 4):
`zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (188s)` — `OK` em `db_guard`, `tipos`, `lint`
e `migrations`; `banco_local` NÃO VERIFICADO por não haver conjunto local informado (o cartão não
pede migration).

O que o teste prova, e onde:
- URL canônica `?view=crm360` gravada + evento `zapp:navigate` com `view: 'crm360'` no clique.
- `Alfa Metalúrgica LTDA` / `Beta Distribuidora S.A.` renderizados e o nome do vendedor
  (`Vendedor Um/Dois`) AUSENTE do DOM; e a consulta a `companies` recebeu `['emp-1','emp-2']`
  (prova que a busca é por id de empresa).
- Cenário `meta.unavailable: true` e cenário `isError`: `getAllByText('—') >= 6`,
  `getAllByText('Dados não disponíveis') >= 9` (6 cartões + 3 painéis) e `queryAllByText('0')`
  vazio — ou seja, falha não vira 0.

Observação honesta: não há captura de tela; a prova é o teste de renderização da tela real
(RTL, cenários de sucesso/indisponível/erro), que é o caminho verificável aqui.

Sem migration, sem dependência nova, sem tocar em tipo compartilhado, sem exportar dados.

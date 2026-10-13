Especialista: iris

## O que mudou e por quê

**1. `special_agent` listado (`src/components/admin/AdminUsersTable.tsx`)**
O seletor de role da linha do admin oferecia só admin/supervisor/atendente. Quem tinha a role
`special_agent` (existe no enum `app_role` e é a base do `VisibilityGrantsManager`) ficava com o
seletor vazio e não havia como promover ninguém a Agente Especial. Adicionei a opção
`<SelectItem value="special_agent">Agente Especial</SelectItem>` e o teste prova a troca chegando
como `special_agent` no `onRoleChange`.

**2. "Nível de acesso" sem enganar (`AdminUsersTable.tsx` + `AdminView.tsx`)**
`profiles.access_level` está DEPRECATED e nada no sistema o impõe, mas a coluna se chamava "Acesso" e
o campo do diálogo mostrava opções como "Acesso total ao sistema" — parecia permissão concedida.
Rotulei como informativo nos dois lugares (o cartão autoriza rotular): cabeçalho
`Acesso (informativo)` e campo `Nível de acesso (informativo)` com a linha
"Informativo: este nível não libera nada hoje — quem dá acesso é o papel (Role).".

**3. Estados completos nas tabelas (`AdminView.tsx`, `AdminUsersTable.tsx`, `AdminAuditTable.tsx`)**
Erro de consulta vira bloco na tela com `role="alert"` e botão "Tentar novamente" (antes o erro do
hook não existia na tela); tabelas vazias têm texto próprio (lista vazia x busca sem resultado x
período sem log); o carregando continua sendo o spinner.

**4. Controles que não eram decorativos (`AdminView.tsx`)**
O campo de busca aparecia em todas as abas (CRM, Playbooks, Copilot, Treinamento, Sala de Crise) sem
filtrar nada — agora só nas abas em que o termo filtra a lista. Ligado de verdade, pelo contrato do
hook do PD-16: filtro de data da auditoria ("Data inicial"/"Data final", dias inteiros no fuso do
navegador) e paginação (`Anterior`/`Próxima` com total). O campo de senha do diálogo passou a usar a
régua `MIN_PASSWORD_LENGTH` (era "Mínimo 6 caracteres", a Edge exige 8) e o `PasswordStrengthMeter`,
que existia sem uso no painel.

**5. `src/components/admin/useAdminData.ts` (do cartão pai t_0438f11e, cherry-pick da faixa
`dia/2026-10-12..23d5f122f`)**
A tela sem o hook não teria filtro nem `error`. Trouxe a faixa pelo comando do cartão
(`git cherry-pick --empty=drop $(git rev-list --reverse --no-merges dia/2026-10-12..23d5f122f)`) e
corrigi o que o revisor do pai apontou e este cartão torna visível ao usuário: os limites de data
eram montados em UTC (`T00:00:00.000Z`) e cortavam 3 h de cada dia no Brasil — agora `inicioDoDiaLocal`
/`fimDoDiaLocal` usam o fuso do navegador; e o `afterEach` com `vi.unstubAllGlobals()` no teste.

**6. Testes que já existiam e foram tocados (nenhum afrouxado)**
- `AdminView.a11y.test.tsx`: só a string do rótulo conferido passou de `Nível de Acesso` para
  `Nível de acesso (informativo)` — a asserção continua checando a associação label→combobox.
- `AdminView.section-error-boundary.test.tsx` e `AdminView.servicosGoogle.test.tsx`: o mock do hook
  ganhou os campos que o contrato agora tem (`auditTotal`, `error`) e os dois exports usados pela tela
  (`MIN_PASSWORD_LENGTH`, `AUDIT_PAGE_SIZE`), para o mock não mentir sobre o contrato.
- `useAdminDataColumns.test.ts`: veio no cherry-pick do cartão pai (mesmos 3 campos no mock).
- Nenhum teste foi pulado, relaxado ou trocado por mock que já trazia a resposta: as provas de tela
  renderizam o `AdminView`/`AdminUsersTable` reais.

## Prova (comando e linha de resultado)

- Vermelho antes, 1 (tela): com `AdminView.tsx`/tabelas no estado de HEAD (via `git show HEAD:<arq>`)
  → `npx vitest run src/components/admin/__tests__/AdminView.estados-tabelas.test.tsx`
  → `Tests  8 failed | 1 passed (9)`, com `Unable to find an element with the text: Nenhum usuário cadastrado.`
- Vermelho antes, 2 (role/coluna): com `AdminUsersTable.tsx` de HEAD →
  `npx vitest run src/components/admin/__tests__/AdminUsersTable.roles.test.tsx`
  → `Tests  3 failed | 1 passed (4)`, com `Unable to find an accessible element with the role "option" and name "Agente Especial"`.
- Vermelho antes, 3 (fuso): com o hook no estado do índice →
  `npx vitest run src/components/admin/__tests__/useAdminData.erros-auditoria.test.ts`
  → `Tests  1 failed | 8 passed (9)`, diff `- "2026-10-01T03:00:00.000Z" + "2026-10-01T00:00:00.000Z"`.
- Verde depois: `npx vitest run src/components/admin/` → `Test Files  19 passed (19)` / `Tests  74 passed (74)`.
- Lint: `npx eslint` nos arquivos alterados → `1 problem (0 errors, 1 warning)`, e o único aviso é o
  `no-restricted-imports` do import do client no `useAdminData.ts`, que já está em HEAD (linha 2 igual):
  nenhum aviso novo.

## O que NÃO fiz e por quê

- Não mexi em Edge Function, migration nem no banco: o `access_level` continua gravável (virou
  informativo na tela) porque as descrições do `accessLevelConfig` moram no hook, fora dos arquivos
  deste cartão; apagar a opção exigiria decidir no banco o que substitui o campo.
- "Captura" (O QUE FAZER 2) não foi feita: gerar imagem exigiria subir a tela autenticada, e a REGRA R1
  manda usar só banco local com usuário sintético — fora do alcance do nível worker. A prova visual aqui
  é a renderização real (RTL) dos estados, com os textos conferidos acima.
- Nada de tela fora de `src/components/admin/**`; nenhum push/PR/deploy.

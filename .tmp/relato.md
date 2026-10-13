Especialista: Íris (area-front-componentes)

Nota sobre o aviso do juiz (arquivos fora da lista do cartão): os arquivos `src/hooks/system/useUserSettings.ts`, `src/hooks/__tests__/useUserSettings*.test.tsx` e `src/i18n/index.ts` vêm do commit de dependência que o PRÓPRIO CARTÃO manda trazer para a base (`759126a11`, seção DEPENDÊNCIA), trazido por `git cherry-pick` como o cartão determina. Não é alteração minha; o meu diff é só `src/components/settings/**` (5 arquivos).

## O que mudou e por quê
- `src/components/settings/AppearanceSettings.tsx`: os `<Select>` de Tema e Idioma agora mostram o valor EM VIGOR — tema normalizado para `light|dark|system` (valor legado/desconhecido cai em `system`, nunca num seletor vazio) e idioma normalizado com `normalizeLanguage` (o mesmo helper que o hook usa na leitura), para o código legado `pt-BR` do banco continuar exibindo "Português (Brasil)". O idioma passou a ter os valores `pt|en|es` com rótulos em pt-BR e grava na coluna o código que ela já usa (`pt-BR|en-US|es`), então o valor exibido e o salvo não divergem. O botão "Salvar preferências" veio para dentro da aba (antes era o "Salvar Alterações" global), com estados de salvando (spinner + botão desabilitado) e de erro na tela (`role="alert"`).
- `src/components/settings/SettingsView.tsx`: removido o "Salvar Alterações" do cabeçalho global — ele prometia gravar as abas de operação, que gravam pelo próprio painel canônico (`useNotificationSettings`, `ScheduleSettings` etc.); as preferências desta aba passam a ser gravadas por um botão dentro dela, alimentado pelo mesmo hook (`isSaving`/`onSave`), um só dono da escrita.
- `src/components/settings/__tests__/AppearanceSettings.tema-idioma.test.tsx` (novo): renderiza o componente real e prova o valor mostrado (tema escuro/claro e cada idioma, inclusive o código legado `pt-BR`), o que o seletor grava, e os estados salvando/erro.
- `src/components/settings/__tests__/AppearanceSettings.a11y.test.tsx`: só recebeu as duas props novas (`isSaving`/`onSave`) no objeto base; as asserções de acessibilidade seguem as mesmas.
- `src/components/settings/__tests__/SettingsView.test.tsx`: teste novo que trava a remoção do salvar global (`queryByRole('button', {name:/Salvar Alterações/})` ausente).

## Prova
- vermelho antes: `npx vitest run src/components/settings/__tests__/AppearanceSettings.tema-idioma.test.tsx` com o `AppearanceSettings.tsx` da base (`git show HEAD^:...`) → `Test Files 1 failed (1); Tests 6 failed | 2 passed (8)` (falham: 3 de idioma, os 2 de gravação e o de erro; passam só os 2 de tema, que já exibiam certo).
- verde depois: `npx vitest run .../AppearanceSettings.tema-idioma.test.tsx .../AppearanceSettings.a11y.test.tsx .../SettingsView.test.tsx` → `Test Files 3 passed (3); Tests 22 passed (22)`.
- `npx eslint` nos 5 arquivos do diff → saída vazia, exit 0.

## Consumidores do valor mudado (idioma)
- O código escolhido no `<Select>` (`pt|en|es`) é o que a tela exibe; o que vai para `updateSettings` é o código que a coluna já usa (`pt-BR|en-US|es`).
- Único leitor de `user_settings.language`: `src/hooks/system/useUserSettings.ts` → `changeAppLanguage` → `normalizeLanguage` (aceita os dois formatos). Confirmado por `git grep -n "user_settings" -- src` e `git grep -n "language" -- src/hooks`.
- Tema: valores `light|dark|system` são os que `useTheme` entende; nenhum outro consumidor da coluna.

## Estados e tokens
- Estados da aba conferidos: salvando (`Salvando...` + botão desabilitado), erro na tela (alerta com texto), e o valor sem correspondência (normalizado, sem seletor vazio).
- Nada de token/classe nova: `text-destructive` e `border-border` já existem no projeto; o spinner usa `motion-safe:animate-spin` (respeita reduzir-movimento).

## O que NÃO fiz e por quê
- Os arquivos de `src/hooks/**` e `src/i18n/index.ts` listados no aviso do juiz são do commit de dependência do cartão (nota no topo deste relato); não foram tocados por mim.
- Não implementei captura de tela no navegador: não houve mudança de CSS/token (só props e handlers), então a prova é o teste do componente real nos dois temas.

CONCLUÍ: a aba Aparência mostra e grava o Tema e o Idioma em vigor, e o botão de salvar vive dentro da aba, com estado de salvando e erro na tela.

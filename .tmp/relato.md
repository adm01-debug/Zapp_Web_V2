Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- `src/pages/Auth.tsx` (botão submit "Entrar", linha do RippleButton): acrescentei `inline-flex items-center justify-center` à classe. O RippleButton base é `cn('relative overflow-hidden transition-all duration-200', ...)`, sem display flex, então o rótulo e a seta não ficavam garantidamente na mesma linha/centro. A seta continua com `ml-2` e `group-hover:translate-x-1` (o botão segue `group`) e o estado "Entrando..." segue igual.
- `src/components/auth/HeroBenefits.tsx` (realce do título): troquei `to-secondary` por `to-[hsl(var(--primary-text))]`. No tema escuro `--secondary` é `240 5% 16%` (quase preto), então o fim do gradiente do realce sumia; `--primary-text` existe nos dois temas (`:root` 221 83% 35%; `.dark` 221 83% 78%) e é o token claro usado para texto no escuro. Só o gradiente mudou; nenhuma cor literal foi introduzida.
- `src/components/auth/__tests__/HeroBenefits.test.tsx` (recriado/adaptado): renderiza o componente REAL, confere que o realce usa `from-primary` + o token `--primary-text` (e não `--secondary`) e calcula o contraste das duas pontas do gradiente contra `--background` nos dois temas.
- `src/pages/__tests__/Auth.botao-entrar.test.tsx` (novo): renderiza a PÁGINA `Auth` real (mocks de `useAuthForm`, cliente Supabase deslogado e `GOOGLE_OAUTH_ENABLED=false`) e prova que o botão submit é `inline-flex` + `items-center` + `justify-center` e que a seta é filha direta da MESMA caixa do rótulo.

## Prova
- vermelho antes (com Auth.tsx sem `inline-flex` e HeroBenefits com `to-secondary`): `npx vitest run src/components/auth/__tests__/HeroBenefits.test.tsx src/pages/__tests__/Auth.botao-entrar.test.tsx` →
  `AssertionError: ... group w-full rounded-xl bg-primary ... expected [ Array(16) ] to include 'inline-flex'`
  `AssertionError: escuro: --secondary: expected 1.296049087715709 to be greater than or equal to 3`
- verde depois: `npx vitest run src/components/auth/__tests__/HeroBenefits.test.tsx src/pages/__tests__/Auth.botao-entrar.test.tsx` → `Test Files 2 passed (2); Tests 5 passed (5)`
- regressão das telas de auth: `npx vitest run src/components/auth/__tests__/HeroBenefits.test.tsx src/pages/__tests__/Auth.botao-entrar.test.tsx src/pages/__tests__/Auth.fundo-mapa.test.tsx src/pages/__tests__/Auth.sem-cadastro.test.tsx` → `Test Files 4 passed (4); Tests 14 passed (14)`

## Notas de contexto
- O cartão cita conflito com a `dia/2026-10-12`; o workspace já nasceu da `dia/2026-10-13` (que inclui a 10-12), então a entrega foi refeita por cima da dia atual — não foi preciso rebase/merge.
- O defeito dos textos continua o mesmo, mas o componente mudou: o realce hoje é "atendimento moderno." (o cartão descrevia a versão antiga "atender com excelência"); adaptei o teste ao texto atual.

## O que NÃO fiz
- Não toquei no "Criar Conta": a `Auth` atual é de aba única (login), sem botão de cadastro — não há o mesmo defeito a corrigir ali.

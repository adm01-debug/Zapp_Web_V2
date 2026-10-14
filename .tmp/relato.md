Especialista: iris
Perfil: Íris (area-front-componentes)

## O que mudou e por quê
- `src/pages/ResetPassword.tsx`:
  * `checkingSession` (ResetPassword.tsx:33, true na montagem): enquanto a troca do link (PKCE + detectSessionInUrl) não termina, a tela mostra "Verificando link de recuperação…" numa região viva em vez de piscar "Link Inválido"; o estado só é decidido depois de `getSession()` resolver (ou do evento `PASSWORD_RECOVERY`), e `getSession` tem `catch` para não prender a tela no "Verificando". Resolve o "Link inválido" falso.
  * `Link Inválido` passou a viver dentro de região viva (ResetPassword.tsx:143) — o texto é anunciado.
  * botão do olho com nome acessível (`Mostrar senha`/`Ocultar senha`), `aria-pressed` (ResetPassword.tsx:244) e `aria-controls="password"`; ícones Eye/EyeOff `aria-hidden`.
  * os dois campos ganharam `name` e `autoComplete="new-password"` (ResetPassword.tsx:233 e :259).
  * o medidor alimenta o envio via `onStrengthChange`: `Alterar Senha` fica `disabled={loading || !isValid}` (ResetPassword.tsx:283), há guarda no `handleSubmit` (ResetPassword.tsx:88) e, com senha digitada e inválida, o motivo aparece em texto (ResetPassword.tsx:267). Senha vazada (HIBP breached) passa a BLOQUEAR o envio.
- `src/components/auth/PasswordStrengthMeter.tsx`: a barra virou `role="progressbar"` com `aria-label`/`aria-valuemin`/`aria-valuemax`/`aria-valuenow`/`aria-valuetext` (PasswordStrengthMeter.tsx:194) e cada requisito ganhou texto para leitor de tela, além da cor/ícone (`— requisito atendido`/`— requisito pendente`, PasswordStrengthMeter.tsx:309); ícones de estado `aria-hidden`.
- Testes novos: `src/pages/__tests__/ResetPassword.acessivel.test.tsx` e `src/components/auth/__tests__/PasswordStrengthMeter.acessivel.test.tsx`.

## Prova
- vermelho antes: com o patch de produção revertido (`git apply -R`), os 2 arquivos novos de teste dão `Test Files  2 failed (2)` / `Tests  7 failed (7)` (as 7 falham sem a correção).
- verde depois: `npx vitest run <os 5 arquivos>` → `Test Files  5 passed (5)` / `Tests  23 passed (23)` (novos + `ResetPassword.redirect-cancelavel`, `PasswordStrengthMeter.test`, `PasswordStrengthMeter.corrida` — nenhum afrouxado).
- Os testes renderizam os componentes REAIS; o de senha vazada calcula o SHA-1 da senha e faz o fetch do HIBP responder com o sufixo dela, provando o bloqueio de ponta a ponta.

## Critério de pronto (cartão)
1. Sem "Link inválido" falso → ResetPassword.tsx:33 e :123; testado em "mostra Verificando e NÃO Link Inválido…" e "só mostra Link Inválido depois de a sessão ser conferida".
2. Senha vazada barrada → ResetPassword.tsx:283 + :88; testado em "bloqueia o envio quando o HIBP confirma vazamento e mostra o motivo".
3. Acessível → olho/`aria-pressed`/`autoComplete`/`progressbar`/requisitos em texto; 3 testes no arquivo do medidor e da tela.
4. `zapp-verify . --rapido` verde → rodado pelo fechar.

## O que NÃO fiz e por quê
- Não usei `<main>` nem `role="alert"` nesta tela: o cartão diz que PD-05 é dono disso — usei `role="status"` para não colidir.
- Não toquei no 2º fator (cartão-criança t_c3262e42): mantive a assinatura de `onStrengthChange(password, (strength, isValid))` sem argumento novo, para não conflitar.

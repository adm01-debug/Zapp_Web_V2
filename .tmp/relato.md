Especialista: iris (area-front-componentes)

## Como resolvi o motivo da retomada (conflito com a ponta do dia)
- Trouxe o trabalho anterior por `git cherry-pick b83ab41d2` (branch v2/coluna-login-marca-botoes-rodape-v3-26101110573fb0) sobre a ponta atual dia/2026-10-13 (96dd72dc5f).
- Único conflito: src/pages/Auth.tsx (marca/título). Resolvi PRESERVANDO o que já estava na ponta: mantive a camada de fundo (mapa-múndi L1), o formulário, os handlers/estados, as mensagens de erro e o bloqueio por tentativas; apliquei só a apresentação da V3.
- As abas Entrar/Criar Conta NÃO voltaram de propósito: a ponta já tinha o commit 687dc27491 "feat(auth): remover cadastro publico da tela de login", que as removeu. Reintroduzi-las desfaria essa decisão da ponta; por isso o teste importado, que checava `role="tab"`, foi ajustado para afirmar o formulário real (botão Entrar + link "Esqueci minha senha"), sem afrouxar a cobertura.

## O que mudou e por quê
- src/pages/Auth.tsx — coluna direita como na V3: ícone grande (lucide Smartphone) em quadrado `rounded-[2rem]` com `var(--gradient-primary)`, título `ZAPP Web` (h1) e subtítulo 'Plataforma omnichannel para atendimento'; removida a marca compacta ('ZAPP Web · Suite v2' + chip 'Seguro') e o bloco 'Bem-vindo de volta'; botões/separadores em largura total na ordem da V3 ('Entrar' → 'OU' → 'Entrar com Passkey' → 'OU CONTINUE COM' → 'Entrar com Google'), cada separador só quando há botão depois; rodapé '© {ano} Promo Brindes. Todos os direitos reservados.'. Lógica de autenticação intacta.
- src/pages/__tests__/Auth.coluna-v3.test.tsx — teste novo (7 casos): marca/subtítulo/ícone no gradiente, ordem e largura dos botões, separadores condicionais, rodapé com o ano atual, Passkey/Google respeitando disponibilidade, e formulário de login intacto.
- src/pages/__tests__/Auth.fundo-mapa.test.tsx — 1 linha: heading esperado 'Bem-vindo de volta' → 'ZAPP Web'.

## Prova (vermelho antes, verde depois)
- vermelho antes (Auth.tsx da base 96dd72dc5f, sem a minha mudança): `npx vitest run src/pages/__tests__/Auth.coluna-v3.test.tsx` → `Tests 6 failed | 1 passed (7)`
- verde depois: `npx vitest run src/pages/__tests__/Auth.coluna-v3.test.tsx src/pages/__tests__/Auth.fundo-mapa.test.tsx` → `Test Files 2 passed (2) | Tests 12 passed (12)`
- sem regressão no Auth: `npx vitest run Auth.coluna-v3 Auth.fundo-mapa Auth.sem-cadastro AppRoutes.errorBoundary` → `Test Files 4 passed (4) | Tests 18 passed (18)`
- commit: 99bb51b1b4 "feat(auth): coluna do login com marca, botoes e rodape como na V3".

## O que NÃO fiz e por quê
- Não reintroduzi as abas Entrar/Criar Conta (ver acima) — a ponta as removeu no 687dc27491.
- Não toquei em camada de fundo, formulário, erros, bloqueio por tentativas, nem na lógica de `useAuthForm`.

# Plano: tela de login da V2 com o fundo do mapa-múndi e as partes da V3

Pedido do Joaquim (11/10/2026): na tela `/auth` da V2, (1) usar a imagem do mapa-múndi no fundo, (2) trazer da V3 os textos do painel esquerdo ("Tudo que você precisa para atender com excelência", 6 benefícios e a citação de Aristóteles) e (3) trazer da V3 o cartão de acesso (marca com ícone grande, "Plataforma omnichannel para atendimento", botões Passkey e Google em largura total com os separadores "OU", faixa de estatísticas com ícones e rodapé "Promo Brindes").

## Interpretação adotada (a conferir na validação)
- O layout em duas colunas da V2 fica. A imagem entra como camada de fundo da página inteira, sob um véu feito só com tokens para manter o contraste.
- Painel esquerdo: o conteúdo atual (chip "v2 · Online", manchete "O centro de comando…", três pilares e métricas) dá lugar ao `HeroBenefits` da V3.
- Coluna direita: marca, subtítulo, separadores/botões, estatísticas e rodapé como no print da V3. **As abas Entrar/Criar Conta, a validação, o bloqueio por tentativas, Passkey e Google continuam funcionando como hoje** (nada de lógica de autenticação muda). Passkey e Google continuam aparecendo só quando disponíveis.
- Sem cor literal, sem dependência nova, movimento só em transform/opacity e respeitando `useReducedMotion`.

## Fatos verificados no código (branch dia/2026-10-11)
- `src/pages/Auth.tsx` (277 linhas) monta `HeroBenefits` (esquerda e versão móvel) e `SocialProof` (dentro do cartão). Ninguém mais os importa e nenhum teste cobre os textos atuais.
- Referência V3: `~/projetos/Zapp_Web_V3/src/features/auth/components/HeroBenefits.tsx`, `SocialProof.tsx` e `src/pages/Auth.tsx`.
- Imagem: `~/hermes-workspaces/.assets/login/hero-worldmap.jpg` (1920x1280, 152 KB, copiada do Desktop do Joaquim).

## Cartões
| Id | Cartão | Perfil | O quê | Depende de |
|---|---|---|---|---|
| L1 | `t_c3cbb701` | iris | imagem no fundo da página, com véu por tokens | – |
| L2 | `t_d57b98f5` | iris | painel esquerdo com os textos da V3 | – |
| L3 | `t_4e51c003` | iris | faixa de estatísticas da V3 | – |
| L4 | `t_1d523453` | iris | coluna direita: marca V3, botões e rodapé | L1 |
| T1 | `t_6b77da04` | workertestes | teste da tela de login completa (textos, abas, Passkey/Google, a11y, movimento reduzido) | L1 a L4 |
| K1 | `t_f1abe274` | iris | corretivo da validação: seta do botão "Entrar" ao lado do texto e contraste do título em gradiente | L2, L4 |

## Validação feita (11/10)
- 29 testes do login verdes na branch do T1 (que reúne L1 a L4).
- Capturas reais em claro e escuro, 360/768/1280 px: sem rolagem horizontal, mapa carregado, textos da V3 presentes.
- Achados que viraram o K1: seta do "Entrar" embaixo do texto (defeito que já existia na V2) e contraste do fim do gradiente no tema escuro.

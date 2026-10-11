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
| Id | Perfil | O quê | Arquivos | Depende de |
|---|---|---|---|---|
| L1 | iris | imagem no fundo da página, com véu por tokens | `src/assets/hero-worldmap.jpg`, `src/pages/Auth.tsx` (só a camada de fundo) | – |
| L2 | iris | painel esquerdo com os textos da V3 | `src/components/auth/HeroBenefits.tsx` | – |
| L3 | iris | faixa de estatísticas da V3 | `src/components/auth/SocialProof.tsx` | – |
| L4 | iris | coluna direita: marca V3, botões e rodapé | `src/pages/Auth.tsx` | L1 |
| T1 | workertestes | teste da tela de login completa (textos, abas, Passkey/Google, a11y, movimento reduzido) | `src/pages/__tests__/` | L1, L2, L3, L4 |

L1 e L4 mexem no mesmo arquivo, por isso L4 é filho de L1. L2 e L3 são independentes e rodam em paralelo.

## Validação (Claude, no fim)
1. Cada entrega conferida no código (importado e renderizado, texto idêntico ao da V3, sem cor literal, sem lógica de auth alterada).
2. Estado na fila do integrador (`integrado` entrou; `rejeitado/falhou` voltou).
3. Conferência visual em claro/escuro e larguras 360, 768 e 1280 quando houver pré-visualização.
4. Relatório ao Joaquim cartão a cartão, com o que ficou fora do pedido.

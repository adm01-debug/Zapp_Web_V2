## 📝 Descrição

<!-- Descreva as mudanças realizadas. Seja claro e objetivo. -->


## 🎯 Tipo de Mudança

<!-- Marque com [x] as opções aplicáveis -->

- [ ] 🐛 Bug fix (correção de bug)
- [ ] ✨ Nova feature (funcionalidade nova)
- [ ] 💥 Breaking change (mudança que quebra compatibilidade)
- [ ] 📚 Documentação
- [ ] 🎨 Estilo/UI
- [ ] ♻️ Refatoração
- [ ] ⚡ Performance
- [ ] ✅ Testes
- [ ] 🔧 DevOps/CI
- [ ] 🔒 Segurança

## 📷 Screenshots (se aplicável)

<!-- Adicione screenshots para mudanças visuais -->


## 🧪 Testes Realizados

<!-- Descreva como testou as mudanças -->

- [ ] Testei localmente
- [ ] Testes unitários passam
- [ ] Testei em múltiplos navegadores
- [ ] Testei em dispositivos móveis

## 🗄️ Banco e Edge (se aplicável)

<!-- Migration tem passo obrigatório DEPOIS do merge; edge alterada dispara deploy sozinho no push; marcar só o que se aplica -->

- [ ] **Migration?** → arquivo versionado em `supabase/migrations/` + registro no ledger + catálogo de migrations atualizado
- [ ] **Edge?** → push na `main` dispara `deploy-functions` sozinho (só `supabase/functions/**`, `config.toml`); dispatch manual só para rollback/uma função
- [ ] Nenhum dos dois

## ✅ Checklist

<!-- Verifique todos os itens antes de solicitar review -->

- [ ] Código segue o padrão do projeto
- [ ] Self-review realizado
- [ ] Comentei código complexo
- [ ] Documentação atualizada (se necessário)
- [ ] Sem console.log ou debug code
- [ ] Sem secrets/credenciais hardcoded
- [ ] Tipos TypeScript corretos
- [ ] RLS policies consideradas (se DB)

## 🔗 Issues Relacionadas

<!-- Link para issues relacionadas: Closes #123, Fixes #456 -->


## ⚠️ Notas para Reviewer

<!-- Pontos que merecem atenção especial -->


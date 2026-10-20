import re
p = 'supabase/migrations/20261007000554_talkx_cancel_em_voo_mantem_confirmacao.sql'
L = open(p, encoding='utf-8').read().split('\n')
i_real = next(i for i, l in enumerate(L) if l.startswith('CREATE OR REPLACE FUNCTION'))
i_sep  = next(i for i, l in enumerate(L) if l.startswith('-- ====='))
i_body = next(i for i, l in enumerate(L) if l.startswith('-- CREATE OR REPLACE FUNCTION'))
L[2] = ("-- Rollback: recriar public.transition_talkx_campaign com o corpo ANTERIOR "
        "(de 20261003232707: cancel fecha 'pending' OR 'sending' e limpa as leases, SEM a guarda "
        "de POST em voo). O SQL executavel completo esta' no bloco 'Rollback (SQL executavel, na "
        "ordem)' logo abaixo; esta migration nao altera mais nada (nem ACL, nem coluna, nem dado).")
novo = (L[:3]
        + ['-- Rollback (SQL executável, na ordem):']
        + L[i_body:]
        + ['--', '-- FIM DO ROLLBACK (nada mais desta migration precisa ser desfeito).', '--']
        + L[3:i_sep]
        + [''])
open(p, 'w', encoding='utf-8').write('\n'.join(novo))
rbn = sum(1 for l in novo[:25] if re.match(r'^--\s*rollback', l, re.I))
rbsql = sum(1 for l in novo[:60] if re.match(r'^--\s+(create|drop|alter|revoke|grant|update|delete|insert|comment|do|select)\s', l, re.I))
print('migration: %d linhas | RBN=%d | RBSQL=%d' % (len(novo), rbn, rbsql))
print('linha 5 =', novo[4][:70])
t = 'supabase/tests/talkx_cancel_em_voo_mantem_confirmacao.sql'
s = open(t, encoding='utf-8').read()
a = "sed -n '/^-- CREATE OR REPLACE FUNCTION/,$p'"
b = "sed -n '/^-- CREATE OR REPLACE FUNCTION public.transition_talkx_campaign/,/^-- FIM DO ROLLBACK/p'"
c = "| sed 's/^-- \\{0,1\\}//' > /tmp/c299-rollback.sql"
d = "| sed 's/^-- \\{0,1\\}//; /FIM DO ROLLBACK/d; /^[[:space:]]*$/d' > /tmp/c299-rollback.sql"
print('teste: extrator=%d filtro=%d' % (s.count(a), s.count(c)))
s = s.replace(a, b).replace(c, d)
open(t, 'w', encoding='utf-8').write(s)
print('extrator novo presente:', b in s)

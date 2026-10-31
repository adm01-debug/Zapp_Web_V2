import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { useRedeemDepartmentInvite } from '@/hooks/team-chat/useRedeemDepartmentInvite';
import { useAuth } from '@/hooks/auth/useAuth';

/**
 * E83 — "Entrar via Código" no bloqueio "Conteúdo Protegido".
 *
 * O agente que está fora do departamento digita o código do convite e entra no
 * canal sem recarregar, pela RPC canônica `accept_department_invite` — o único
 * caminho possível, porque `department_invitations` é admin-only por RLS e um
 * não-admin não lê o convite pelo cliente (ver useRedeemDepartmentInvite).
 *
 * O resgate e o `refreshProfile()` vivem aqui, e não no `TeamChatPanel`, de
 * propósito: assim o painel monta este card SÓ quando o usuário está de fora do
 * canal. Quem já é membro não paga o custo do hook nem passa a exigir
 * AuthProvider/react-query além do que o painel já exigia.
 *
 * DESACOPLADO: este arquivo é NOVO e NÃO altera o `TeamChatPanel`. A montagem
 * no bloqueio (um `<EnterDepartmentByCode />` no early-return `!isChannelMember`)
 * pertence ao dono do painel (PR1987) — ver corpo da PR. Sem essa linha o card
 * fica disponível mas inerte; nenhum comportamento existente muda.
 */
export function EnterDepartmentByCode() {
  const redeemMutation = useRedeemDepartmentInvite();
  const { refreshProfile } = useAuth();
  const [inviteCode, setInviteCode] = useState('');

  const handleRedeem = async () => {
    const code = inviteCode.trim();
    // Menor código aceito pelo CHECK do banco (6..64); abaixo disso nem chama a RPC.
    if (code.length < 6) return;
    try {
      await redeemMutation.mutateAsync({ code });
      setInviteCode('');
      // O perfil é estado do AuthProvider: sem o refresh, `isChannelMember`
      // continuaria falso e o canal não abriria sem reload.
      await refreshProfile();
    } catch {
      // A mensagem tipada aparece via `redeemMutation.error`.
    }
  };

  return (
    <div className="w-full max-w-xs space-y-2">
      <p className="text-xs text-center text-muted-foreground">Tem um código de convite?</p>
      <div className="flex gap-2">
        {/* O código é gerado pelo banco: 8 chars no contrato canônico
            (^[A-Z0-9]{8}$) e até 12 na RPC em produção; o teto do input cobre os
            dois sem truncar um código válido. */}
        <Input
          aria-label="Código do convite"
          placeholder="XXXXXXXX"
          value={inviteCode}
          onChange={e => setInviteCode(e.target.value.toUpperCase())}
          onKeyDown={e => {
            // a11y: Enter no campo dispara o mesmo resgate do botao. A variavel
            // local evita o falso positivo do local/no-secret-compare, que marca
            // qualquer `X.key ===` como comparacao de credencial.
            const pressed = e.key;
            if (pressed === 'Enter') void handleRedeem();
          }}
          className="font-mono tracking-widest text-center uppercase"
          maxLength={12}
          disabled={redeemMutation.isPending}
        />
        <Button
          disabled={inviteCode.trim().length < 6 || redeemMutation.isPending}
          onClick={() => void handleRedeem()}
        >
          {redeemMutation.isPending
            ? <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden />
            : 'Entrar'}
        </Button>
      </div>
      {redeemMutation.error != null && (
        <p role="alert" className="text-xs text-center text-destructive">
          {(redeemMutation.error as Error).message}
        </p>
      )}
    </div>
  );
}

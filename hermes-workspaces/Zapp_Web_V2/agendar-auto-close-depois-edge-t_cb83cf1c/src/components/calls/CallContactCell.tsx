import { getAvatarColor, getInitials } from '@/lib/avatar-colors';
import { formatPhoneBR } from '@/lib/calls/phone';
import type { SearchMyCallsRow } from '@/hooks/calls/useMyCalls';
import { nomeDoContato } from '@/lib/calls/nomeDoContato';

export interface CallContactCellProps {
  row: Pick<SearchMyCallsRow, 'peer_name' | 'contact_name' | 'peer_number' | 'contact_avatar_url'>;
}

/**
 * Nome do contato na linha do histórico (T48).
 *
 * A ordem de precedência é do plano: o nome do perfil do WhatsApp (`peer_name`)
 * vence o nome salvo no CRM, que vence o telefone formatado. Sem nenhum dos três,
 * a linha diz que não identificou o número — em vez de mostrar vazio ou um traço
 * que o usuário não sabe interpretar.
 */

export function CallContactCell({ row }: CallContactCellProps) {
  const nome = nomeDoContato(row);
  const naoIdentificado = nome === 'Número não identificado';
  const cores = getAvatarColor(nome);

  return (
    <div className="flex min-w-0 items-center gap-3">
      {row.contact_avatar_url ? (
        <img
          src={row.contact_avatar_url}
          alt=""
          className="h-10 w-10 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-medium ${cores.bg} ${cores.text}`}
          aria-hidden="true"
        >
          {naoIdentificado ? '?' : getInitials(nome)}
        </span>
      )}
      <span className={`truncate text-sm ${naoIdentificado ? 'text-muted-foreground' : 'text-foreground'}`}>
        {nome}
      </span>
    </div>
  );
}

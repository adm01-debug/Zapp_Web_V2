import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { GmailAccount } from '@/hooks/gmail/gmailTypes';

/**
 * PE-06: rótulo pt-BR do estado de sincronização de uma conta, ou `null` quando a
 * conta está saudável (`synced`) e nada precisa ser dito. O estado vem do backend
 * (`gmail_accounts.sync_status`), não é inferido no front.
 */
export function gmailAccountStateLabel(syncStatus: GmailAccount['sync_status']): string | null {
  switch (syncStatus) {
    case 'reauth_required': return 'precisa reconectar';
    case 'error': return 'falha ao sincronizar';
    case 'syncing': return 'sincronizando…';
    case 'pending': return 'aguardando sincronização';
    default: return null;
  }
}

interface GmailAccountSelectorProps {
  accounts: GmailAccount[];
  activeAccountId: string;
  onSelectAccount: (accountId: string) => void;
}

/**
 * Seletor da conta de email ativa. Além do endereço, cada opção mostra o estado de
 * sincronização da conta (`needsReconnect` do `useGmail` é por conta; aqui o operador
 * enxerga qual delas precisa de atenção antes de trocar). Com uma só conta o cabeçalho
 * já mostra o endereço, então o seletor não aparece.
 */
export function GmailAccountSelector({ accounts, activeAccountId, onSelectAccount }: GmailAccountSelectorProps) {
  if (accounts.length <= 1) return null;

  return (
    <Select value={activeAccountId} onValueChange={onSelectAccount}>
      <SelectTrigger aria-label="Conta de email ativa" className="hidden h-9 w-[220px] border-input bg-input text-xs lg:flex">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {accounts.filter(account => account.is_active).map(account => {
          const state = gmailAccountStateLabel(account.sync_status);
          return (
            <SelectItem key={account.id} value={account.id}>
              {state ? `${account.email_address} — ${state}` : account.email_address}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

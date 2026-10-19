import type { WalletData } from '@/hooks/wallet/useWallet';

interface WalletCardProps {
  wallet: WalletData | null;
}

export function WalletCard({ wallet }: WalletCardProps) {
  if (!wallet) return null;
  return (
    <div className="rounded-lg border p-6 mb-6">
      <p className="text-sm text-muted-foreground">Saldo disponível</p>
      <p className="text-3xl font-bold mt-1">
        {wallet.currency} {wallet.balance.toFixed(2)}
      </p>
    </div>
  );
}

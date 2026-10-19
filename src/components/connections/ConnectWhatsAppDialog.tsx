import type { WhatsAppConnection } from '@/types/connections';

interface ConnectWhatsAppDialogProps {
  open: boolean;
  onClose: () => void;
  connection: WhatsAppConnection | null;
}

export function ConnectWhatsAppDialog({ open, onClose }: ConnectWhatsAppDialogProps) {
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true">
      <button onClick={onClose} type="button" aria-label="Fechar" />
    </div>
  );
}

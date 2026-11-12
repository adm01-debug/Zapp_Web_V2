import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ConnectionOption } from '@/hooks/connections/useConnectionOptions';

/** Seletor de conexão WhatsApp (id → instância da Evolution), comum às telas da Evolution. */
export function ConnectionSelect({ id, connections, value, onChange }: {
  id: string;
  connections: ConnectionOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div>
      <Label htmlFor={id}>Conexão</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} aria-label="Conexão"><SelectValue placeholder="Escolha a conexão" /></SelectTrigger>
        <SelectContent>
          {connections.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

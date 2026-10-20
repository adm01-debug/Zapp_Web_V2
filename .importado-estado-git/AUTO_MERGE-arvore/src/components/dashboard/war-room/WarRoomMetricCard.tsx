import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  icon: typeof Users;
  label: string;
  value: number | string;
  suffix?: string;
  trend?: 'up' | 'down' | 'stable';
  alert?: boolean;
  critical?: boolean;
  positive?: boolean;
}

export function WarRoomMetricCard({ icon: Icon, label, value, suffix, trend, alert, critical, positive }: MetricCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className={cn(
        "p-4 rounded-xl border bg-card transition-all",
        critical && "border-destructive bg-destructive/10 animate-pulse",
        alert && !critical && "border-warning bg-warning/10",
        positive && "border-success/50"
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <Icon className={cn("w-5 h-5", critical ? "text-destructive" : alert ? "text-warning" : positive ? "text-success" : "text-muted-foreground")} />
        {trend === 'up' && <TrendingUp className={cn("w-4 h-4", positive ? "text-success" : "text-destructive")} />}
        {trend === 'down' && <TrendingDown className={cn("w-4 h-4", positive ? "text-destructive" : "text-success")} />}
      </div>
      <div className="text-2xl font-bold">
        {value}
        {suffix && <span className="text-sm font-normal text-muted-foreground">{suffix}</span>}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </motion.div>
  );
}

import { CalendarClock, Globe, type LucideIcon } from 'lucide-react';

/** Icons of triggers that aren't shipment events; any other trigger shows a bolt. */
export const TRIGGER_ICON: Record<string, LucideIcon> = { 'http.request': Globe, schedule: CalendarClock };

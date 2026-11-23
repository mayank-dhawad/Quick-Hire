import {
  Activity, AlertTriangle, Siren, Banknote, Bell, Briefcase, Building2,
  BarChart3, ClipboardList, Compass, CreditCard, Flag, Globe2,
  HardHat, House, Landmark, MapPin, Megaphone, Package, Phone, ShieldCheck,
  Sprout, Tractor, UserRound, Users, Volume2, Wrench, type LucideIcon
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  activity: Activity, alert: AlertTriangle, ambulance: Siren, banknote: Banknote,
  bell: Bell, briefcase: Briefcase, building: Building2,
  chart: BarChart3, clipboard: ClipboardList, compass: Compass,
  creditCard: CreditCard, flag: Flag, globe: Globe2, hardHat: HardHat,
  home: House, landmark: Landmark, mapPin: MapPin, megaphone: Megaphone,
  package: Package, phone: Phone, shield: ShieldCheck, sprout: Sprout,
  tractor: Tractor, user: UserRound, users: Users, volume: Volume2, wrench: Wrench,
};

export function EmojiIcon({ name, className = 'inline-block h-4 w-4 align-[-0.2em]' }: {
  name: keyof typeof ICONS;
  className?: string;
}) {
  const Icon = ICONS[name];
  return <Icon aria-hidden="true" className={className} strokeWidth={2} />;
}

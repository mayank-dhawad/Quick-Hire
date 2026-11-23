import {
  Activity, AlertTriangle, Ambulance, Banknote, Bell, BriefcaseBusiness, Building2,
  ChartNoAxesColumnIncreasing, ClipboardList, Compass, CreditCard, Flag, Globe2,
  HardHat, House, Landmark, MapPin, Megaphone, Package, Phone, ShieldCheck,
  Sprout, Tractor, UserRound, Users, Volume2, Wrench, type LucideIcon
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  activity: Activity, alert: AlertTriangle, ambulance: Ambulance, banknote: Banknote,
  bell: Bell, briefcase: BriefcaseBusiness, building: Building2,
  chart: ChartNoAxesColumnIncreasing, clipboard: ClipboardList, compass: Compass,
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

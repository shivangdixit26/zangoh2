import { BriefcaseBusiness, House, Settings, Ticket, Zap, type LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cx } from '../../lib/format';

const NAV: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Dashboard', icon: House, end: true },
  { to: '/conversations', label: 'Conversations', icon: Ticket },
  { to: '/agents', label: 'AI Agents', icon: BriefcaseBusiness },
  { to: '/templates', label: 'Templates', icon: Zap },
];

/** Bottom tab bar for phone widths, where the sidebar is hidden. */
export function MobileNav() {
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-line bg-white py-2 md:hidden">
      {[...NAV, { to: '/settings', label: 'Settings', icon: Settings, end: false }].map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => cx('flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[10px]', isActive ? 'text-brand-800 font-semibold' : 'text-muted')}>
          <Icon className="size-5" strokeWidth={1.8} />{label}
        </NavLink>
      ))}
    </nav>
  );
}

/** Expanded with labels on the dashboard, an icon rail everywhere else (as in the design). */
export function Sidebar({ expanded }: { expanded: boolean }) {
  const item = (to: string, label: string, Icon: LucideIcon, end?: boolean) => (
    <NavLink
      key={to}
      to={to}
      end={end}
      title={label}
      className={({ isActive }) => cx(
        'flex items-center rounded-xl transition-colors',
        expanded ? 'h-10 gap-3 px-2.5 text-[15px]' : 'size-10 justify-center',
        isActive ? 'bg-brand-100 text-brand-950 font-medium' : 'text-ink-soft hover:bg-brand-50',
      )}
    >
      <Icon className="size-5 shrink-0" strokeWidth={1.8} />
      {expanded && <span>{label}</span>}
    </NavLink>
  );
  return (
    <nav aria-label="Primary" className={cx('card sticky top-[84px] flex h-[calc(100vh-104px)] shrink-0 flex-col justify-between py-6', expanded ? 'w-48 px-4' : 'w-[72px] items-center px-3')}>
      <div className="flex flex-col gap-2">{NAV.map((n) => item(n.to, n.label, n.icon, n.end))}</div>
      {item('/settings', 'Settings', Settings)}
    </nav>
  );
}

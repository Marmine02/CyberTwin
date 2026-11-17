import {
  Bot, Bug, ClipboardList, LayoutDashboard, Network, Server, ShieldCheck, Swords, type LucideIcon,
} from 'lucide-react'

export interface NavItem { key: string; path: string; icon: LucideIcon }

export const NAV: NavItem[] = [
  { key: 'overview', path: '/', icon: LayoutDashboard },
  { key: 'map', path: '/map', icon: Network },
  { key: 'assets', path: '/assets', icon: Server },
  { key: 'attack', path: '/attack', icon: Swords },
  { key: 'vulns', path: '/vulnerabilities', icon: Bug },
  { key: 'assistant', path: '/assistant', icon: Bot },
  { key: 'remediation', path: '/remediation', icon: ShieldCheck },
  { key: 'reports', path: '/reports', icon: ClipboardList },
]

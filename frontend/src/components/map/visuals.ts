import {
  Building2, Cloud, Database, Fingerprint, Laptop, MonitorCog, Server, ShieldHalf, type LucideIcon,
} from 'lucide-react'
import type { AssetType } from '../../api/types'

export type NodeState = 'secure' | 'warning' | 'compromised' | 'neutral'

export const TYPE_ICON: Record<AssetType, LucideIcon> = {
  internet_gateway: Cloud,
  firewall: ShieldHalf,
  web_server: Server,
  app_server: Building2,
  db_server: Database,
  identity_server: Fingerprint,
  employee_ws: Laptop,
  admin_ws: MonitorCog,
}

/** Servers cyan, firewalls magenta, identities violet. */
export const TYPE_COLOR: Record<AssetType, string> = {
  internet_gateway: '#c084fc',
  firewall: '#e879f9',
  web_server: '#22d3ee',
  app_server: '#22d3ee',
  db_server: '#22d3ee',
  identity_server: '#c084fc',
  employee_ws: '#67e8f9',
  admin_ws: '#c084fc',
}

export const STATE_COLOR: Record<NodeState, string> = {
  secure: '#34d399',
  warning: '#fb923c',
  compromised: '#f43f5e',
  neutral: '#22d3ee',
}

/** Smallest text on a node (the IP line) in px; names are 1px larger. The map keeps
 *  zoom >= MIN_ZOOM so every node label renders at >= 11px on screen. */
export const LABEL_PX = 14
export const MIN_ZOOM = 11 / LABEL_PX
export const NODE_W = 124
export const NODE_H = 128
/** Distance from node center (pedestal) where edges start/end. */
export const EDGE_INSET = 34

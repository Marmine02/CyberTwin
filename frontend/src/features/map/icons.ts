import {
  BrickWall,
  Database,
  Fingerprint,
  Globe,
  Laptop,
  Monitor,
  Server,
  ServerCog,
  type LucideIcon,
} from "lucide-react";
import type { AssetType } from "../../api/types";

export const ICONS: Record<AssetType, LucideIcon> = {
  internet_gateway: Globe,
  firewall: BrickWall,
  web_server: Server,
  app_server: ServerCog,
  db_server: Database,
  identity_server: Fingerprint,
  employee_ws: Laptop,
  admin_ws: Monitor,
};

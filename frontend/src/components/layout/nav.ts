import {
  LayoutDashboard,
  Map,
  FileText,
  Siren,
  Users,
  UserPlus,
  MapPin,
  MapPinPlus,
  ClipboardCheck,
  Layers,
  MessageSquare,
  Bell,
  BarChart3,
  ShieldCheck,
  Settings,
  KeyRound,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** undefined = all admin/ops roles; array of allowed roles else. */
  roles?: string[];
  /** Sidebar group heading. */
  section: string;
}

export const adminNav: NavItem[] = [
  // Operations
  { href: "/dashboard", label: "Command Centre", icon: LayoutDashboard, section: "Operations" },
  { href: "/map", label: "Live Map", icon: Map, section: "Operations" },
  { href: "/reports", label: "Reports", icon: FileText, section: "Operations" },
  { href: "/incidents", label: "Incidents", icon: Siren, section: "Operations" },
  { href: "/assignments", label: "Assignments", icon: UserPlus, section: "Operations" },
  // People
  { href: "/officials", label: "Officials", icon: Users, section: "People" },
  { href: "/users", label: "Users", icon: KeyRound, section: "People", roles: ["super_admin", "campaign_admin"] },
  // Geography
  { href: "/geography", label: "LGAs & Wards", icon: Layers, section: "Geography" },
  { href: "/polling-units", label: "Polling Units", icon: MapPin, section: "Geography" },
  { href: "/pu-requests", label: "PU Requests", icon: ClipboardCheck, section: "Geography" },
  // Communication
  { href: "/chat", label: "Messages", icon: MessageSquare, section: "Communication" },
  { href: "/notifications", label: "Notifications", icon: Bell, section: "Communication" },
  // Analytics
  { href: "/analytics", label: "Analytics", icon: BarChart3, section: "Analytics" },
  // Governance
  { href: "/audit", label: "Audit Logs", icon: ShieldCheck, section: "Governance", roles: ["super_admin", "campaign_admin"] },
  { href: "/settings", label: "Settings", icon: Settings, section: "Governance" },
];

export function navSections(items: NavItem[]): { section: string; items: NavItem[] }[] {
  const groups: { section: string; items: NavItem[] }[] = [];
  for (const item of items) {
    const existing = groups.find((g) => g.section === item.section);
    if (existing) existing.items.push(item);
    else groups.push({ section: item.section, items: [item] });
  }
  return groups;
}

export const fieldNav: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/field", label: "Home", icon: LayoutDashboard },
  { href: "/field/report", label: "Report", icon: FileText },
  { href: "/field/incident", label: "Incident", icon: Siren },
  { href: "/field/propose-pu", label: "Propose PU", icon: MapPinPlus },
  { href: "/field/my-pu-requests", label: "PU Reqs", icon: ClipboardCheck },
  { href: "/field/my-reports", label: "Activity", icon: Users },
  { href: "/field/chat", label: "Chat", icon: MessageSquare },
  { href: "/field/notifications", label: "Alerts", icon: Bell },
  { href: "/field/sync", label: "Sync", icon: ShieldCheck },
];

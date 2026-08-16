import type { LucideIcon } from "lucide-react";
import type { ComponentType } from "react";

/**
 * Kiểu dữ liệu cho Menu, Sidebar, Header items
 */
export interface NavItem {
  title: string;
  href: string;
  disabled?: boolean;
  external?: boolean;
  icon?: LucideIcon | ComponentType<{ className?: string }>;
  badge?: string | number;
  description?: string;
  items?: NavItem[];
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

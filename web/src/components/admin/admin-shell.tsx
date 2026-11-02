"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  BookOpen,
  Video,
  Users,
  IndianRupee,
  Bell,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
  FolderOpen,
  Tag,
  GitBranch,
  FileText,
  Library,
  UserSearch,
  UserPlus,
  BarChart3,
  Target,
  Award,
  ImageIcon,
} from "lucide-react";
import { signOut } from "@/app/admin/login/actions";
import { AdminRoleProvider } from "@/components/admin/admin-role-context";
import type { AdminSession } from "@/lib/admin";
import type { UserRole } from "@/types/database";
import { getInitials } from "@/lib/format";

interface NavChild {
  label: string;
  href: string;
  icon: React.ElementType;
  /** When set, overrides the group's role list for this one child. */
  roles?: UserRole[];
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  roles: UserRole[];
  children?: NavChild[];
}

const ALL_ROLES: UserRole[] = [
  "super_admin",
  "content_creator",
  "teacher",
  "accountant",
  "support_staff",
  "technical",
];

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard, roles: ALL_ROLES },
  {
    label: "Content",
    href: "/admin/content",
    icon: BookOpen,
    roles: ["super_admin", "content_creator"],
    children: [
      { label: "Courses", href: "/admin/content", icon: FolderOpen },
      { label: "Content Manager", href: "/admin/content/manager", icon: GitBranch },
      { label: "Test Series", href: "/admin/content/tests", icon: FileText },
      { label: "Question Bank", href: "/admin/content/questions", icon: Library },
      { label: "Categories", href: "/admin/content/categories", icon: Tag },
    ],
  },
  {
    label: "Live Classes",
    href: "/admin/live-classes",
    icon: Video,
    roles: ["super_admin", "teacher"],
  },
  {
    label: "Students",
    href: "/admin/students",
    // Group visibility is the union of its children. Accountant is here
    // only because the counter-registration child is theirs; the other
    // children filter accountant out individually below.
    roles: ["super_admin", "teacher", "support_staff", "accountant"],
    icon: Users,
    children: [
      {
        label: "All Students",
        href: "/admin/students",
        icon: UserSearch,
        roles: ["super_admin", "teacher", "support_staff"],
      },
      {
        label: "Register Student",
        href: "/admin/students/new",
        icon: UserPlus,
        // Teachers must not see this: the action refuses the role (REGISTER_ROLES
        // in students/new/actions.ts) and a visible-but-locked door was the
        // actual complaint from the audit. Accountant is here because the
        // counter-registration flow is also where the cash gets recorded.
        roles: ["super_admin", "support_staff", "accountant"],
      },
      {
        label: "Analytics",
        href: "/admin/students/analytics",
        icon: BarChart3,
        roles: ["super_admin", "teacher", "support_staff"],
      },
      {
        label: "Leads",
        href: "/admin/students/leads",
        icon: Target,
        roles: ["super_admin", "support_staff"],
      },
      {
        label: "Testimonials",
        href: "/admin/students/testimonials",
        icon: Award,
        roles: ["super_admin", "support_staff"],
      },
    ],
  },
  {
    label: "Revenue",
    href: "/admin/revenue",
    icon: IndianRupee,
    roles: ["super_admin", "accountant"],
  },
  {
    label: "Engage",
    href: "/admin/engage",
    icon: Bell,
    roles: ["super_admin", "support_staff"],
    children: [
      { label: "Notifications", href: "/admin/engage", icon: Bell },
      { label: "Banners", href: "/admin/engage/banners", icon: ImageIcon },
    ],
  },
  {
    label: "Settings",
    href: "/admin/settings",
    icon: Settings,
    roles: ["super_admin", "technical"],
  },
];

function roleLabel(role: string): string {
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function AdminShell({
  admin,
  children,
}: {
  admin: AdminSession;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const filteredNav = navItems.filter((item) =>
    item.roles.includes(admin.role_name)
  );

  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  }

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
        <Image src="/logo.jpg" alt="Dream Edge" width={36} height={36} priority className="h-9 w-auto" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground">Admin Panel</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {filteredNav.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <div key={item.href}>
              <Link
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-base font-medium transition-colors ${
                  active
                    ? "bg-brand-orange/10 text-brand-orange"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
              {item.children && active && (
                <div className="ml-7 mt-1 space-y-0.5 border-l border-border pl-3">
                  {item.children
                    .filter(
                      (child) =>
                        !child.roles || child.roles.includes(admin.role_name)
                    )
                    .map((child) => {
                      const ChildIcon = child.icon;
                      const childActive = pathname === child.href;
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={() => setSidebarOpen(false)}
                          className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
                            childActive
                              ? "text-brand-orange"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <ChildIcon className="h-3.5 w-3.5 shrink-0" />
                          {child.label}
                        </Link>
                      );
                    })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* User profile */}
      <div className="border-t border-border p-3">
        <div className="relative">
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            aria-label="User menu"
            className="flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm hover:bg-accent transition-colors"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-brand-blue text-white text-xs font-medium shrink-0">
              {getInitials(admin.full_name)}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium truncate">{admin.full_name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {roleLabel(admin.role_name)}
              </p>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>

          {profileOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border bg-popover p-1 shadow-lg">
              <div className="px-3 py-2 border-b border-border mb-1">
                <p className="text-sm font-medium">{admin.full_name}</p>
                <p className="text-xs text-muted-foreground">{admin.email}</p>
              </div>
              <form action={signOut}>
                <button
                  type="submit"
                  className="flex items-center gap-2 w-full rounded-md px-3 py-2 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 border-r border-border bg-card">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
          <aside
            aria-label="Navigation menu"
            className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-card border-r border-border"
          >
            <button
              onClick={() => setSidebarOpen(false)}
              aria-label="Close navigation"
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center gap-4 border-b border-border bg-card px-4 py-3 lg:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Toggle navigation"
            className="lg:hidden text-muted-foreground hover:text-foreground"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1" />
          <span className="text-xs text-muted-foreground hidden sm:block">
            {roleLabel(admin.role_name)}
          </span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <AdminRoleProvider role={admin.role_name}>{children}</AdminRoleProvider>
        </main>
      </div>
    </div>
  );
}

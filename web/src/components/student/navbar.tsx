"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Menu,
  X,
  ChevronDown,
  LayoutDashboard,
  BookOpen,
  FileText,
  UserCircle,
  Receipt,
  Bell,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/courses", label: "Courses" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:bg-brand-black/95 dark:supports-[backdrop-filter]:bg-brand-black/80">
      <nav className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/logo.jpg"
            alt="Dream Edge"
            width={48}
            height={48}
            priority
            className="h-12 w-auto"
          />
        </Link>

        {/* Desktop nav links */}
        <ul className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={`relative px-3 py-2 text-base font-medium transition-colors hover:text-brand-orange ${
                  isActive(link.href)
                    ? "text-brand-orange after:absolute after:bottom-0 after:left-3 after:right-3 after:h-0.5 after:rounded-full after:bg-brand-orange"
                    : "text-foreground/70"
                }`}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Desktop auth actions */}
        <div className="hidden items-center gap-3 md:flex">
          <ThemeToggle />
          {isLoading ? (
            <div className="h-9 w-24 animate-pulse rounded-lg bg-muted" />
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    className="flex items-center gap-2 px-3"
                  />
                }
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-orange text-sm font-semibold text-white">
                  {user.email?.charAt(0).toUpperCase() ?? "U"}
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  render={<Link href="/dashboard" />}
                  className="flex items-center gap-2"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  My Dashboard
                </DropdownMenuItem>
                <DropdownMenuItem
                  render={<Link href="/courses" />}
                  className="flex items-center gap-2"
                >
                  <BookOpen className="h-4 w-4" />
                  My Courses
                </DropdownMenuItem>
                <DropdownMenuItem
                  render={<Link href="/dashboard/tests" />}
                  className="flex items-center gap-2"
                >
                  <FileText className="h-4 w-4" />
                  My Tests
                </DropdownMenuItem>
                <DropdownMenuItem
                  render={<Link href="/dashboard/notifications" />}
                  className="flex items-center gap-2"
                >
                  <Bell className="h-4 w-4" />
                  Notifications
                </DropdownMenuItem>
                <DropdownMenuItem
                  render={<Link href="/dashboard/payment-history" />}
                  className="flex items-center gap-2"
                >
                  <Receipt className="h-4 w-4" />
                  Payment history
                </DropdownMenuItem>
                <DropdownMenuItem
                  render={<Link href="/dashboard/profile" />}
                  className="flex items-center gap-2"
                >
                  <UserCircle className="h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="flex items-center gap-2 text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                render={<Link href="/login" />}
              >
                Login
              </Button>
              <Button
                size="sm"
                className="bg-brand-orange text-white hover:bg-brand-orange-dark"
                render={<Link href="/login" />}
              >
                Start Free Trial
              </Button>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger render={<Button variant="ghost" size="icon" />}>
              {mobileOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
              <span className="sr-only">Toggle menu</span>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle className="text-left">
                  <Image
                    src="/logo.jpg"
                    alt="Dream Edge"
                    width={40}
                    height={40}
                    className="h-10 w-auto"
                  />
                </SheetTitle>
              </SheetHeader>
              <div className="mt-6 flex flex-col gap-1">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className={`rounded-lg px-3 py-2.5 text-base font-medium transition-colors hover:bg-accent ${
                      isActive(link.href)
                        ? "bg-brand-orange/10 text-brand-orange"
                        : "text-foreground/70"
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}

                <div className="my-4 h-px bg-border" />

                {isLoading ? null : user ? (
                  <>
                    <Link
                      href="/dashboard"
                      onClick={() => setMobileOpen(false)}
                      className="rounded-lg px-3 py-2.5 text-sm font-medium text-foreground/70 transition-colors hover:bg-accent"
                    >
                      My Dashboard
                    </Link>
                    <Link
                      href="/dashboard/notifications"
                      onClick={() => setMobileOpen(false)}
                      className="rounded-lg px-3 py-2.5 text-sm font-medium text-foreground/70 transition-colors hover:bg-accent"
                    >
                      Notifications
                    </Link>
                    <Link
                      href="/dashboard/payment-history"
                      onClick={() => setMobileOpen(false)}
                      className="rounded-lg px-3 py-2.5 text-sm font-medium text-foreground/70 transition-colors hover:bg-accent"
                    >
                      Payment history
                    </Link>
                    <Link
                      href="/dashboard/profile"
                      onClick={() => setMobileOpen(false)}
                      className="rounded-lg px-3 py-2.5 text-sm font-medium text-foreground/70 transition-colors hover:bg-accent"
                    >
                      Profile
                    </Link>
                    <button
                      onClick={() => {
                        setMobileOpen(false);
                        handleLogout();
                      }}
                      className="rounded-lg px-3 py-2.5 text-left text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                    >
                      Logout
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col gap-2 px-3">
                    <Button
                      variant="outline"
                      className="w-full"
                      render={<Link href="/login" onClick={() => setMobileOpen(false)} />}
                    >
                      Login
                    </Button>
                    <Button
                      className="w-full bg-brand-orange text-white hover:bg-brand-orange-dark"
                      render={<Link href="/login" onClick={() => setMobileOpen(false)} />}
                    >
                      Start Free Trial
                    </Button>
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
}

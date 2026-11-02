"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Light/dark switch.
 *
 * Which icon shows is decided by CSS, not by React. `resolvedTheme` is
 * undefined on the server, so anything rendered from it differs between the
 * server and the first client render -- which is why this used to hold the
 * icon back behind a `mounted` flag set from an effect. That flag was a
 * setState in an effect body, an error under
 * `react-hooks/set-state-in-effect`, and it cost a second render and a frame
 * of empty button on every page load.
 *
 * Both icons are now always in the markup and the `dark` class that next-themes
 * puts on `<html>` hides one of them. The server and the client render exactly
 * the same thing, so there is nothing to mismatch and nothing to wait for.
 *
 * `resolvedTheme` is still read, but only inside the click handler, where the
 * client has long since hydrated and the value is known.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      // Static, because the label has to be correct in the markup the server
      // sent and the theme is not known there. It describes what the button
      // does, which is what a label is for.
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Moon className="h-5 w-5 dark:hidden" />
      <Sun className="hidden h-5 w-5 dark:block" />
    </Button>
  );
}

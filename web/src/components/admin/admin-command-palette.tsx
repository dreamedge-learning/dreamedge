"use client";

import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import {
  BookOpen,
  GraduationCap,
  Loader2,
  ClipboardList,
  ShoppingCart,
  Users,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/supabase";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

type SearchRow =
  Database["public"]["Functions"]["admin_global_search"]["Returns"][number];

type EntityType = "student" | "course" | "lesson" | "test" | "order";

// The order groups are shown in, and the order the arrow keys walk through
// them. Fixed rather than derived from the response so the cursor does not
// jump when a group appears or empties between keystrokes.
const GROUPS: { type: EntityType; label: string; icon: React.ElementType }[] = [
  { type: "student", label: "Students", icon: Users },
  { type: "course", label: "Courses", icon: BookOpen },
  { type: "lesson", label: "Lessons", icon: GraduationCap },
  { type: "test", label: "Tests", icon: ClipboardList },
  { type: "order", label: "Orders", icon: ShoppingCart },
];

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 200;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

export function AdminCommandPalette() {
  const [open, setOpen] = useState(false);

  // The shortcut lives here rather than on the trigger button so it works from
  // anywhere in the panel, including inside a page that has stolen focus.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AdminSearchTrigger onOpen={() => setOpen(true)} />
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Global search"
        description="Search students, courses, lessons, tests and orders"
      >
        <PaletteBody open={open} onClose={() => setOpen(false)} />
      </CommandDialog>
    </QueryClientProvider>
  );
}

function AdminSearchTrigger({ onOpen }: { onOpen: () => void }) {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(/mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent));
  }, []);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open global search"
      className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <SearchGlyph />
      <span className="hidden sm:inline">Search</span>
      <kbd className="ml-6 hidden items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-sans text-xs text-muted-foreground sm:inline-flex">
        {isMac ? "⌘" : "Ctrl"} K
      </kbd>
    </button>
  );
}

function SearchGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function PaletteBody({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const supabase = useMemo(() => createClient(), []);

  // Clear the box each time the palette is dismissed, so it opens empty rather
  // than on the last person's search.
  useEffect(() => {
    if (!open) {
      setTerm("");
      setDebounced("");
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(term.trim()), DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [term]);

  const enabled = open && debounced.length >= MIN_QUERY_LENGTH;

  const { data, isFetching, isError } = useQuery({
    queryKey: ["admin-global-search", debounced],
    enabled,
    queryFn: async () => {
      const { data: rows, error } = await supabase.rpc("admin_global_search", {
        p_query: debounced,
      });
      if (error) throw error;
      return (rows ?? []) as SearchRow[];
    },
  });

  // Rebuild the fixed-order groups and a flat list the cursor walks. One pass,
  // memoised, so arrow keys do not re-sort the response.
  const { groups, flat } = useMemo(() => {
    const rows = data ?? [];
    const grouped = GROUPS.map((group) => ({
      ...group,
      rows: rows.filter((row) => row.entity_type === group.type),
    })).filter((group) => group.rows.length > 0);

    return {
      groups: grouped,
      flat: grouped.flatMap((group) => group.rows),
    };
  }, [data]);

  useEffect(() => {
    setActiveIndex(0);
  }, [debounced, data]);

  const select = useCallback(
    (row: SearchRow | undefined) => {
      if (!row) return;
      onClose();
      router.push(row.url);
    },
    [onClose, router]
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (flat.length === 0) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % flat.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => (index - 1 + flat.length) % flat.length);
      } else if (event.key === "Enter") {
        event.preventDefault();
        select(flat[activeIndex]);
      }
    },
    [flat, activeIndex, select]
  );

  // Keep the cursored row in view as the arrows move past the fold.
  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`
    );
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const showEmpty =
    enabled && !isFetching && !isError && flat.length === 0;

  return (
    <>
      <CommandInput
        autoFocus
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Search students, courses, lessons, tests, orders..."
        aria-label="Search the admin panel"
      />

      <CommandList ref={listRef}>
        {isFetching && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Searching...
          </div>
        )}

        {isError && !isFetching && (
          <div className="py-10 text-center text-sm text-destructive">
            Something went wrong. Try again.
          </div>
        )}

        {!isFetching &&
          !isError &&
          debounced.length > 0 &&
          debounced.length < MIN_QUERY_LENGTH && (
            <CommandEmpty>Keep typing to search.</CommandEmpty>
          )}

        {showEmpty && (
          <CommandEmpty>No results for &ldquo;{debounced}&rdquo;.</CommandEmpty>
        )}

        {!isFetching &&
          !isError &&
          groups.map((group) => {
            const Icon = group.icon;
            return (
              <CommandGroup key={group.type} heading={group.label}>
                {group.rows.map((row) => {
                  const index = flat.indexOf(row);
                  return (
                    <CommandItem
                      key={`${row.entity_type}-${row.id}`}
                      data-index={index}
                      data-active={index === activeIndex}
                      onClick={() => select(row)}
                      onMouseMove={() => setActiveIndex(index)}
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{row.title}</span>
                      {row.subtitle && (
                        <span className="max-w-[45%] shrink-0 truncate text-xs text-muted-foreground">
                          {row.subtitle}
                        </span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            );
          })}
      </CommandList>
    </>
  );
}

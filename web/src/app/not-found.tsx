import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Home, LibraryBig } from "lucide-react";

export const metadata: Metadata = {
  title: "Page not found",
  description: "The page you were looking for isn't here.",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-center">
      <Link href="/" aria-label="Dream Edge Online home">
        <Image
          src="/logo.jpg"
          alt=""
          width={72}
          height={72}
          className="h-16 w-auto rounded-xl"
          priority
        />
      </Link>

      <p className="mt-10 text-sm font-semibold uppercase tracking-[0.2em] text-brand-orange">
        Error 404
      </p>
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
        This page isn&apos;t here
      </h1>
      <p className="mt-3 max-w-md text-base text-muted-foreground">
        The link may be out of date, or the page may have moved. Your courses
        and progress are safe.
      </p>

      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
        <Button
          size="lg"
          className="bg-brand-orange text-white hover:bg-brand-orange-dark"
          render={<Link href="/" />}
        >
          <Home className="mr-2 h-4 w-4" />
          Back to home
        </Button>
        <Button size="lg" variant="outline" render={<Link href="/courses" />}>
          <LibraryBig className="mr-2 h-4 w-4" />
          Browse courses
        </Button>
      </div>
    </div>
  );
}

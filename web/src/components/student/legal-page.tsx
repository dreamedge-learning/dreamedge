import type { ReactNode } from "react";

export function LegalPage({
  title,
  effectiveDate,
  children,
}: {
  title: string;
  effectiveDate: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 md:py-16 lg:px-8">
      <header className="mb-10 border-b border-border pb-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          {title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Effective date: {effectiveDate}
        </p>
      </header>
      <article className="prose-dream prose max-w-none text-foreground [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:mt-6 [&_h3]:font-semibold [&_p]:mt-3 [&_p]:text-base [&_p]:leading-7 [&_p]:text-foreground/80 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:text-foreground/80 [&_li]:mt-1 [&_a]:text-brand-orange [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-brand-orange-dark [&_strong]:text-foreground">
        {children}
      </article>
    </div>
  );
}

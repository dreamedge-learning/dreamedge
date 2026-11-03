import Image from "next/image";
import { Wrench } from "lucide-react";

/**
 * What a student sees while maintenance mode is on.
 *
 * The switch has been in the admin panel since it was built and has never
 * done anything, which is worse than not having it: an admin flipping it
 * during an incident would believe the site was closed while every page kept
 * serving. This is the page that makes it true.
 *
 * The support details are passed in rather than imported, so the one thing a
 * stuck student needs is the number the panel currently says it is.
 */
export function MaintenanceNotice({
  platformName,
  supportEmail,
  supportPhone,
}: {
  platformName: string;
  supportEmail: string;
  supportPhone: string;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-center">
      <Image
        src="/logo.jpg"
        alt={platformName}
        width={72}
        height={72}
        priority
        className="h-16 w-auto"
      />

      <span className="mt-8 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-orange/10">
        <Wrench className="h-5 w-5 text-brand-orange" />
      </span>

      <h1 className="mt-5 text-2xl font-semibold text-foreground">
        We&apos;ll be back shortly
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        {platformName} is down for scheduled maintenance. Your courses and
        progress are safe — nothing has been lost.
      </p>

      <div className="mt-8 space-y-1 text-sm">
        <p className="text-muted-foreground">Need something urgently?</p>
        <p>
          <a
            href={`mailto:${supportEmail}`}
            className="text-brand-orange hover:underline"
          >
            {supportEmail}
          </a>
        </p>
        <p className="text-muted-foreground">{supportPhone}</p>
      </div>
    </div>
  );
}

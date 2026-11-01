import Image from "next/image";
import Link from "next/link";
import { Play, Camera, Send } from "lucide-react";

const QUICK_LINKS = [
  { href: "/", label: "Home" },
  { href: "/courses", label: "Courses" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

const STUDENT_LINKS = [
  { href: "/login", label: "Login" },
  { href: "/login", label: "Register" },
  { href: "/dashboard", label: "My Dashboard" },
  { href: "/courses", label: "My Courses" },
];

const LEGAL_LINKS = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy-policy", label: "Privacy Policy" },
  { href: "/refund-policy", label: "Refund Policy" },
];

const SOCIAL_CHANNELS = [
  { key: "youtube", label: "YouTube", Icon: Play },
  { key: "instagram", label: "Instagram", Icon: Camera },
  { key: "telegram", label: "Telegram", Icon: Send },
] as const;

interface SocialLinks {
  youtube?: string;
  instagram?: string;
  telegram?: string;
}

interface FooterProps {
  socialLinks?: SocialLinks;
}

export function Footer({ socialLinks }: FooterProps) {
  // Only networks with a configured handle are rendered; a placeholder "#"
  // link reads as a broken social icon to anyone who clicks it.
  const channels = SOCIAL_CHANNELS.flatMap((channel) => {
    const href = socialLinks?.[channel.key];
    return href ? [{ ...channel, href }] : [];
  });

  return (
    <footer className="bg-brand-black text-white">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="space-y-4">
            <Image src="/logo.jpg" alt="Dream Edge Online" width={48} height={48} className="h-12 w-auto" />
            <p className="text-sm leading-relaxed text-brand-gray">
              मजबूत नींव, शानदार भविष्य — Premium coaching for Classes 6-10 by
              IITian mentors.
            </p>
            {channels.length > 0 && (
              <div className="flex items-center gap-3">
                {channels.map(({ key, href, label, Icon }) => (
                  <a
                    key={key}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-brand-orange"
                    aria-label={label}
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-brand-gray">
              Quick Links
            </h4>
            <ul className="space-y-2.5">
              {QUICK_LINKS.map((link) => (
                <li key={link.href + link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/70 transition-colors hover:text-brand-orange"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Student */}
          <div>
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-brand-gray">
              Student
            </h4>
            <ul className="space-y-2.5">
              {STUDENT_LINKS.map((link) => (
                <li key={link.href + link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/70 transition-colors hover:text-brand-orange"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-brand-gray">
              Legal
            </h4>
            <ul className="space-y-2.5">
              {LEGAL_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/70 transition-colors hover:text-brand-orange"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 sm:flex-row">
          <p className="text-xs text-brand-gray">
            &copy; {new Date().getFullYear()} Dream Edge Online. All rights
            reserved.
          </p>
          <p className="text-xs text-brand-gray">
            Made with <span className="text-red-500">&hearts;</span> in India
          </p>
        </div>
      </div>
    </footer>
  );
}

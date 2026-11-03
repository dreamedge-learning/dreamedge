import type { Metadata } from "next";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from "@/lib/site";
import { Inter, Playfair_Display } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const playfair = Playfair_Display({
  variable: "--font-heading",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  // Without metadataBase every og:image and canonical URL resolves relative,
  // which silently breaks social previews.
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Dream Edge Online — Premium Coaching for Classes 6-10",
    template: "%s | Dream Edge Online",
  },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
  keywords: [
    "online coaching",
    "classes 6-10",
    "CBSE coaching",
    "maths coaching",
    "science coaching",
    "Dream Edge",
    "foundation courses",
  ],
  openGraph: {
    type: "website",
    locale: "en_IN",
    siteName: SITE_NAME,
    url: SITE_URL,
    title: "Dream Edge Online — Premium Coaching for Classes 6-10",
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Dream Edge Online — Premium Coaching for Classes 6-10",
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${playfair.variable} dark h-full antialiased`}
      style={{ colorScheme: "dark" }}
    >
      <body className="min-h-full flex flex-col">
        {/* Dream Edge is dark only. forcedTheme pins the `dark` class on
            <html> and ignores both the system setting and anything left in
            localStorage from when the toggle existed, so there is no light
            flash on first paint and no way back to a light screen. */}
        <ThemeProvider
          attribute="class"
          forcedTheme="dark"
          disableTransitionOnChange
        >
          {children}
          <Toaster richColors theme="dark" position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Apply for Admin Access | Dream Edge",
  // Behind a password and of no use to anyone searching for coaching classes.
  robots: { index: false, follow: false },
};

export default function AdminApplyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

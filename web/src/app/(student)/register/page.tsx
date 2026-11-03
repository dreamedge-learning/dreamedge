import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSiteSettings } from "@/lib/settings";
import { RegisterForm } from "@/components/student/auth/register-form";


export const metadata = {
  title: "Register",
};

export default async function RegisterPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: student } = await supabase
      .from("students")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (student) redirect("/dashboard");
  }

  const settings = await getSiteSettings();

  // The admin switch, honoured before a form is drawn. The server action
  // refuses too -- this only saves the visitor filling in six fields to be
  // told no at the end.
  if (!settings.student_registration_open) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-12 text-center">
        <h1 className="text-2xl font-semibold text-foreground">
          Registrations are closed
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          We are not taking new sign-ups at the moment. Get in touch and we
          will enrol you directly.
        </p>
        <div className="mt-6 space-y-2 text-sm">
          <p>
            <a
              href={`mailto:${settings.support_email}`}
              className="text-brand-orange hover:underline"
            >
              {settings.support_email}
            </a>
          </p>
          <p className="text-muted-foreground">{settings.support_phone}</p>
        </div>
        <p className="mt-8 text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-brand-orange hover:underline">
            Log in
          </Link>
        </p>
      </div>
    );
  }

  return <RegisterForm referralEnabled={settings.referral_system_enabled} />;
}

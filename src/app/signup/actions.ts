"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signup(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }

  // If email confirmation is required, signUp succeeds but returns no session.
  if (!data.session) {
    redirect(
      `/login?message=${encodeURIComponent("Check your email to confirm your account.")}`,
    );
  }

  redirect("/");
}

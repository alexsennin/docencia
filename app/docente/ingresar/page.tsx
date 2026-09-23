import { redirect } from "next/navigation";
import { TeacherLoginForm } from "../../../components/teacher-login-form";
import { hasTeacherSession } from "../../../lib/teacher-auth";

export const dynamic = "force-dynamic";

export default async function TeacherLoginPage() {
  if (await hasTeacherSession()) redirect("/");
  return <TeacherLoginForm />;
}

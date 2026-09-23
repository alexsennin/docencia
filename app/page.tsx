import { redirect } from "next/navigation";
import TeacherDashboard from "../components/teacher-dashboard";
import { hasTeacherSession } from "../lib/teacher-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!(await hasTeacherSession())) redirect("/docente/ingresar");
  return <TeacherDashboard />;
}

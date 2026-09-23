import TeacherDashboard from "../components/teacher-dashboard";
import StudentExamPortal from "../components/student-exam-portal";
import { hasTeacherSession } from "../lib/teacher-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  return (await hasTeacherSession()) ? <TeacherDashboard /> : <StudentExamPortal />;
}

import { redirect } from "next/navigation";
import { hasTeacherSession } from "../../../lib/teacher-auth";
import TeacherExamPreview from "../../../components/teacher-exam-preview";

export const dynamic = "force-dynamic";

export default async function PreviewPage() {
  if (!(await hasTeacherSession())) redirect("/");
  return <TeacherExamPreview />;
}

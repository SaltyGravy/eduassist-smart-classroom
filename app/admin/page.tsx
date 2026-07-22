import type { Metadata } from "next";
import { AdminPortal } from "../AdminPortal";

export const metadata: Metadata = {
  title: "EduAssist Administration",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminPortal />;
}

import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("keeps the public entry point limited to faculty and students", async () => {
  const [layout, classroom] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ClassroomApp.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /EduAssist — AI Smart Classroom/);
  assert.match(layout, /faculty and student portal/i);
  assert.match(classroom, /Securing your portal/i);
  assert.match(classroom, /Choose account type/i);
  assert.doesNotMatch(classroom, /value="admin"|Choose workspace/i);
});

test("does not contain an administrator page in the public app", async () => {
  await assert.rejects(access(new URL("../app/admin/page.tsx", import.meta.url)));
});

test("keeps class management faculty-only and removes the dashboard search bar", async () => {
  const [classroom, modules, route, service] = await Promise.all([
    readFile(new URL("../app/ClassroomApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ClassroomModules.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/classroom/classes/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/classroom.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(classroom, /Search classes, notes, quizzes|className="search-box"/);
  assert.match(modules, /role === "faculty".*class-management-actions/s);
  assert.match(modules, /Type <b>\{deletingClass\.classCode\}<\/b> to confirm/);
  assert.match(route, /export async function PATCH/);
  assert.match(route, /export async function DELETE/);
  assert.match(service, /getAuthorizedSession\(request, \["faculty"\]\)/);
  assert.match(service, /Close the active attendance session before deleting this class/);
});

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

test("stores the administrator-selected QR rotation interval on each attendance session", async () => {
  const [modules, bridge, service, schema] = await Promise.all([
    readFile(new URL("../app/ClassroomModules.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/bridge/admin/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/classroom.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/schema.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(bridge, /action === "get_settings"/);
  assert.match(bridge, /action === "update_settings"/);
  assert.match(service, /rotation_seconds INTEGER NOT NULL DEFAULT 10/);
  assert.match(service, /acceptedRotations\(candidate\)/);
  assert.match(service, /readClassroomSettings\(\)/);
  assert.match(schema, /"rotation_seconds"/);
  assert.match(modules, /attendanceSession\.rotationSeconds/);
  assert.doesNotMatch(modules, /refreshes every 10 seconds|change every 10 seconds/);
});

test("stores typed academic profiles and derives the student first-login password", async () => {
  const [auth, bridge, schema] = await Promise.all([
    readFile(new URL("../app/lib/auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/bridge/admin/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/schema.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(auth, /department TEXT NOT NULL DEFAULT ''/);
  assert.match(auth, /roll_number TEXT NOT NULL DEFAULT ''/);
  assert.match(auth, /function defaultStudentPassword/);
  assert.match(auth, /defaultStudentPassword\(displayName, profile\.rollNumber\)/);
  assert.match(auth, /must_change_password.*1/s);
  assert.match(bridge, /department: typeof body\.department/);
  assert.match(bridge, /initialPassword: result\.initialPassword/);
  assert.match(schema, /auth_users_student_roll_unique/);
});

test("exports styled department-section workbooks and enables manual codes only on demand", async () => {
  const [modules, workbook, service, route] = await Promise.all([
    readFile(new URL("../app/ClassroomModules.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/attendance-workbook.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/classroom.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/classroom/attendance/manual-code/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(modules, /import\("\.\/lib\/attendance-workbook"\)/);
  assert.match(workbook, /workbook\.addWorksheet/);
  assert.match(workbook, /FFFEE2E2/);
  assert.match(workbook, /FFDCFCE7/);
  assert.match(modules, /Export Excel/);
  assert.match(modules, /Generate manual code/);
  assert.match(service, /manual_code_enabled INTEGER NOT NULL DEFAULT 0/);
  assert.match(service, /manual_code_enabled = 1/);
  assert.match(service, /s\.manual_code_enabled = 1/);
  assert.match(route, /enableManualAttendanceCode/);
});

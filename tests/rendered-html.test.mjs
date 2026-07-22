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

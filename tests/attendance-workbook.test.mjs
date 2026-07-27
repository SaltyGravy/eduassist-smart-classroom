import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { buildFacultyAttendanceWorkbook, selectAttendanceSessions } from "../app/lib/attendance-workbook.ts";

test("builds department-section worksheets with present and absent colour coding", async () => {
  const buffer = await buildFacultyAttendanceWorkbook({
    selectedClass: { subjectName: "Data Analytics", subjectCode: "IT401", semester: "Semester 6" },
    students: [
      {
        userId: "STU001",
        displayName: "Aditi Student",
        department: "IT",
        section: "A",
        rollNumber: "23IT001",
        semester: "Semester 6",
        present: 1,
        late: 0,
        absent: 1,
        totalSessions: 2,
        attendanceRate: 50,
      },
      {
        userId: "STU002",
        displayName: "Bina Student",
        department: "CSE",
        section: "B",
        rollNumber: "23CSE002",
        semester: "Semester 6",
        present: 1,
        late: 1,
        absent: 0,
        totalSessions: 2,
        attendanceRate: 100,
      },
    ],
    sessions: [
      { id: 1, startsAt: "2026-07-25 09:00:00" },
      { id: 2, startsAt: "2026-07-26 09:00:00" },
    ],
    attendance: [
      { sessionId: 1, userId: "STU001", status: "present" },
      { sessionId: 2, userId: "STU001", status: "absent" },
      { sessionId: 1, userId: "STU002", status: "late" },
      { sessionId: 2, userId: "STU002", status: "present" },
    ],
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["IT-A", "CSE-B"]);
  const itSheet = workbook.getWorksheet("IT-A");
  assert.ok(itSheet);
  assert.equal(itSheet.getCell("A6").value, "Aditi Student");
  assert.equal(itSheet.getCell("G6").value, "Present");
  assert.equal(itSheet.getCell("G6").fill.fgColor.argb, "FFDCFCE7");
  assert.equal(itSheet.getCell("H6").value, "Absent");
  assert.equal(itSheet.getCell("H6").fill.fgColor.argb, "FFFEE2E2");
  const cseSheet = workbook.getWorksheet("CSE-B");
  assert.ok(cseSheet);
  assert.equal(cseSheet.getCell("G6").value, "Late");
  assert.equal(cseSheet.getCell("G6").fill.fgColor.argb, "FFFEF3C7");
});

test("keeps every student while narrowing a workbook to an exact session or date", () => {
  const selected = selectAttendanceSessions({
    selectedClass: { subjectName: "Data Analytics", subjectCode: "IT401", semester: "Semester 6" },
    students: [
      {
        userId: "STU001", displayName: "Aditi Student", department: "IT", section: "A",
        rollNumber: "23IT001", semester: "Semester 6", present: 1, late: 0, absent: 1,
        totalSessions: 2, attendanceRate: 50,
      },
      {
        userId: "STU002", displayName: "Bina Student", department: "IT", section: "A",
        rollNumber: "23IT002", semester: "Semester 6", present: 2, late: 0, absent: 0,
        totalSessions: 2, attendanceRate: 100,
      },
    ],
    sessions: [
      { id: 1, startsAt: "2026-07-25 09:00:00" },
      { id: 2, startsAt: "2026-07-26 09:00:00" },
    ],
    attendance: [
      { sessionId: 1, userId: "STU001", status: "present" },
      { sessionId: 2, userId: "STU001", status: "absent" },
      { sessionId: 1, userId: "STU002", status: "present" },
      { sessionId: 2, userId: "STU002", status: "present" },
    ],
  }, [2]);

  assert.deepEqual(selected.sessions.map((session) => session.id), [2]);
  assert.equal(selected.students.length, 2);
  assert.deepEqual(
    selected.students.map(({ userId, present, absent, totalSessions, attendanceRate }) => ({ userId, present, absent, totalSessions, attendanceRate })),
    [
      { userId: "STU001", present: 0, absent: 1, totalSessions: 1, attendanceRate: 0 },
      { userId: "STU002", present: 1, absent: 0, totalSessions: 1, attendanceRate: 100 },
    ],
  );
});

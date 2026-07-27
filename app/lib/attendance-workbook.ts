import ExcelJS from "exceljs";

export type AttendanceWorkbookData = {
  selectedClass: {
    subjectName: string;
    subjectCode: string;
    semester: string;
  };
  students: Array<{
    userId: string;
    displayName: string;
    department: string;
    section: string;
    rollNumber: string;
    semester: string;
    present: number;
    late: number;
    absent: number;
    totalSessions: number;
    attendanceRate: number | null;
  }>;
  sessions: Array<{ id: number; startsAt: string }>;
  attendance: Array<{ sessionId: number; userId: string; status: "present" | "late" | "absent" }>;
};

function parseUtcDate(value: string) {
  return new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
}

function sessionLabel(value: string) {
  const date = parseUtcDate(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function workbookSheetName(label: string, used: Set<string>) {
  const base = label.replace(/[*?:/\\[\]]/g, "-").replace(/\s+/g, " ").trim().slice(0, 31) || "UNASSIGNED";
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    const ending = `-${suffix}`;
    candidate = `${base.slice(0, 31 - ending.length)}${ending}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

export async function buildFacultyAttendanceWorkbook(data: AttendanceWorkbookData) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "EduAssist";
  workbook.created = new Date();
  workbook.subject = `${data.selectedClass.subjectCode} attendance report`;
  const usedSheetNames = new Set<string>();
  const grouped = new Map<string, AttendanceWorkbookData["students"]>();
  for (const student of data.students) {
    const department = student.department || "UNASSIGNED";
    const section = student.section || "UNASSIGNED";
    const key = `${department}-${section}`;
    grouped.set(key, [...(grouped.get(key) ?? []), student]);
  }
  if (!grouped.size) grouped.set("UNASSIGNED", []);
  const sessions = [...data.sessions].sort((left, right) => parseUtcDate(left.startsAt).getTime() - parseUtcDate(right.startsAt).getTime());
  const statusByStudentSession = new Map(data.attendance.map((entry) => [`${entry.userId}:${entry.sessionId}`, entry.status]));

  for (const [groupLabel, students] of grouped) {
    const sheet = workbook.addWorksheet(workbookSheetName(groupLabel, usedSheetNames), {
      views: [{ state: "frozen", xSplit: 3, ySplit: 5 }],
      properties: { defaultRowHeight: 18 },
    });
    const headers = [
      "Student",
      "User ID",
      "Roll Number",
      "Department",
      "Section",
      "Semester",
      ...sessions.map((session) => sessionLabel(session.startsAt)),
      "Present",
      "Late",
      "Absent",
      "Total Sessions",
      "Attendance %",
    ];
    sheet.mergeCells(1, 1, 1, headers.length);
    sheet.getCell(1, 1).value = `${data.selectedClass.subjectCode} — ${data.selectedClass.subjectName}`;
    sheet.getCell(1, 1).font = { bold: true, color: { argb: "FFFFFFFF" }, size: 15 };
    sheet.getCell(1, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF20274F" } };
    sheet.getCell(1, 1).alignment = { vertical: "middle", horizontal: "left" };
    sheet.getRow(1).height = 28;
    sheet.mergeCells(2, 1, 2, headers.length);
    sheet.getCell(2, 1).value = `${groupLabel} · ${data.selectedClass.semester} · Generated ${new Date().toLocaleString("en-IN")}`;
    sheet.getCell(2, 1).font = { color: { argb: "FF555B6A" }, italic: true, size: 10 };
    sheet.getCell(3, 1).value = "Green = Present";
    sheet.getCell(3, 2).value = "Red = Absent";
    sheet.getCell(3, 3).value = "Amber = Late";
    sheet.getCell(3, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCFCE7" } };
    sheet.getCell(3, 2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
    sheet.getCell(3, 3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
    const headerRow = sheet.getRow(5);
    headerRow.values = headers;
    headerRow.height = 30;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3B426B" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = { bottom: { style: "thin", color: { argb: "FF222844" } } };
    });

    for (const student of students) {
      const statuses = sessions.map((session) => statusByStudentSession.get(`${student.userId}:${session.id}`) ?? "");
      const row = sheet.addRow([
        student.displayName,
        student.userId,
        student.rollNumber,
        student.department,
        student.section,
        student.semester,
        ...statuses.map((status) => status ? `${status[0].toUpperCase()}${status.slice(1)}` : ""),
        student.present,
        student.late,
        student.absent,
        student.totalSessions,
        student.attendanceRate === null ? "" : student.attendanceRate / 100,
      ]);
      row.getCell(headers.length).numFmt = "0%";
      statuses.forEach((status, index) => {
        const cell = row.getCell(7 + index);
        if (status === "present") {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCFCE7" } };
          cell.font = { bold: true, color: { argb: "FF166534" } };
        } else if (status === "absent") {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
          cell.font = { bold: true, color: { argb: "FF991B1B" } };
        } else if (status === "late") {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
          cell.font = { bold: true, color: { argb: "FF92400E" } };
        }
        cell.alignment = { horizontal: "center" };
      });
      row.eachCell((cell) => {
        cell.border = { bottom: { style: "hair", color: { argb: "FFD8DBE5" } } };
        cell.alignment = { ...cell.alignment, vertical: "middle" };
      });
    }
    sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: headers.length } };
    sheet.columns.forEach((column, index) => {
      column.width = index === 0 ? 24 : index === 2 ? 16 : index >= 6 && index < 6 + sessions.length ? 18 : 14;
    });
  }

  return workbook.xlsx.writeBuffer();
}

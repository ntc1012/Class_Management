export type Role = "owner" | "teacher" | "student";
export type Actor = {
  id: string;
  center_id: string;
  role: Role;
  name: string;
  email: string;
};
export type Row = Record<string, any>;
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const attendanceLabels: Record<string, string> = {
  present: "Có mặt",
  excused: "Vắng có phép",
  absent: "Vắng không phép",
};

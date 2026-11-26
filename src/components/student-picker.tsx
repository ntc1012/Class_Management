"use client";
import { useState } from "react";
import type { Row } from "@/lib/types";

export default function StudentPicker({
  students,
  selected,
  onChange,
  available,
  disabled,
}: {
  students: Row[];
  selected: string[];
  onChange: (ids: string[]) => void;
  available: number;
  disabled: boolean;
}) {
  const [search, setSearch] = useState("");
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLocaleLowerCase("vi")
      .trim();
  const shown = students.filter((s) =>
    normalize([s.name, s.username, s.school, s.phone].join(" ")).includes(
      normalize(search),
    ),
  );
  const allShown =
    shown.length > 0 && shown.every((s) => selected.includes(s.id));
  const tooMany = selected.length > available || selected.length > 500;
  return (
    <div className="student-picker">
      <label>
        Tìm học sinh
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tên, tài khoản, trường hoặc số điện thoại"
          disabled={disabled}
        />
      </label>
      <div className="student-picker-tools">
        <button
          type="button"
          className="button small"
          disabled={disabled || !shown.length}
          onClick={() =>
            onChange(
              allShown
                ? selected.filter((id) => !shown.some((s) => s.id === id))
                : [...new Set([...selected, ...shown.map((s) => s.id)])],
            )
          }
        >
          {allShown
            ? "Bỏ chọn kết quả"
            : `Chọn tất cả${search ? " kết quả" : ""} (${shown.length})`}
        </button>
        <button
          type="button"
          className="button small"
          disabled={disabled || !selected.length}
          onClick={() => onChange([])}
        >
          Bỏ chọn hết
        </button>
      </div>
      <p className={tooMany ? "alert danger" : "form-hint"} aria-live="polite">
        Đã chọn {selected.length} học sinh · Lớp còn {available} chỗ
        {tooMany ? ". Vui lòng giảm số đã chọn (tối đa 500 mỗi lần)." : "."}
      </p>
      <div
        className="student-picker-list"
        role="group"
        aria-label="Học sinh chưa có trong lớp"
      >
        {shown.map((s) => (
          <label className="student-picker-row" key={s.id}>
            <input
              type="checkbox"
              checked={selected.includes(s.id)}
              disabled={disabled}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...selected, s.id]
                    : selected.filter((id) => id !== s.id),
                )
              }
            />
            <span>
              <strong>{s.name}</strong>
              <small>
                {[s.username, s.school].filter(Boolean).join(" · ")}
              </small>
            </span>
          </label>
        ))}
        {!shown.length && (
          <p className="form-hint">
            {students.length
              ? "Không tìm thấy học sinh phù hợp."
              : "Không còn học sinh để thêm. Bạn có thể tạo hồ sơ hoặc nhập danh sách CSV tại mục Học sinh."}
          </p>
        )}
      </div>
      {selected.map((id) => (
        <input type="hidden" name="student_ids" value={id} key={id} />
      ))}
    </div>
  );
}

"use client";

import { useActionState, useEffect, useRef } from "react";
import { createRoleAction, type RoleFormState } from "./actions";

const initialState: RoleFormState = {};

export function RoleCreateForm() {
  const [state, formAction, isPending] = useActionState(createRoleAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      <div className="form-grid">
        <div>
          <input
            name="key"
            placeholder="KHOA_VAI_TRO (ví dụ: KE_TOAN)"
            required
            className="input-field"
          />
          {state.fieldErrors?.key && (
            <p style={{ color: "var(--danger-color)", fontSize: "0.82rem", marginTop: 4 }}>
              {state.fieldErrors.key[0]}
            </p>
          )}
          <p style={{ color: "var(--text-muted)", fontSize: "0.78rem", marginTop: 4 }}>
            Không đổi được sau khi tạo — khoá này nằm trong các phiên đăng nhập đang chạy.
          </p>
        </div>

        <div>
          <input
            name="name"
            placeholder="Tên hiển thị (ví dụ: Kế toán)"
            required
            className="input-field"
          />
          {state.fieldErrors?.name && (
            <p style={{ color: "var(--danger-color)", fontSize: "0.82rem", marginTop: 4 }}>
              {state.fieldErrors.name[0]}
            </p>
          )}
        </div>

        <div>
          <input name="description" placeholder="Mô tả (không bắt buộc)" className="input-field" />
        </div>
      </div>

      <div className="form-actions">
        <button type="submit" disabled={isPending} className="btn btn-primary">
          {isPending ? "Đang tạo…" : "+ Tạo vai trò"}
        </button>
      </div>

      {state.error && (
        <div className="alert alert-danger" role="alert">
          {state.error}
        </div>
      )}

      {state.success && (
        <div className="alert alert-success" role="status">
          {state.success}
        </div>
      )}
    </form>
  );
}

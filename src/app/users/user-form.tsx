"use client";

import { useActionState, useRef, useEffect } from "react";
import { createUserAction, type CreateUserState } from "./actions";

const initialState: CreateUserState = {};

export function UserForm() {
  const [state, formAction, isPending] = useActionState(createUserAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!isPending && !state.error && !state.fieldErrors) {
      formRef.current?.reset();
    }
  }, [isPending, state]);

  return (
    <form ref={formRef} action={formAction} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="form-grid">
        <div>
          <input
            name="email"
            type="email"
            placeholder="Email (ví dụ: user@example.com)"
            required
            className="input-field"
          />
          {state.fieldErrors?.email && (
            <p style={{ color: "var(--danger-color)", fontSize: "0.82rem", marginTop: 4 }}>
              {state.fieldErrors.email[0]}
            </p>
          )}
        </div>

        <div>
          <input
            name="name"
            placeholder="Tên người dùng (không bắt buộc)"
            className="input-field"
          />
        </div>

        <button type="submit" disabled={isPending} className="btn btn-primary">
          {isPending ? "Đang thêm..." : "+ Thêm người dùng"}
        </button>
      </div>

      {state.error && (
        <div style={{ padding: "10px 14px", borderRadius: "var(--radius-md)", background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "var(--danger-color)", fontSize: "0.9rem" }}>
          ⚠️ {state.error}
        </div>
      )}
    </form>
  );
}

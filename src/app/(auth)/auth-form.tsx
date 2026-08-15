import type { AuthFormState } from "./actions";

export type Field = {
  name: "identifier" | "email" | "password" | "fullName";
  label: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
};

/**
 * Phần hiển thị dùng chung của form đăng nhập/đăng ký.
 *
 * Cố ý KHÔNG nhận Server Action qua prop: khi action đi xuyên qua ranh giới
 * prop, React không nhúng được `$ACTION_ID` vào HTML và form ngừng hoạt động
 * nếu trình duyệt chưa tải xong JS. Vì vậy mỗi form (login-form/register-form)
 * tự import action của nó, còn file này chỉ lo phần nhìn.
 */
export function AuthFields({
  fields,
  state,
  isPending,
  submitLabel,
  pendingLabel,
  nextPath,
}: {
  fields: Field[];
  state: AuthFormState;
  isPending: boolean;
  submitLabel: string;
  pendingLabel: string;
  nextPath?: string;
}) {
  return (
    <>
      {nextPath && <input type="hidden" name="next" value={nextPath} />}

      {fields.map((field) => {
        const errorId = `${field.name}-error`;
        const fieldError = state.fieldErrors?.[field.name]?.[0];

        return (
          <div key={field.name}>
            <label
              htmlFor={field.name}
              style={{ display: "block", marginBottom: 6, fontSize: "0.88rem", fontWeight: 600 }}
            >
              {field.label}
            </label>
            <input
              id={field.name}
              name={field.name}
              type={field.type ?? "text"}
              placeholder={field.placeholder}
              required={field.required}
              autoComplete={field.autoComplete}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? errorId : undefined}
              className="input-field"
            />
            {fieldError && (
              <p
                id={errorId}
                style={{ color: "var(--danger-color)", fontSize: "0.82rem", marginTop: 4 }}
              >
                {fieldError}
              </p>
            )}
          </div>
        );
      })}

      {state.error && (
        <div className="alert alert-danger" role="alert">
          {state.error}
        </div>
      )}

      <button type="submit" disabled={isPending} className="btn btn-primary">
        {isPending ? pendingLabel : submitLabel}
      </button>
    </>
  );
}

export const FORM_STYLE = { display: "flex", flexDirection: "column", gap: 16 } as const;

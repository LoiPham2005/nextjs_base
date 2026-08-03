"use client";

import { useActionState } from "react";
import { loginAction, type AuthFormState } from "../actions";
import { AuthFields, FORM_STYLE, type Field } from "../auth-form";

const initialState: AuthFormState = {};

const FIELDS: Field[] = [
  {
    name: "email",
    label: "Email",
    type: "email",
    placeholder: "you@example.com",
    required: true,
    autoComplete: "email",
  },
  {
    name: "password",
    label: "Mật khẩu",
    type: "password",
    placeholder: "••••••••",
    required: true,
    autoComplete: "current-password",
  },
];

export function LoginForm({ nextPath }: { nextPath?: string }) {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} style={FORM_STYLE}>
      <AuthFields
        fields={FIELDS}
        state={state}
        isPending={isPending}
        submitLabel="Đăng nhập"
        pendingLabel="Đang đăng nhập…"
        nextPath={nextPath}
      />
    </form>
  );
}

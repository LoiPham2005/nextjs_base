"use client";

import { useTransition } from "react";
import { setUserStatusAction, unlockUserAction } from "./actions";
import type { UserStatusInput } from "@/schemas/user.schema";

export function UserStatusButton({
  id,
  email,
  status,
  lockedUntil,
}: {
  id: string;
  email: string;
  status: UserStatusInput;
  /** ISO string nếu đang bị khoá tạm do sai mật khẩu liên tiếp — xem `AuthService`. */
  lockedUntil: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const isLockedNow = lockedUntil !== null && new Date(lockedUntil) > new Date();

  const toggleStatus = () => {
    const next: UserStatusInput = status === "BANNED" ? "ACTIVE" : "BANNED";
    const confirmMessage =
      next === "BANNED"
        ? `Khoá tài khoản ${email}? Người này sẽ không đăng nhập được nữa.`
        : `Mở khoá tài khoản ${email}?`;

    if (typeof window !== "undefined" && window.confirm(confirmMessage)) {
      startTransition(async () => {
        const res = await setUserStatusAction(id, next);
        if (res.error) window.alert(`Lỗi: ${res.error}`);
      });
    }
  };

  const unlock = () => {
    startTransition(async () => {
      const res = await unlockUserAction(id);
      if (res.error) window.alert(`Lỗi: ${res.error}`);
    });
  };

  return (
    <div style={{ display: "flex", gap: 8 }}>
      {isLockedNow && (
        <button
          type="button"
          onClick={unlock}
          disabled={isPending}
          className="btn btn-secondary"
          style={{ padding: "6px 12px", fontSize: "0.82rem" }}
          title="Đăng nhập sai quá nhiều lần — mở khoá sớm thay vì đợi tự hết hạn"
        >
          Mở khoá tạm
        </button>
      )}
      <button
        type="button"
        onClick={toggleStatus}
        disabled={isPending}
        className={status === "BANNED" ? "btn btn-secondary" : "btn btn-danger"}
        style={{ padding: "6px 12px", fontSize: "0.82rem" }}
      >
        {isPending ? "Đang xử lý..." : status === "BANNED" ? "Mở khoá" : "Khoá"}
      </button>
    </div>
  );
}

"use client";

import { useTransition } from "react";
import { deleteUserAction } from "./actions";

export function UserDeleteButton({ id, email }: { id: string; email: string }) {
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    if (typeof window !== "undefined" && window.confirm(`Bạn có chắc chắn muốn xoá người dùng ${email}?`)) {
      startTransition(async () => {
        const res = await deleteUserAction(id);
        if (res.error) {
          window.alert(`Lỗi: ${res.error}`);
        }
      });
    }
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      className="btn btn-danger"
      style={{ padding: "6px 12px", fontSize: "0.82rem" }}
    >
      {isPending ? "Đang xoá..." : "Xoá"}
    </button>
  );
}

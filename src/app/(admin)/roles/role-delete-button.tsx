"use client";

import { useTransition } from "react";
import { deleteRoleAction } from "./actions";

export function RoleDeleteButton({ roleKey, userCount }: { roleKey: string; userCount: number }) {
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    if (typeof window === "undefined") return;

    // Chặn sớm ở đây chỉ để nói được câu dễ hiểu; luật thật nằm trong service
    // và vẫn chạy dù ai đó gọi thẳng action.
    if (userCount > 0) {
      window.alert(
        `Vai trò "${roleKey}" đang có ${userCount} người dùng. ` +
          `Chuyển họ sang vai trò khác trước khi xoá.`,
      );
      return;
    }

    if (!window.confirm(`Xoá vai trò "${roleKey}"?`)) return;

    startTransition(async () => {
      const res = await deleteRoleAction(roleKey);
      if (res.error) window.alert(`Lỗi: ${res.error}`);
    });
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

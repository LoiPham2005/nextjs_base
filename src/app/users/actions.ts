"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { createUserSchema } from "@/schemas/user.schema";
import { userService, UserAlreadyExistsError, UserNotFoundError } from "@/services/user.service";

/**
 * Mỗi Server Action là một HTTP endpoint công khai.
 *
 * Việc trang gọi nó nằm sau middleware KHÔNG bảo vệ được action: ai cũng có
 * thể POST thẳng tới action id mà không đi qua trang đó. Vì vậy mọi action ở
 * đây tự kiểm tra quyền, không tin vào bất cứ lớp nào phía trên.
 */
async function denyIfNotAdmin(): Promise<{ error: string } | null> {
  const session = await getSession();

  if (!session) return { error: "Bạn cần đăng nhập để thực hiện thao tác này." };
  if (session.role !== "ADMIN") {
    logger.warn("Non-admin attempted an admin action", { userId: session.sub });
    return { error: "Bạn không có quyền thực hiện thao tác này." };
  }

  return null;
}

export type CreateUserState = {
  error?: string;
  fieldErrors?: Partial<Record<"email" | "name" | "password" | "role", string[]>>;
};

export async function createUserAction(
  _prevState: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  // `role` cố ý KHÔNG đọc từ formData. Nếu đọc, bất kỳ ai gửi được form cũng
  // tự phong mình làm ADMIN — leo thang đặc quyền chỉ bằng một field ẩn.
  const parsed = createUserSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name") || undefined,
  });

  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  try {
    await userService.create(parsed.data);
  } catch (error) {
    if (error instanceof UserAlreadyExistsError) {
      return { error: error.message };
    }
    logger.error("Create user failed", error, { email: parsed.data.email });
    return { error: "Không thể tạo người dùng lúc này. Vui lòng thử lại." };
  }

  revalidatePath("/users");
  return {};
}

export async function deleteUserAction(id: string): Promise<{ error?: string }> {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  const session = await getSession();
  if (session?.sub === id) {
    return { error: "Bạn không thể tự xoá tài khoản đang đăng nhập." };
  }

  try {
    await userService.delete(id);
  } catch (error) {
    if (error instanceof UserNotFoundError) {
      return { error: error.message };
    }
    logger.error("Delete user failed", error, { targetUserId: id });
    return { error: "Không thể xoá người dùng lúc này. Vui lòng thử lại." };
  }

  revalidatePath("/users");
  return {};
}

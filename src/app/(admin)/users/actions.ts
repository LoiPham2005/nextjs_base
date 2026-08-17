"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { createUserSchema, userStatusSchema, type UserStatusInput } from "@/schemas/user.schema";
import {
  userService,
  SelfDeletionError,
  SelfStatusChangeError,
  UserAlreadyExistsError,
  UsernameAlreadyExistsError,
  UserNotFoundError,
} from "@/services/user.service";

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
  /**
   * Khoá phải trùng tên trường trong `createUserSchema` — đó vừa là thứ
   * `z.flattenError` trả về, vừa là `name=` của các ô trong form. Union cũ còn
   * ghi `name`/`role`, hai trường không tồn tại trong schema, nên lỗi trả về
   * không bao giờ tìm được ô để hiển thị.
   */
  fieldErrors?: Partial<Record<"email" | "username" | "fullName" | "password", string[]>>;
};

export async function createUserAction(
  _prevState: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  // `roleKey` cố ý KHÔNG đọc từ formData. Nếu đọc, bất kỳ ai gửi được form
  // cũng tự phong mình làm ADMIN — leo thang đặc quyền chỉ bằng một field ẩn.
  // Muốn gán vai trò thì đi qua REST API, nơi người gọi được xác thực bằng
  // token chứ không phải bằng nội dung form.
  //
  // Tên trường phải là `fullName`, không phải `name`: Zod strip im lặng khoá
  // lạ, nên gửi sai tên không hề báo lỗi — parse vẫn thành công, chỉ có dữ
  // liệu người dùng vừa nhập là biến mất trước khi tới database.
  const parsed = createUserSchema.safeParse({
    email: formData.get("email"),
    username: formData.get("username") || undefined,
    fullName: formData.get("fullName") || undefined,
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
    // Tên đăng nhập là ô mới trên form, nên trùng username giờ là kết cục có
    // thật. Không bắt riêng thì nó rơi vào nhánh "lỗi không xác định" và admin
    // chỉ nhận được một câu chung chung, không biết phải sửa ô nào.
    if (error instanceof UsernameAlreadyExistsError) {
      return { fieldErrors: { username: [error.message] } };
    }
    logger.error("Create user failed", error, { email: parsed.data.email });
    return { error: "Không thể tạo người dùng lúc này. Vui lòng thử lại." };
  }

  revalidatePath("/users");
  return {};
}

export async function setUserStatusAction(
  id: string,
  status: UserStatusInput,
): Promise<{ error?: string }> {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  const parsed = userStatusSchema.safeParse(status);
  if (!parsed.success) return { error: "Trạng thái không hợp lệ" };

  const session = await getSession();

  try {
    await userService.setStatus(id, parsed.data, session?.sub ?? "");
  } catch (error) {
    if (error instanceof SelfStatusChangeError || error instanceof UserNotFoundError) {
      return { error: error.message };
    }
    logger.error("Set user status failed", error, { targetUserId: id, status });
    return { error: "Không thể đổi trạng thái lúc này. Vui lòng thử lại." };
  }

  revalidatePath("/users");
  return {};
}

/** Mở khoá sớm — bỏ qua thời gian còn lại của `lockedUntil` (khoá tự động do brute-force). */
export async function unlockUserAction(id: string): Promise<{ error?: string }> {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  try {
    await userService.unlock(id);
  } catch (error) {
    if (error instanceof UserNotFoundError) {
      return { error: error.message };
    }
    logger.error("Unlock user failed", error, { targetUserId: id });
    return { error: "Không thể mở khoá lúc này. Vui lòng thử lại." };
  }

  revalidatePath("/users");
  return {};
}

export async function deleteUserAction(id: string): Promise<{ error?: string }> {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  const session = await getSession();

  try {
    // Luật "không tự xoá chính mình" nằm trong service, không nằm ở đây —
    // nếu chép lại tại từng cửa vào thì sớm muộn hai bên cũng lệch nhau.
    await userService.delete(id, session?.sub ?? null);
  } catch (error) {
    if (error instanceof SelfDeletionError || error instanceof UserNotFoundError) {
      return { error: error.message };
    }
    logger.error("Delete user failed", error, { targetUserId: id });
    return { error: "Không thể xoá người dùng lúc này. Vui lòng thử lại." };
  }

  revalidatePath("/users");
  return {};
}

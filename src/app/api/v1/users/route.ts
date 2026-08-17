import { z } from "zod";
import { requireApiPermission } from "@/lib/api/auth";
import { apiErrors, apiOk, handleApiError, parseJsonBody } from "@/lib/api/response";
import { createUserSchema } from "@/schemas/user.schema";
import { userService } from "@/services/user.service";

export const dynamic = "force-dynamic";

const listQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(request: Request) {
  try {
    await requireApiPermission(request, "user:read");

    const url = new URL(request.url);
    const parsed = listQuerySchema.safeParse({
      cursor: url.searchParams.get("cursor") ?? undefined,
      perPage: url.searchParams.get("perPage") ?? undefined,
    });

    if (!parsed.success) {
      throw apiErrors.validation(z.flattenError(parsed.error).fieldErrors);
    }

    const { cursor, perPage } = parsed.data;

    const { users, nextCursor } = await userService.list({ cursor, take: perPage });

    return apiOk({ users, pagination: { perPage, nextCursor } });
  } catch (error) {
    return handleApiError(error, { route: "GET /api/v1/users", request });
  }
}

export async function POST(request: Request) {
  try {
    await requireApiPermission(request, "user:create");

    // createUserSchema có nhận `roleKey`, và ở đây thì hợp lệ: người gọi đã
    // được xác thực là ADMIN. Khác với form trên web, nơi vai trò bị bỏ qua
    // hoàn toàn vì bất kỳ ai cũng gửi được field ẩn.
    //
    // Vai trò không tồn tại sẽ thành RoleNotFoundError từ userService, chứ
    // không phải lỗi khoá ngoại thô của database.
    const body = await parseJsonBody(request, createUserSchema);
    const user = await userService.create(body);

    return apiOk({ user }, 201);
  } catch (error) {
    return handleApiError(error, { route: "POST /api/v1/users", request });
  }
}

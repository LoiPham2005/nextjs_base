import { requireApiPermission, requireApiUser } from "@/lib/api/auth";
import { permissionService } from "@/services/permission.service";
import { apiErrors, apiOk, handleApiError } from "@/lib/api/response";
import { userService } from "@/services/user.service";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    const session = await requireApiUser(request);

    // Người dùng thường chỉ xem được chính mình; ADMIN xem được tất cả.
    // Đọc được hồ sơ người khác cần quyền `user:read`; hồ sơ của chính mình
    // thì chỉ cần `profile:read:own`. Luật gói trong canActOnResource để không
    // bị chép lại — và chép sai — ở từng route.
    const allowed = await permissionService.canActOnResource(session.role, id, session.sub, {
      any: "user:read",
      own: "profile:read:own",
    });

    if (!allowed) {
      throw apiErrors.forbidden();
    }

    const user = await userService.findById(id);
    if (!user) throw apiErrors.notFound("Không tìm thấy người dùng");

    return apiOk({ user });
  } catch (error) {
    return handleApiError(error, { route: "GET /api/users/[id]" });
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    const session = await requireApiPermission(request, "user:delete");

    // Luật "không tự xoá chính mình" do service giữ; handleApiError đổi
    // SelfDeletionError thành 409. Refresh token có onDelete: Cascade nên mọi
    // phiên của user này biến mất cùng lúc — xoá tài khoản mà token còn sống
    // được thì vô nghĩa.
    await userService.delete(id, session.sub);

    return apiOk({ id });
  } catch (error) {
    return handleApiError(error, { route: "DELETE /api/users/[id]" });
  }
}

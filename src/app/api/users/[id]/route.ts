import { requireApiAdmin, requireApiUser } from "@/lib/api/auth";
import { apiErrors, apiOk, handleApiError } from "@/lib/api/response";
import { userService } from "@/services/user.service";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    const session = await requireApiUser(request);

    // Người dùng thường chỉ xem được chính mình; ADMIN xem được tất cả.
    if (session.role !== "ADMIN" && session.sub !== id) {
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
    const session = await requireApiAdmin(request);

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

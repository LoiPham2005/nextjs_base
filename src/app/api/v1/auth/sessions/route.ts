import { requireApiUser } from "@/lib/api/auth";
import { apiOk, handleApiError } from "@/lib/api/response";
import { tokenService } from "@/services/token.service";

export const dynamic = "force-dynamic";

/**
 * Danh sách thiết bị đang đăng nhập.
 *
 * ---
 * VÌ SAO KHÔNG CẦN QUYỀN GÌ THÊM
 *
 * Ai cũng xem được — nhưng CHỈ phiên của chính mình. `session.sub` lấy từ
 * token đã ký, không phải từ tham số người gọi truyền vào, nên không có cách
 * nào hỏi danh sách của người khác.
 *
 * Cố ý KHÔNG cho admin xem phiên của người khác: đó là dữ liệu thiết bị và
 * thời điểm truy cập của họ. Nếu nghiệp vụ thật sự cần (hỗ trợ khách hàng
 * chẳng hạn) thì mở bằng một quyền riêng và ghi audit log, đừng thêm vào đây.
 *
 * ---
 * NHẬN RA "THIẾT BỊ NÀY"
 *
 * Response không tự đánh dấu phiên hiện tại, vì access token không mang thông
 * tin gì về refresh token đã sinh ra nó. Client tự đối chiếu với `sessionId`
 * nhận được lúc đăng nhập/refresh — xem `TokenPair` trong lib/api/tokens.ts.
 */
export async function GET(request: Request) {
  try {
    const session = await requireApiUser(request);

    const sessions = await tokenService.listActive(session.sub);

    return apiOk({
      sessions: sessions.map((item) => ({
        id: item.id,
        // Trả User-Agent THÔ, không tự dịch thành "iPhone · Safari". Việc dịch
        // phụ thuộc thư viện và cách hiển thị của từng client; làm ở đây là
        // ép mọi client dùng chung một cách diễn giải, và cách đó sẽ lỗi thời.
        userAgent: item.userAgent,
        createdAt: item.createdAt.toISOString(),
        expiresAt: item.expiresAt.toISOString(),
      })),
    });
  } catch (error) {
    return handleApiError(error, { route: "GET /api/v1/auth/sessions", request });
  }
}

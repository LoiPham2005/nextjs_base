import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as UserServiceModule from "@/services/user.service";
import { SelfDeletionError, UsernameAlreadyExistsError } from "@/services/user.service";

/**
 * Đây là bài test quan trọng nhất trong repo.
 *
 * Server Action là HTTP endpoint công khai: proxy chặn được người chưa đăng
 * nhập ở đường vào trang, nhưng KHÔNG chặn được một người đã đăng nhập với
 * quyền USER gửi thẳng request tới action dành cho ADMIN. Những test dưới đây
 * khoá chặt hành vi đó.
 */

vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/services/user.service", async (importOriginal) => {
  // Giữ nguyên các lớp lỗi thật để `instanceof` trong action vẫn đúng.
  const actual = await importOriginal<typeof UserServiceModule>();
  return {
    ...actual,
    userService: { create: vi.fn(), delete: vi.fn() },
  };
});

import { getSession } from "@/lib/auth";
import { userService } from "@/services/user.service";
import { createUserAction, deleteUserAction } from "./actions";

const adminSession = { sub: "admin-1", email: "admin@example.com", role: "ADMIN" as const };
const userSession = { sub: "user-1", email: "user@example.com", role: "USER" as const };

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createUserAction", () => {
  it("từ chối khi chưa đăng nhập và không chạm tới service", async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const result = await createUserAction({}, form({ email: "new@example.com" }));

    expect(result.error).toContain("đăng nhập");
    expect(userService.create).not.toHaveBeenCalled();
  });

  it("từ chối user thường dù đã đăng nhập", async () => {
    vi.mocked(getSession).mockResolvedValue(userSession);

    const result = await createUserAction({}, form({ email: "new@example.com" }));

    expect(result.error).toContain("không có quyền");
    expect(userService.create).not.toHaveBeenCalled();
  });

  it("bỏ qua field role gửi kèm — không cho tự phong ADMIN", async () => {
    vi.mocked(getSession).mockResolvedValue(adminSession);
    vi.mocked(userService.create).mockResolvedValue({
      id: "u-2",
      email: "new@example.com",
      username: "u",
      fullName: null,
      roleName: "Người dùng",
      emailVerifiedAt: null,
      status: "ACTIVE",
      lockedUntil: null,
      role: "USER",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await createUserAction({}, form({ email: "new@example.com", role: "ADMIN" }));

    expect(vi.mocked(userService.create).mock.calls[0]?.[0].roleKey).toBeUndefined();
  });

  it("trả lỗi theo field khi email sai định dạng", async () => {
    vi.mocked(getSession).mockResolvedValue(adminSession);

    const result = await createUserAction({}, form({ email: "khong-phai-email" }));

    expect(result.fieldErrors?.email).toBeDefined();
    expect(userService.create).not.toHaveBeenCalled();
  });

  /**
   * Bài test này canh một lỗi đã xảy ra thật và KHÔNG lỗi nào bắt được nó:
   * form gửi `name` trong khi schema đã đổi sang `fullName`. Zod strip im lặng
   * khoá lạ nên parse vẫn thành công, typecheck vẫn xanh (`safeParse` nhận
   * `unknown`), chỉ có dữ liệu người dùng vừa nhập là biến mất.
   *
   * Vì vậy phải khẳng định trên ĐỐI SỐ THẬT truyền xuống service, chứ không
   * chỉ khẳng định action chạy xong không lỗi.
   */
  it("chuyển tiếp fullName và username xuống service", async () => {
    vi.mocked(getSession).mockResolvedValue(adminSession);
    vi.mocked(userService.create).mockResolvedValue({
      id: "u-3",
      email: "new@example.com",
      username: "nguyenvana",
      fullName: "Nguyễn Văn A",
      roleName: "Người dùng",
      emailVerifiedAt: null,
      status: "ACTIVE",
      lockedUntil: null,
      role: "USER",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await createUserAction(
      {},
      form({
        email: "new@example.com",
        fullName: "Nguyễn Văn A",
        username: "nguyenvana",
      }),
    );

    expect(vi.mocked(userService.create).mock.calls[0]?.[0]).toMatchObject({
      email: "new@example.com",
      fullName: "Nguyễn Văn A",
      username: "nguyenvana",
    });
  });

  it("đưa lỗi trùng tên đăng nhập về đúng ô username", async () => {
    vi.mocked(getSession).mockResolvedValue(adminSession);
    vi.mocked(userService.create).mockRejectedValue(new UsernameAlreadyExistsError("trung"));

    const result = await createUserAction(
      {},
      form({ email: "new@example.com", username: "trung" }),
    );

    expect(result.fieldErrors?.username?.[0]).toContain("trung");
  });
});

describe("deleteUserAction", () => {
  it("từ chối khi chưa đăng nhập", async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const result = await deleteUserAction("victim-id");

    expect(result.error).toContain("đăng nhập");
    expect(userService.delete).not.toHaveBeenCalled();
  });

  it("từ chối user thường — đây là lỗ hổng của bản cũ", async () => {
    vi.mocked(getSession).mockResolvedValue(userSession);

    const result = await deleteUserAction("victim-id");

    expect(result.error).toContain("không có quyền");
    expect(userService.delete).not.toHaveBeenCalled();
  });

  it("truyền actorId xuống service để service tự áp luật tự-xoá", async () => {
    vi.mocked(getSession).mockResolvedValue(adminSession);
    vi.mocked(userService.delete).mockRejectedValue(new SelfDeletionError());

    const result = await deleteUserAction(adminSession.sub);

    // Action không tự kiểm luật nữa — nó chỉ chuyển tiếp danh tính người thao
    // tác và hiển thị lỗi service trả về.
    expect(userService.delete).toHaveBeenCalledWith(adminSession.sub, adminSession.sub);
    expect(result.error).toContain("tự xoá");
  });

  it("cho phép admin xoá người khác", async () => {
    vi.mocked(getSession).mockResolvedValue(adminSession);
    vi.mocked(userService.delete).mockResolvedValue({
      id: "victim-id",
      email: "victim@example.com",
      username: "u",
      fullName: null,
      roleName: "Người dùng",
      emailVerifiedAt: null,
      status: "ACTIVE",
      lockedUntil: null,
      role: "USER",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await deleteUserAction("victim-id");

    expect(result.error).toBeUndefined();
    expect(userService.delete).toHaveBeenCalledWith("victim-id", adminSession.sub);
  });
});

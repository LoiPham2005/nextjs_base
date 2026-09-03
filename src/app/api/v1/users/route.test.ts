import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as UserServiceModule from "@/services/user.service";

/**
 * Proxy cố tình không chạy trên /api, nên route handler là lớp kiểm quyền duy
 * nhất. Những test này khoá chặt điều đó — mất nó là API mở toang.
 */

const cookieStore = { get: vi.fn() };
vi.mock("next/headers", () => ({ cookies: () => Promise.resolve(cookieStore) }));

vi.mock("@/services/user.service", async (importOriginal) => {
  const actual = await importOriginal<typeof UserServiceModule>();
  return { ...actual, userService: { list: vi.fn(), count: vi.fn(), create: vi.fn() } };
});

/**
 * Từ khi vai trò xuống database, `requireApiPermission` phải tra bảng phân
 * quyền. Mock lại để test route không cần một Postgres đang chạy — thứ đang
 * được kiểm ở đây là cách route phản ứng với quyền, không phải cách quyền được
 * đọc lên (đã có `permission.service.test.ts` lo).
 */
vi.mock("@/services/permission.service", () => ({
  permissionService: { can: vi.fn(), canActOnResource: vi.fn() },
}));

import { signSession } from "@/lib/session";
import { userService } from "@/services/user.service";
import { permissionService } from "@/services/permission.service";
import { GET, POST } from "./route";

const admin = { sub: "admin-1", email: "admin@example.com", role: "ADMIN" as const };
const user = { sub: "user-1", email: "user@example.com", role: "USER" as const };

type ErrorBody = { error: { code: string } };
type ListBody = {
  data: { users: unknown[]; pagination: { perPage: number; nextCursor: string | null } };
};

async function get(token?: string, query = "") {
  return GET(
    new Request(`http://localhost/api/v1/users${query}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  cookieStore.get.mockReturnValue(undefined);
  vi.mocked(userService.list).mockResolvedValue({ users: [], nextCursor: null });
  vi.mocked(userService.count).mockResolvedValue(0);
  // Mặc định: ADMIN có quyền, USER thì không.
  vi.mocked(permissionService.can).mockImplementation((roleKey) =>
    Promise.resolve(roleKey === "ADMIN"),
  );
});

describe("GET /api/v1/users", () => {
  it("401 khi không có token", async () => {
    const response = await get();

    expect(response.status).toBe(401);
    expect(((await response.json()) as ErrorBody).error.code).toBe("UNAUTHENTICATED");
    expect(userService.list).not.toHaveBeenCalled();
  });

  it("403 khi token là USER thường", async () => {
    const response = await get(await signSession(user));

    expect(response.status).toBe(403);
    expect(userService.list).not.toHaveBeenCalled();
  });

  it("200 kèm phân trang kiểu cursor khi là ADMIN", async () => {
    vi.mocked(userService.list).mockResolvedValue({ users: [], nextCursor: "u-99" });

    const response = await get(await signSession(admin), "?cursor=u-1&perPage=20");
    const body = (await response.json()) as ListBody;

    expect(response.status).toBe(200);
    expect(body.data.pagination).toEqual({ perPage: 20, nextCursor: "u-99" });
    expect(vi.mocked(userService.list).mock.calls[0]?.[0]).toEqual({ cursor: "u-1", take: 20 });
  });

  it("chặn perPage vượt trần thay vì cho kéo cả bảng", async () => {
    const response = await get(await signSession(admin), "?perPage=100000");

    expect(response.status).toBe(422);
    expect(userService.list).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/users", () => {
  async function post(token: string | undefined, body: unknown) {
    return POST(
      new Request("http://localhost/api/v1/users", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      }),
    );
  }

  it("401 khi không có token", async () => {
    const response = await post(undefined, { email: "new@example.com" });

    expect(response.status).toBe(401);
    expect(userService.create).not.toHaveBeenCalled();
  });

  it("403 khi là USER thường", async () => {
    const response = await post(await signSession(user), { email: "new@example.com" });

    expect(response.status).toBe(403);
    expect(userService.create).not.toHaveBeenCalled();
  });

  it("422 khi body sai định dạng", async () => {
    const response = await post(await signSession(admin), { email: "khong-phai-email" });

    expect(response.status).toBe(422);
    expect(userService.create).not.toHaveBeenCalled();
  });

  it("201 khi ADMIN tạo user hợp lệ, và ADMIN được phép chỉ định role", async () => {
    vi.mocked(userService.create).mockResolvedValue({
      id: "u-2",
      email: "new@example.com",
      username: "u",
      fullName: null,
      roleName: "Người dùng",
      emailVerifiedAt: null,
      status: "ACTIVE",
      lockedUntil: null,
      roles: "ADMIN",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await post(await signSession(admin), {
      email: "new@example.com",
      roleKey: "ADMIN",
    });

    expect(response.status).toBe(201);
    expect(vi.mocked(userService.create).mock.calls[0]?.[0].roleKeys).toBe("ADMIN");
  });
});

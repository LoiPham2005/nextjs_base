import { beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionService } from "./permission.service";

vi.mock("@/lib/prisma", () => ({
  prisma: { role: { findMany: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";

/**
 * `findMany` được gọi kèm `select` lồng, nên kiểu Prisma sinh ra không khớp
 * với fixture rút gọn. Gói lại một chỗ thay vì rải ép kiểu khắp file.
 */
function mockRoles(rows: unknown[]) {
  vi.mocked(prisma.role.findMany).mockResolvedValue(rows as never);
}

/** Dựng dữ liệu đúng hình dạng mà `load()` truy vấn. */
function roleRow(key: string, permissionKeys: string[]) {
  return {
    key,
    permissions: permissionKeys.map((permissionKey) => ({
      permission: { key: permissionKey },
    })),
  };
}

const DEFAULT_ROWS = [
  roleRow("ADMIN", ["user:read", "user:delete", "profile:read:own"]),
  roleRow("USER", ["profile:read:own", "profile:update:own"]),
];

describe("PermissionService.can", () => {
  let service: PermissionService;

  beforeEach(() => {
    service = new PermissionService();
    vi.clearAllMocks();
    mockRoles(DEFAULT_ROWS);
  });

  it("trả về đúng quyền của từng vai trò", async () => {
    expect(await service.can("ADMIN", "user:delete")).toBe(true);
    expect(await service.can("USER", "user:delete")).toBe(false);
    expect(await service.can("USER", "profile:read:own")).toBe(true);
  });

  it("vai trò không tồn tại thì không có quyền nào", async () => {
    // Vai trò bị xoá khỏi database nhưng token cũ vẫn mang khoá đó. Phải trả
    // về tập rỗng, tuyệt đối không được coi là "chưa cấu hình nên cho qua".
    expect(await service.can("KHONG_TON_TAI", "user:read")).toBe(false);
    expect((await service.permissionsFor("KHONG_TON_TAI")).size).toBe(0);
  });

  it("bỏ qua quyền có trong database nhưng không còn trong code", async () => {
    mockRoles([roleRow("ADMIN", ["user:read", "quyen:da:bi:xoa"])]);

    const granted = await service.permissionsFor("ADMIN");

    expect(granted.has("user:read")).toBe(true);
    expect(granted.size).toBe(1);
  });
});

describe("PermissionService — cache", () => {
  let service: PermissionService;

  beforeEach(() => {
    service = new PermissionService();
    vi.clearAllMocks();
    mockRoles(DEFAULT_ROWS);
  });

  it("chỉ truy vấn database một lần cho nhiều lần kiểm tra", async () => {
    await service.can("ADMIN", "user:read");
    await service.can("USER", "profile:read:own");
    await service.can("ADMIN", "user:delete");

    expect(prisma.role.findMany).toHaveBeenCalledOnce();
  });

  it("gộp các lần nạp đồng thời thành một truy vấn", async () => {
    // Không gộp thì mọi request đến cùng lúc cache hết hạn đều bắn truy vấn —
    // đúng vào thời điểm hệ thống đang tải cao nhất.
    await Promise.all([
      service.can("ADMIN", "user:read"),
      service.can("USER", "user:read"),
      service.can("ADMIN", "user:delete"),
    ]);

    expect(prisma.role.findMany).toHaveBeenCalledOnce();
  });

  it("nạp lại sau khi invalidate", async () => {
    await service.can("ADMIN", "user:read");
    service.invalidate();
    await service.can("ADMIN", "user:read");

    expect(prisma.role.findMany).toHaveBeenCalledTimes(2);
  });

  it("thấy được thay đổi phân quyền sau khi invalidate", async () => {
    expect(await service.can("USER", "user:read")).toBe(false);

    mockRoles([roleRow("USER", ["user:read"])]);

    // Chưa invalidate thì vẫn đọc từ cache — đây là hành vi đúng, và cũng là
    // lý do mọi thao tác ghi phân quyền BẮT BUỘC phải gọi invalidate().
    expect(await service.can("USER", "user:read")).toBe(false);

    service.invalidate();
    expect(await service.can("USER", "user:read")).toBe(true);
  });
});

describe("PermissionService — canAny / canAll / canActOnResource", () => {
  let service: PermissionService;

  beforeEach(() => {
    service = new PermissionService();
    vi.clearAllMocks();
    mockRoles(DEFAULT_ROWS);
  });

  it("canAny đúng khi có ít nhất một quyền", async () => {
    expect(await service.canAny("USER", ["user:delete", "profile:read:own"])).toBe(true);
    expect(await service.canAny("USER", ["user:delete", "user:read"])).toBe(false);
  });

  it("canAll chỉ đúng khi có đủ mọi quyền", async () => {
    expect(await service.canAll("USER", ["profile:read:own", "profile:update:own"])).toBe(true);
    expect(await service.canAll("USER", ["profile:read:own", "user:read"])).toBe(false);
  });

  it("danh sách rỗng: canAny false, canAll true", async () => {
    // Quy ước toán học chuẩn. Ghi lại thành test để không ai "sửa cho hợp lý"
    // rồi vô tình mở toang một endpoint đang truyền vào mảng rỗng.
    expect(await service.canAny("ADMIN", [])).toBe(false);
    expect(await service.canAll("USER", [])).toBe(true);
  });

  it("canActOnResource: ADMIN thao tác được trên dữ liệu người khác", async () => {
    const perms = { any: "user:read", own: "profile:read:own" } as const;

    expect(await service.canActOnResource("ADMIN", "owner-1", "admin-1", perms)).toBe(true);
  });

  it("canActOnResource: USER chỉ thao tác được trên dữ liệu của mình", async () => {
    const perms = { any: "user:read", own: "profile:read:own" } as const;

    expect(await service.canActOnResource("USER", "u-1", "u-1", perms)).toBe(true);
    expect(await service.canActOnResource("USER", "u-2", "u-1", perms)).toBe(false);
  });
});

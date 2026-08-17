import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RoleInUseError,
  RoleNotFoundError,
  RoleService,
  SystemRoleImmutableError,
  UnknownPermissionError,
} from "./role.service";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    role: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    permission: { findMany: vi.fn() },
    rolePermission: { deleteMany: vi.fn(), createMany: vi.fn() },
    $transaction: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("./permission.service", () => ({
  permissionService: { invalidate: vi.fn() },
}));

import { prisma } from "@/lib/prisma";
import { permissionService } from "./permission.service";

const service = new RoleService();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RoleService.delete", () => {
  it("từ chối xoá vai trò hệ thống", async () => {
    vi.mocked(prisma.role.findUnique).mockResolvedValue({
      id: "r-1",
      isSystem: true,
      _count: { users: 0 },
    } as never);

    // Xoá mất ADMIN là khoá cửa cả hệ thống, và không còn ai đủ quyền tạo lại.
    await expect(service.delete("ADMIN")).rejects.toThrow(SystemRoleImmutableError);
    expect(prisma.role.delete).not.toHaveBeenCalled();
  });

  it("từ chối xoá vai trò còn người dùng, và nói rõ còn bao nhiêu", async () => {
    vi.mocked(prisma.role.findUnique).mockResolvedValue({
      id: "r-2",
      isSystem: false,
      _count: { users: 3 },
    } as never);

    await expect(service.delete("KE_TOAN")).rejects.toThrow(RoleInUseError);
    // `users.roleId` là khoá ngoại bắt buộc nên database cũng chặn — nhưng nó
    // chặn bằng lỗi ràng buộc thô, không nói được câu người bấm nút hiểu được.
    await expect(service.delete("KE_TOAN")).rejects.toThrow("3 người dùng");
    expect(prisma.role.delete).not.toHaveBeenCalled();
  });

  it("xoá được vai trò tự tạo đang không ai dùng, và xoá cache phân quyền", async () => {
    vi.mocked(prisma.role.findUnique).mockResolvedValue({
      id: "r-3",
      isSystem: false,
      _count: { users: 0 },
    } as never);

    await service.delete("KE_TOAN");

    expect(prisma.role.delete).toHaveBeenCalledWith({ where: { id: "r-3" } });
    expect(permissionService.invalidate).toHaveBeenCalledOnce();
  });

  it("báo không tìm thấy khi vai trò không tồn tại", async () => {
    vi.mocked(prisma.role.findUnique).mockResolvedValue(null);

    await expect(service.delete("KHONG_CO")).rejects.toThrow(RoleNotFoundError);
  });
});

describe("RoleService.update", () => {
  beforeEach(() => {
    vi.mocked(prisma.role.findUnique).mockResolvedValue({ id: "r-1" } as never);
  });

  it("bác quyền không có trong danh mục của code", async () => {
    // Danh mục quyền TỒN TẠI nằm trong code, không phải database. Nhận bừa một
    // khoá lạ là tạo ra hàng phân quyền không dòng mã nào kiểm tra tới.
    vi.mocked(prisma.permission.findMany).mockResolvedValue([
      { id: "p-1", key: "user:read" },
    ] as never);

    await expect(
      service.update("KE_TOAN", {
        permissions: ["user:read", "khong:ton:tai"] as never,
      }),
    ).rejects.toThrow(UnknownPermissionError);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("thay thế TOÀN BỘ danh sách quyền, không phải chỉ thêm", async () => {
    vi.mocked(prisma.permission.findMany).mockResolvedValue([
      { id: "p-1", key: "user:read" },
    ] as never);
    // findByKey ở cuối update() đọc lại bản ghi đầy đủ.
    vi.mocked(prisma.role.findUnique)
      .mockResolvedValueOnce({ id: "r-1" } as never)
      .mockResolvedValue({
        key: "KE_TOAN",
        name: "Kế toán",
        description: null,
        isSystem: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        permissions: [{ permission: { key: "user:read" } }],
        _count: { users: 0 },
      } as never);

    await service.update("KE_TOAN", { permissions: ["user:read"] });

    // Xoá sạch rồi tạo lại — đó là thứ khiến việc bỏ tick thực sự gỡ được
    // quyền. Với ngữ nghĩa "chỉ thêm" thì giao diện không bao giờ gỡ được gì.
    expect(prisma.rolePermission.deleteMany).toHaveBeenCalledWith({ where: { roleId: "r-1" } });
    expect(permissionService.invalidate).toHaveBeenCalledOnce();
  });

  it("không đụng tới bảng phân quyền khi chỉ đổi tên", async () => {
    vi.mocked(prisma.role.findUnique)
      .mockResolvedValueOnce({ id: "r-1" } as never)
      .mockResolvedValue({
        key: "KE_TOAN",
        name: "Kế toán trưởng",
        description: null,
        isSystem: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        permissions: [],
        _count: { users: 0 },
      } as never);

    await service.update("KE_TOAN", { name: "Kế toán trưởng" });

    expect(prisma.rolePermission.deleteMany).not.toHaveBeenCalled();
  });
});

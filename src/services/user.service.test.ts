import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import {
  SelfDeletionError,
  UserAlreadyExistsError,
  UserNotFoundError,
  UserService,
} from "./user.service";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  },
}));

// bcrypt cost 12 tốn ~250ms mỗi lần gọi — quá đắt cho unit test.
vi.mock("@/lib/crypto", () => ({
  CryptoUtils: {
    hashPassword: vi.fn().mockResolvedValue("hashed"),
    comparePassword: vi.fn(),
    fakeCompare: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { CryptoUtils } from "@/lib/crypto";

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError("boom", {
    code,
    clientVersion: "test",
  });
}

// `prisma.user.create` được khai báo kiểu theo cả model, kể cả khi service
// dùng `select` để loại bỏ password. Mock vì thế phải khớp model đầy đủ.
const sampleUser = {
  id: "u-1",
  email: "test@example.com",
  password: null,
  name: "Test",
  role: "USER" as const,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

describe("UserService", () => {
  let service: UserService;

  beforeEach(() => {
    service = new UserService();
    vi.clearAllMocks();
  });

  describe("create", () => {
    it("tạo user và hash mật khẩu", async () => {
      vi.mocked(prisma.user.create).mockResolvedValue(sampleUser);

      const user = await service.create({ email: "test@example.com", password: "secret123" });

      expect(CryptoUtils.hashPassword).toHaveBeenCalledWith("secret123");
      expect(user.email).toBe("test@example.com");

      // Kiểm tra cái thật sự quan trọng: query gửi xuống Prisma không hề chọn
      // cột password, nên nó không thể rò ra ngoài service.
      const callArgs = vi.mocked(prisma.user.create).mock.calls[0]?.[0];
      expect(callArgs?.select).not.toHaveProperty("password");
      expect(callArgs?.select).toMatchObject({ id: true, email: true, role: true });
    });

    it("lưu password null khi không truyền mật khẩu", async () => {
      vi.mocked(prisma.user.create).mockResolvedValue(sampleUser);

      await service.create({ email: "test@example.com" });

      expect(CryptoUtils.hashPassword).not.toHaveBeenCalled();
      expect(vi.mocked(prisma.user.create).mock.calls[0]?.[0]).toMatchObject({
        data: { password: null },
      });
    });

    it("đổi lỗi P2002 của Prisma thành UserAlreadyExistsError", async () => {
      vi.mocked(prisma.user.create).mockRejectedValue(prismaError("P2002"));

      await expect(service.create({ email: "dup@example.com" })).rejects.toThrow(
        UserAlreadyExistsError,
      );
    });

    it("không nuốt lỗi lạ", async () => {
      vi.mocked(prisma.user.create).mockRejectedValue(new Error("connection lost"));

      await expect(service.create({ email: "x@example.com" })).rejects.toThrow("connection lost");
    });
  });

  describe("list", () => {
    it("mặc định lấy 50 bản ghi", async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);

      await service.list();

      expect(vi.mocked(prisma.user.findMany).mock.calls[0]?.[0]).toMatchObject({ take: 50 });
    });

    it("chặn trần ở 100 dù caller yêu cầu nhiều hơn", async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);

      await service.list({ take: 100_000 });

      expect(vi.mocked(prisma.user.findMany).mock.calls[0]?.[0]).toMatchObject({ take: 100 });
    });
  });

  describe("delete", () => {
    it("đổi lỗi P2025 thành UserNotFoundError", async () => {
      vi.mocked(prisma.user.delete).mockRejectedValue(prismaError("P2025"));

      await expect(service.delete("missing", "admin-1")).rejects.toThrow(UserNotFoundError);
    });

    // Luật nghiệp vụ nằm ở service nên MỌI cửa vào đều được bảo vệ, kể cả cửa
    // chưa tồn tại. Trước đây nó bị chép lại ở Server Action và route handler.
    it("chặn tự xoá chính mình, và không hề chạm tới database", async () => {
      await expect(service.delete("u-1", "u-1")).rejects.toThrow(SelfDeletionError);

      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it("cho phép xoá người khác", async () => {
      vi.mocked(prisma.user.delete).mockResolvedValue(sampleUser);

      await expect(service.delete("u-2", "admin-1")).resolves.toBeDefined();
    });

    it("actorId = null (tiến trình hệ thống) thì không bị chặn", async () => {
      vi.mocked(prisma.user.delete).mockResolvedValue(sampleUser);

      await expect(service.delete("u-1", null)).resolves.toBeDefined();
    });
  });
});

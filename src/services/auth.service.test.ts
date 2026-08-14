import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService, InvalidCredentialsError } from "./auth.service";

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() } },
}));

vi.mock("@/lib/crypto", () => ({
  CryptoUtils: {
    hashPassword: vi.fn().mockResolvedValue("$argon2id$v=19$m=19456,t=2,p=1$new"),
    verifyPassword: vi.fn(),
    fakeCompare: vi.fn().mockResolvedValue(undefined),
  },
}));

import { prisma } from "@/lib/prisma";
import { CryptoUtils } from "@/lib/crypto";

/**
 * `findUnique` ở đây được gọi kèm `select` lồng, nên kiểu Prisma sinh ra không
 * khớp với fixture phẳng. Gói lại một chỗ thay vì rải ép kiểu khắp file.
 */
function mockUser(value: unknown) {
  vi.mocked(prisma.user.findUnique).mockResolvedValue(value as never);
}

/**
 * Hình dạng bản ghi mà `validateCredentials` truy vấn: có `password` và có
 * `role` ở dạng quan hệ lồng.
 */
const storedUser = {
  id: "u-1",
  email: "user@example.com",
  username: "user",
  fullName: "User",
  password: "$2a$12$hash",
  emailVerifiedAt: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  role: { key: "USER", name: "Người dùng" },
};

/** Kết quả kiểm tra mật khẩu, viết gọn cho các ca kiểm thử. */
const ok = { valid: true, needsRehash: false };
const okNeedsRehash = { valid: true, needsRehash: true };
const wrong = { valid: false, needsRehash: false };

describe("AuthService.validateCredentials", () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService();
    vi.clearAllMocks();
  });

  it("trả về user không kèm password khi đúng thông tin", async () => {
    mockUser(storedUser);
    vi.mocked(CryptoUtils.verifyPassword).mockResolvedValue(ok);

    const user = await service.validateCredentials({
      identifier: "user@example.com",
      password: "correct",
    });

    expect(user).not.toHaveProperty("password");
    expect(user.id).toBe("u-1");
  });

  it("báo lỗi khi sai mật khẩu", async () => {
    mockUser(storedUser);
    vi.mocked(CryptoUtils.verifyPassword).mockResolvedValue(wrong);

    await expect(
      service.validateCredentials({ identifier: "user@example.com", password: "wrong" }),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it("vẫn tốn thời gian so sánh khi email không tồn tại", async () => {
    mockUser(null);

    await expect(
      service.validateCredentials({ identifier: "ghost@example.com", password: "any" }),
    ).rejects.toThrow(InvalidCredentialsError);

    // Không có bước này, thời gian phản hồi tiết lộ email nào đã đăng ký.
    expect(CryptoUtils.fakeCompare).toHaveBeenCalledOnce();
  });

  it("từ chối tài khoản chưa đặt mật khẩu", async () => {
    mockUser({ ...storedUser, password: null });

    await expect(
      service.validateCredentials({ identifier: "user@example.com", password: "any" }),
    ).rejects.toThrow(InvalidCredentialsError);

    expect(CryptoUtils.verifyPassword).not.toHaveBeenCalled();
  });

  it("dùng cùng một thông điệp lỗi cho mọi nhánh thất bại", async () => {
    mockUser(null);
    const notFound = await service
      .validateCredentials({ identifier: "ghost@example.com", password: "x" })
      .catch((error: Error) => error.message);

    mockUser(storedUser);
    vi.mocked(CryptoUtils.verifyPassword).mockResolvedValue(wrong);
    const wrongPassword = await service
      .validateCredentials({ identifier: "user@example.com", password: "x" })
      .catch((error: Error) => error.message);

    expect(notFound).toBe(wrongPassword);
  });
});

describe("AuthService — nâng cấp hash mật khẩu khi đăng nhập", () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService();
    vi.clearAllMocks();
  });

  it("băm lại và ghi đè khi hash đang dùng thuật toán cũ", async () => {
    mockUser(storedUser);
    vi.mocked(CryptoUtils.verifyPassword).mockResolvedValue(okNeedsRehash);

    await service.validateCredentials({ identifier: "user@example.com", password: "correct" });

    expect(CryptoUtils.hashPassword).toHaveBeenCalledWith("correct");
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u-1" },
      data: { password: "$argon2id$v=19$m=19456,t=2,p=1$new" },
    });
  });

  it("không đụng vào database khi hash đã đạt chuẩn hiện tại", async () => {
    mockUser(storedUser);
    vi.mocked(CryptoUtils.verifyPassword).mockResolvedValue(ok);

    await service.validateCredentials({ identifier: "user@example.com", password: "correct" });

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("vẫn cho đăng nhập khi việc nâng cấp hash thất bại", async () => {
    mockUser(storedUser);
    vi.mocked(CryptoUtils.verifyPassword).mockResolvedValue(okNeedsRehash);
    vi.mocked(prisma.user.update).mockRejectedValue(new Error("database down"));

    // Người dùng đã nhập đúng mật khẩu. Một thao tác nền thất bại không được
    // phép biến thành lỗi đăng nhập.
    const user = await service.validateCredentials({
      identifier: "user@example.com",
      password: "correct",
    });

    expect(user.id).toBe("u-1");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService, InvalidCredentialsError } from "./auth.service";

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn(), create: vi.fn() } },
}));

vi.mock("@/lib/crypto", () => ({
  CryptoUtils: {
    hashPassword: vi.fn().mockResolvedValue("hashed"),
    comparePassword: vi.fn(),
    fakeCompare: vi.fn().mockResolvedValue(undefined),
  },
}));

import { prisma } from "@/lib/prisma";
import { CryptoUtils } from "@/lib/crypto";

const storedUser = {
  id: "u-1",
  email: "user@example.com",
  password: "$2a$12$hash",
  name: "User",
  role: "USER" as const,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

describe("AuthService.validateCredentials", () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService();
    vi.clearAllMocks();
  });

  it("trả về user không kèm password khi đúng thông tin", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(storedUser);
    vi.mocked(CryptoUtils.comparePassword).mockResolvedValue(true);

    const user = await service.validateCredentials({
      email: "user@example.com",
      password: "correct",
    });

    expect(user).not.toHaveProperty("password");
    expect(user.id).toBe("u-1");
  });

  it("báo lỗi khi sai mật khẩu", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(storedUser);
    vi.mocked(CryptoUtils.comparePassword).mockResolvedValue(false);

    await expect(
      service.validateCredentials({ email: "user@example.com", password: "wrong" }),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it("vẫn tốn thời gian so sánh khi email không tồn tại", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    await expect(
      service.validateCredentials({ email: "ghost@example.com", password: "any" }),
    ).rejects.toThrow(InvalidCredentialsError);

    // Không có bước này, thời gian phản hồi tiết lộ email nào đã đăng ký.
    expect(CryptoUtils.fakeCompare).toHaveBeenCalledOnce();
  });

  it("từ chối tài khoản chưa đặt mật khẩu", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...storedUser, password: null });

    await expect(
      service.validateCredentials({ email: "user@example.com", password: "any" }),
    ).rejects.toThrow(InvalidCredentialsError);

    expect(CryptoUtils.comparePassword).not.toHaveBeenCalled();
  });

  it("dùng cùng một thông điệp lỗi cho mọi nhánh thất bại", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    const notFound = await service
      .validateCredentials({ email: "ghost@example.com", password: "x" })
      .catch((error: Error) => error.message);

    vi.mocked(prisma.user.findUnique).mockResolvedValue(storedUser);
    vi.mocked(CryptoUtils.comparePassword).mockResolvedValue(false);
    const wrongPassword = await service
      .validateCredentials({ email: "user@example.com", password: "x" })
      .catch((error: Error) => error.message);

    expect(notFound).toBe(wrongPassword);
  });
});

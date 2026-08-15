import { beforeEach, describe, expect, it, vi } from "vitest";
import { OAuthEmailRequiredError } from "@/lib/oauth/types";
import type { OAuthProfile } from "@/lib/oauth/types";
import { AccountBannedError, InvalidCredentialsError } from "./auth.service";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    account: { findUnique: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("./user.service", () => ({
  userService: { findById: vi.fn(), findByEmail: vi.fn(), createOAuthUser: vi.fn() },
}));

import { prisma } from "@/lib/prisma";
import { userService } from "./user.service";
import { OAuthService } from "./oauth.service";

function publicUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "u-1",
    email: "user@example.com",
    username: null,
    fullName: "User",
    role: "USER",
    roleName: "Người dùng",
    emailVerifiedAt: new Date("2026-01-01"),
    status: "ACTIVE",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  } as never;
}

function profile(overrides: Partial<OAuthProfile> = {}): OAuthProfile {
  return {
    provider: "google",
    providerAccountId: "g-123",
    email: "user@example.com",
    fullName: "User",
    ...overrides,
  };
}

describe("OAuthService.loginWithProfile", () => {
  let service: OAuthService;

  beforeEach(() => {
    service = new OAuthService();
    vi.clearAllMocks();
  });

  it("đăng nhập thẳng nếu Account đã liên kết trước đó", async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue({ userId: "u-1" } as never);
    vi.mocked(userService.findById).mockResolvedValue(publicUser());

    const user = await service.loginWithProfile(profile());

    expect(user.id).toBe("u-1");
    expect(userService.createOAuthUser).not.toHaveBeenCalled();
    expect(prisma.account.create).not.toHaveBeenCalled();
  });

  it("liên kết vào user có sẵn cùng email thay vì tạo mới", async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue(null);
    vi.mocked(userService.findByEmail).mockResolvedValue(publicUser({ id: "u-existing" }));

    const user = await service.loginWithProfile(profile());

    expect(user.id).toBe("u-existing");
    expect(userService.createOAuthUser).not.toHaveBeenCalled();
    expect(prisma.account.create).toHaveBeenCalledWith({
      data: { userId: "u-existing", provider: "google", providerAccountId: "g-123" },
    });
  });

  it("tạo user mới nếu chưa có Account lẫn chưa có user cùng email", async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue(null);
    vi.mocked(userService.findByEmail).mockResolvedValue(null);
    vi.mocked(userService.createOAuthUser).mockResolvedValue(publicUser({ id: "u-new" }));

    const user = await service.loginWithProfile(profile());

    expect(user.id).toBe("u-new");
    expect(userService.createOAuthUser).toHaveBeenCalledWith({
      email: "user@example.com",
      fullName: "User",
    });
  });

  it("từ chối khi provider không trả email đã xác thực và chưa từng liên kết", async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue(null);

    await expect(service.loginWithProfile(profile({ email: null }))).rejects.toThrow(
      OAuthEmailRequiredError,
    );

    expect(userService.findByEmail).not.toHaveBeenCalled();
  });

  it("chặn đăng nhập khi tài khoản đã BANNED — kể cả khi mật khẩu không liên quan gì tới OAuth", async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue({ userId: "u-1" } as never);
    vi.mocked(userService.findById).mockResolvedValue(publicUser({ status: "BANNED" }));

    await expect(service.loginWithProfile(profile())).rejects.toThrow(AccountBannedError);
  });

  it("coi Account trỏ tới user đã xoá mềm như không có tài khoản nào cả", async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue({ userId: "u-deleted" } as never);
    vi.mocked(userService.findById).mockResolvedValue(null);

    await expect(service.loginWithProfile(profile())).rejects.toThrow(InvalidCredentialsError);
  });
});

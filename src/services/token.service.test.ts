import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RefreshTokenReuseError, TokenService } from "./token.service";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    refreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

const owner = { id: "u-1", email: "user@example.com", role: "USER" as const };

function storedToken(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "rt-1",
    tokenHash: "hash",
    userId: owner.id,
    expiresAt: new Date(Date.now() + 86_400_000),
    revokedAt: null,
    userAgent: null,
    createdAt: new Date(),
    user: owner,
    ...overrides,
  };
}

describe("TokenService", () => {
  let service: TokenService;

  beforeEach(() => {
    service = new TokenService();
    vi.clearAllMocks();
    vi.mocked(prisma.refreshToken.create).mockResolvedValue(storedToken());
    vi.mocked(prisma.refreshToken.updateMany).mockResolvedValue({ count: 1 });
  });

  describe("issue", () => {
    it("chỉ lưu SHA-256, không bao giờ lưu token gốc", async () => {
      const { token } = await service.issue(owner.id);

      const written = vi.mocked(prisma.refreshToken.create).mock.calls[0]?.[0].data;
      expect(written?.tokenHash).toBe(sha256(token));
      expect(JSON.stringify(written)).not.toContain(token);
    });

    it("mỗi lần cấp ra một token khác nhau", async () => {
      const first = await service.issue(owner.id);
      const second = await service.issue(owner.id);

      expect(first.token).not.toBe(second.token);
    });
  });

  describe("rotate", () => {
    it("thu hồi token cũ và cấp token mới", async () => {
      vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue(storedToken());

      const result = await service.rotate("old-token");

      expect(result?.owner.userId).toBe(owner.id);
      expect(
        vi.mocked(prisma.refreshToken.update).mock.calls[0]?.[0].data.revokedAt,
      ).toBeInstanceOf(Date);
      expect(prisma.refreshToken.create).toHaveBeenCalledOnce();
    });

    it("tra cứu bằng hash chứ không bằng token gốc", async () => {
      vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue(storedToken());

      await service.rotate("plain-token");

      expect(vi.mocked(prisma.refreshToken.findUnique).mock.calls[0]?.[0].where).toEqual({
        tokenHash: sha256("plain-token"),
      });
    });

    it("trả null khi token không tồn tại", async () => {
      vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue(null);

      await expect(service.rotate("unknown")).resolves.toBeNull();
    });

    it("trả null khi token đã hết hạn", async () => {
      vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue(
        storedToken({ expiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(service.rotate("expired")).resolves.toBeNull();
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it("dùng lại token đã thu hồi thì huỷ TOÀN BỘ phiên của tài khoản", async () => {
      vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue(
        storedToken({ revokedAt: new Date() }),
      );

      await expect(service.rotate("stolen")).rejects.toThrow(RefreshTokenReuseError);

      // Đây mới là điểm mấu chốt: không chỉ từ chối request này, mà đá cả
      // thiết bị thật lẫn kẻ trộm ra ngoài.
      expect(vi.mocked(prisma.refreshToken.updateMany).mock.calls[0]?.[0].where).toMatchObject({
        userId: owner.id,
        revokedAt: null,
      });
    });
  });

  describe("revoke", () => {
    it("thu hồi theo hash và bỏ qua token đã thu hồi từ trước", async () => {
      await service.revoke("some-token");

      expect(vi.mocked(prisma.refreshToken.updateMany).mock.calls[0]?.[0].where).toEqual({
        tokenHash: sha256("some-token"),
        revokedAt: null,
      });
    });
  });

  describe("purgeExpired", () => {
    it("chỉ xoá bản ghi đã hết hạn", async () => {
      vi.mocked(prisma.refreshToken.deleteMany).mockResolvedValue({ count: 3 });

      await expect(service.purgeExpired()).resolves.toBe(3);

      const where = vi.mocked(prisma.refreshToken.deleteMany).mock.calls[0]?.[0]?.where;
      const expiresAtFilter = where?.expiresAt as { lt?: unknown } | undefined;
      expect(expiresAtFilter?.lt).toBeInstanceOf(Date);
    });
  });
});

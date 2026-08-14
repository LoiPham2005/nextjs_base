import { beforeEach, describe, expect, it, vi } from "vitest";
import { VerificationService } from "./verification.service";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn().mockResolvedValue([]),
    verificationToken: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { hashOpaqueToken } from "@/lib/opaque-token";

const HOUR = 60 * 60 * 1000;

/** Bản ghi token hợp lệ, dùng làm nền cho các ca kiểm thử. */
function record(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "vt-1",
    tokenHash: "hash",
    type: "PASSWORD_RESET" as const,
    userId: "u-1",
    expiresAt: new Date(Date.now() + HOUR),
    usedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe("VerificationService.issue", () => {
  let service: VerificationService;

  beforeEach(() => {
    service = new VerificationService();
    vi.clearAllMocks();
  });

  it("trả về token gốc và hạn dùng", async () => {
    const issued = await service.issue("u-1", "PASSWORD_RESET");

    expect(issued.token).toBeTruthy();
    expect(issued.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("KHÔNG lưu token gốc — chỉ lưu bản băm", async () => {
    const issued = await service.issue("u-1", "PASSWORD_RESET");

    // Rò database mà lấy được token gốc thì mọi lớp bảo vệ khác đều vô nghĩa.
    expect(prisma.verificationToken.create).toHaveBeenCalledWith({
      data: {
        tokenHash: hashOpaqueToken(issued.token),
        type: "PASSWORD_RESET",
        userId: "u-1",
        expiresAt: issued.expiresAt,
      },
    });
    expect(hashOpaqueToken(issued.token)).not.toBe(issued.token);
  });

  it("xoá token cũ chưa dùng cùng loại, trong cùng một transaction", async () => {
    await service.issue("u-1", "PASSWORD_RESET");

    expect(prisma.verificationToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: "u-1", type: "PASSWORD_RESET", usedAt: null },
    });
    // Cùng transaction: không có khoảnh khắc nào token cũ đã mất mà token mới
    // chưa kịp ghi.
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it("hai lần cấp cho ra hai token khác nhau", async () => {
    const a = await service.issue("u-1", "PASSWORD_RESET");
    const b = await service.issue("u-1", "PASSWORD_RESET");

    expect(a.token).not.toBe(b.token);
  });

  it("token xác thực email có hạn dài hơn token đặt lại mật khẩu", async () => {
    const reset = await service.issue("u-1", "PASSWORD_RESET");
    const verify = await service.issue("u-1", "EMAIL_VERIFICATION");

    expect(verify.expiresAt.getTime()).toBeGreaterThan(reset.expiresAt.getTime());
  });
});

describe("VerificationService.consume", () => {
  let service: VerificationService;

  beforeEach(() => {
    service = new VerificationService();
    vi.clearAllMocks();
    vi.mocked(prisma.verificationToken.updateMany).mockResolvedValue({ count: 1 });
  });

  it("trả về userId và đánh dấu token đã dùng", async () => {
    // Đồng hồ giả để `new Date()` trong service ra giá trị xác định — nhờ vậy
    // khẳng định được chính xác thay vì chỉ kiểm tra "là một Date nào đó".
    const now = new Date("2026-08-14T10:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    try {
      vi.mocked(prisma.verificationToken.findUnique).mockResolvedValue(
        record({ expiresAt: new Date(now.getTime() + HOUR) }),
      );

      const userId = await service.consume("token-bat-ky", "PASSWORD_RESET");

      expect(userId).toBe("u-1");
      expect(prisma.verificationToken.updateMany).toHaveBeenCalledWith({
        where: { id: "vt-1", usedAt: null },
        data: { usedAt: now },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("tra cứu bằng bản băm chứ không phải token gốc", async () => {
    vi.mocked(prisma.verificationToken.findUnique).mockResolvedValue(record());

    await service.consume("token-bat-ky", "PASSWORD_RESET");

    expect(prisma.verificationToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashOpaqueToken("token-bat-ky") },
    });
  });

  it("từ chối token không tồn tại", async () => {
    vi.mocked(prisma.verificationToken.findUnique).mockResolvedValue(null);

    expect(await service.consume("khong-co", "PASSWORD_RESET")).toBeNull();
  });

  it("từ chối token sai loại", async () => {
    // Token đặt lại mật khẩu không được dùng để xác thực email và ngược lại —
    // nếu không, một link vô hại lại đổi được mật khẩu.
    vi.mocked(prisma.verificationToken.findUnique).mockResolvedValue(record());

    expect(await service.consume("token", "EMAIL_VERIFICATION")).toBeNull();
    expect(prisma.verificationToken.updateMany).not.toHaveBeenCalled();
  });

  it("từ chối token đã dùng", async () => {
    vi.mocked(prisma.verificationToken.findUnique).mockResolvedValue(
      record({ usedAt: new Date() }),
    );

    expect(await service.consume("token", "PASSWORD_RESET")).toBeNull();
  });

  it("từ chối token hết hạn", async () => {
    vi.mocked(prisma.verificationToken.findUnique).mockResolvedValue(
      record({ expiresAt: new Date(Date.now() - HOUR) }),
    );

    expect(await service.consume("token", "PASSWORD_RESET")).toBeNull();
  });

  it("từ chối khi một request khác vừa giành được token trước", async () => {
    // Hai request song song cùng một token: cả hai đều đọc thấy usedAt null,
    // nhưng chỉ một cái ghi được. Cái thua phải thất bại, không được đi tiếp.
    vi.mocked(prisma.verificationToken.findUnique).mockResolvedValue(record());
    vi.mocked(prisma.verificationToken.updateMany).mockResolvedValue({ count: 0 });

    expect(await service.consume("token", "PASSWORD_RESET")).toBeNull();
  });
});

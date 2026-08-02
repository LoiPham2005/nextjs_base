import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserService, UserAlreadyExistsError } from "./user.service";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";

describe("UserService", () => {
  let service: UserService;

  beforeEach(() => {
    service = new UserService();
    vi.clearAllMocks();
  });

  it("creates a user successfully", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: "u-1",
      email: "test@example.com",
      password: "hashed",
      name: "Test",
      role: "USER",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const user = await service.create({ email: "test@example.com", password: "secret" });
    expect(user.email).toBe("test@example.com");
  });

  it("throws UserAlreadyExistsError on duplicate email", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "existing",
      email: "dup@example.com",
      password: "",
      name: null,
      role: "USER",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(service.create({ email: "dup@example.com" })).rejects.toThrow(UserAlreadyExistsError);
  });
});

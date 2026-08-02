import { prisma } from "@/lib/prisma";
import type { CreateUserInput } from "@/schemas/user.schema";
import { CryptoUtils } from "@/lib/crypto";

export class UserService {
  async create(input: CreateUserInput) {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new UserAlreadyExistsError(input.email);
    }

    const hashedPassword = input.password ? await CryptoUtils.hashPassword(input.password) : "";

    return prisma.user.create({
      data: {
        email: input.email,
        password: hashedPassword,
        name: input.name,
        role: input.role ?? "USER",
      },
    });
  }

  async list() {
    return prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true },
    });
  }

  async delete(id: string) {
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new UserNotFoundError(id);
    }
    return prisma.user.delete({ where: { id } });
  }
}

export class UserAlreadyExistsError extends Error {
  constructor(email: string) {
    super(`User with email "${email}" already exists`);
    this.name = "UserAlreadyExistsError";
  }
}

export class UserNotFoundError extends Error {
  constructor(id: string) {
    super(`User with id "${id}" not found`);
    this.name = "UserNotFoundError";
  }
}

export const userService = new UserService();

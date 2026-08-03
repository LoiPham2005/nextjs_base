import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CryptoUtils } from "@/lib/crypto";
import type { CreateUserInput } from "@/schemas/user.schema";

/** Không bao giờ trả cột `password` ra khỏi service. */
const PUBLIC_USER_FIELDS = {
  id: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof PUBLIC_USER_FIELDS }>;

/** Trần cứng cho `take`, để một query độc hại không kéo cả bảng về. */
const MAX_PAGE_SIZE = 100;

export class UserService {
  async create(input: CreateUserInput): Promise<PublicUser> {
    const password = input.password ? await CryptoUtils.hashPassword(input.password) : null;

    try {
      return await prisma.user.create({
        data: {
          email: input.email,
          password,
          name: input.name,
          role: input.role ?? "USER",
        },
        select: PUBLIC_USER_FIELDS,
      });
    } catch (error) {
      // Dựa vào unique constraint thay vì "kiểm tra rồi mới ghi": hai request
      // đồng thời cùng một email đều vượt qua được bước kiểm tra, chỉ database
      // mới phân xử được.
      if (isPrismaError(error, "P2002")) {
        throw new UserAlreadyExistsError(input.email);
      }
      throw error;
    }
  }

  async list(options: { skip?: number; take?: number } = {}): Promise<PublicUser[]> {
    const take = Math.min(options.take ?? 50, MAX_PAGE_SIZE);

    return prisma.user.findMany({
      select: PUBLIC_USER_FIELDS,
      orderBy: { createdAt: "desc" },
      skip: options.skip ?? 0,
      take,
    });
  }

  async count(): Promise<number> {
    return prisma.user.count();
  }

  async findById(id: string): Promise<PublicUser | null> {
    return prisma.user.findUnique({ where: { id }, select: PUBLIC_USER_FIELDS });
  }

  async findByEmail(email: string): Promise<PublicUser | null> {
    return prisma.user.findUnique({ where: { email }, select: PUBLIC_USER_FIELDS });
  }

  async delete(id: string): Promise<PublicUser> {
    try {
      return await prisma.user.delete({ where: { id }, select: PUBLIC_USER_FIELDS });
    } catch (error) {
      if (isPrismaError(error, "P2025")) {
        throw new UserNotFoundError(id);
      }
      throw error;
    }
  }
}

function isPrismaError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

export class UserAlreadyExistsError extends Error {
  constructor(email: string) {
    super(`Email "${email}" đã được sử dụng`);
    this.name = "UserAlreadyExistsError";
  }
}

export class UserNotFoundError extends Error {
  constructor(id: string) {
    super(`Không tìm thấy người dùng có id "${id}"`);
    this.name = "UserNotFoundError";
  }
}

export const userService = new UserService();

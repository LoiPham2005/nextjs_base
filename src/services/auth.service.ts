import { prisma } from "@/lib/prisma";
import type { LoginInput, RegisterInput } from "@/schemas/auth.schema";
import { CryptoUtils } from "@/lib/crypto";
import { UserAlreadyExistsError } from "./user.service";

export class AuthService {
  async register(input: RegisterInput) {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new UserAlreadyExistsError(input.email);
    }

    const hashedPassword = await CryptoUtils.hashPassword(input.password);

    const user = await prisma.user.create({
      data: {
        email: input.email,
        password: hashedPassword,
        name: input.name,
        role: "USER",
      },
    });

    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async validateUser(input: LoginInput) {
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !user.password) {
      throw new InvalidCredentialsError();
    }

    const isValid = await CryptoUtils.comparePassword(input.password, user.password);
    if (!isValid) {
      throw new InvalidCredentialsError();
    }

    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Email hoặc mật khẩu không chính xác");
    this.name = "InvalidCredentialsError";
  }
}

export const authService = new AuthService();

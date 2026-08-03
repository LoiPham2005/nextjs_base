import "server-only";
import { prisma } from "@/lib/prisma";
import { CryptoUtils } from "@/lib/crypto";
import type { LoginInput, RegisterInput } from "@/schemas/auth.schema";
import { userService, type PublicUser } from "./user.service";

export class AuthService {
  async register(input: RegisterInput): Promise<PublicUser> {
    // Đi qua userService để tái dùng nguyên tắc xử lý trùng email ở đó.
    return userService.create({
      email: input.email,
      password: input.password,
      name: input.name,
      role: "USER",
    });
  }

  /**
   * Xác thực thông tin đăng nhập.
   *
   * Ba nhánh thất bại — email không tồn tại, tài khoản chưa đặt mật khẩu, sai
   * mật khẩu — đều ném cùng một lỗi và đều tiêu tốn thời gian như nhau. Nếu
   * không, chỉ cần đo thời gian phản hồi là biết được email nào đã đăng ký.
   */
  async validateCredentials(input: LoginInput): Promise<PublicUser> {
    const user = await prisma.user.findUnique({ where: { email: input.email } });

    if (!user?.password) {
      await CryptoUtils.fakeCompare(input.password);
      throw new InvalidCredentialsError();
    }

    const isValid = await CryptoUtils.comparePassword(input.password, user.password);
    if (!isValid) {
      throw new InvalidCredentialsError();
    }

    const { password: _password, ...publicUser } = user;
    return publicUser;
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Email hoặc mật khẩu không chính xác");
    this.name = "InvalidCredentialsError";
  }
}

export const authService = new AuthService();

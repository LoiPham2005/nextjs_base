import "server-only";
import { prisma } from "@/lib/prisma";
import { CryptoUtils } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { sendPasswordResetEmail, sendVerificationEmail } from "@/lib/emails";
import { SYSTEM_ROLES } from "@/lib/permissions";
import type { LoginInput, RegisterInput } from "@/schemas/auth.schema";
import { userService, type PublicUser } from "./user.service";
import { verificationService } from "./verification.service";
import { tokenService } from "./token.service";

export class AuthService {
  async register(input: RegisterInput): Promise<PublicUser> {
    // Đi qua userService để tái dùng nguyên tắc xử lý trùng email/username và
    // việc tra vai trò ở đó.
    return userService.create({
      email: input.email,
      password: input.password,
      username: input.username,
      fullName: input.fullName,
      roleKey: SYSTEM_ROLES.USER,
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
    // Ký tự `@` là thứ duy nhất phân biệt được hai loại: `usernameSchema` cấm
    // `@`, nên một chuỗi có `@` không thể là tên đăng nhập hợp lệ.
    const identifier = input.identifier.trim().toLowerCase();
    const isEmail = identifier.includes("@");

    const user = await prisma.user.findUnique({
      where: isEmail ? { email: identifier } : { username: identifier },
      select: {
        id: true,
        email: true,
        username: true,
        fullName: true,
        password: true,
        emailVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
        role: { select: { key: true, name: true } },
      },
    });

    if (!user?.password) {
      await CryptoUtils.fakeCompare(input.password);
      throw new InvalidCredentialsError();
    }

    const check = await CryptoUtils.verifyPassword(input.password, user.password);
    if (!check.valid) {
      throw new InvalidCredentialsError();
    }

    if (check.needsRehash) {
      await this.upgradePasswordHash(user.id, input.password);
    }

    const { password: _password, role, ...rest } = user;
    return { ...rest, role: role.key, roleName: role.name };
  }

  /**
   * Băm lại mật khẩu bằng thuật toán hiện hành và ghi đè.
   *
   * Đây là cách chuyển dần kho mật khẩu cũ (bcrypt) sang Argon2id mà không bắt
   * ai đổi mật khẩu: mỗi lần đăng nhập thành công là một bản ghi được nâng cấp.
   *
   * Lỗi ở đây bị nuốt có chủ đích. Người dùng vừa nhập đúng mật khẩu — chặn họ
   * đăng nhập chỉ vì thao tác nâng cấp nền phía sau thất bại là hành vi sai.
   * Lần đăng nhập sau sẽ thử lại.
   */
  private async upgradePasswordHash(userId: string, plainPassword: string): Promise<void> {
    try {
      const password = await CryptoUtils.hashPassword(plainPassword);
      await prisma.user.update({ where: { id: userId }, data: { password } });
    } catch (error) {
      logger.error("Không nâng cấp được hash mật khẩu", error, { userId });
    }
  }

  // ---------------------------------------------------------------------------
  // Xác thực email
  // ---------------------------------------------------------------------------

  /**
   * Cấp token xác thực và gửi email.
   *
   * Không làm gì nếu email đã được xác thực — tránh việc bấm nhầm nút "gửi lại"
   * làm mất hiệu lực trạng thái đang đúng.
   */
  async sendEmailVerification(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, emailVerifiedAt: true },
    });

    if (!user || user.emailVerifiedAt) return;

    const { token } = await verificationService.issue(user.id, "EMAIL_VERIFICATION");
    await sendVerificationEmail(user.email, token);
  }

  /**
   * Xác thực email bằng token trong link.
   *
   * Ghi `emailVerifiedAt` chỉ khi nó đang null. Người dùng bấm lại link cũ sau
   * khi đã xác thực thì không được ghi đè mốc thời gian ban đầu.
   */
  async verifyEmail(token: string): Promise<PublicUser> {
    const userId = await verificationService.consume(token, "EMAIL_VERIFICATION");
    if (!userId) throw new InvalidVerificationTokenError();

    await prisma.user.updateMany({
      where: { id: userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() },
    });

    const user = await userService.findById(userId);
    if (!user) throw new InvalidVerificationTokenError();

    return user;
  }

  // ---------------------------------------------------------------------------
  // Đặt lại mật khẩu
  // ---------------------------------------------------------------------------

  /**
   * Gửi link đặt lại mật khẩu.
   *
   * ⚠️ KHÔNG BAO GIỜ báo cho bên gọi biết email có tồn tại hay không. Endpoint
   * này công khai, nên bất kỳ khác biệt nào — giá trị trả về, mã lỗi, hay chỉ
   * là thời gian phản hồi — đều biến nó thành công cụ dò danh sách người dùng.
   *
   * Tài khoản chưa đặt mật khẩu (tạo bởi admin, hoặc đăng nhập qua OAuth) vẫn
   * được cấp link: đó chính là cách hợp lệ để họ đặt mật khẩu lần đầu.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    if (!user) return;

    const { token } = await verificationService.issue(user.id, "PASSWORD_RESET");
    await sendPasswordResetEmail(user.email, token);
  }

  /**
   * Đặt mật khẩu mới bằng token trong link.
   *
   * Thu hồi TOÀN BỘ refresh token của tài khoản sau khi đổi. Đây là phần bắt
   * buộc, không phải tuỳ chọn: kịch bản điển hình của luồng này là tài khoản đã
   * bị chiếm. Đổi mật khẩu mà để phiên cũ của kẻ tấn công còn sống thì việc đổi
   * gần như vô nghĩa.
   *
   * Cookie phiên web không thu hồi được từ đây (JWT đã ký), nhưng hạn của nó
   * ngắn hơn nhiều và nơi gọi nên xoá cookie hiện tại — xem route handler.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const userId = await verificationService.consume(token, "PASSWORD_RESET");
    if (!userId) throw new InvalidVerificationTokenError();

    const password = await CryptoUtils.hashPassword(newPassword);

    await prisma.user.update({ where: { id: userId }, data: { password } });
    await tokenService.revokeAllForUser(userId);

    logger.info("Mật khẩu được đặt lại", { userId });
  }

  /**
   * Đổi mật khẩu khi đang đăng nhập.
   *
   * Bắt nhập lại mật khẩu hiện tại dù người dùng đã đăng nhập: nếu không, ai
   * ngồi vào máy đang mở sẵn phiên là chiếm được tài khoản vĩnh viễn.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });

    if (!user?.password) {
      await CryptoUtils.fakeCompare(currentPassword);
      throw new InvalidCredentialsError();
    }

    const check = await CryptoUtils.verifyPassword(currentPassword, user.password);
    if (!check.valid) throw new InvalidCredentialsError();

    const password = await CryptoUtils.hashPassword(newPassword);

    await prisma.user.update({ where: { id: userId }, data: { password } });
    await tokenService.revokeAllForUser(userId);

    logger.info("Mật khẩu được đổi", { userId });
  }
}

/**
 * Dùng chung cho MỌI lý do token không dùng được: không tồn tại, sai loại, đã
 * dùng, hết hạn.
 *
 * Gộp lại có chủ đích. Phân biệt "token đã được dùng" với "token không tồn tại"
 * là xác nhận cho người hỏi biết token đó từng hợp lệ.
 */
export class InvalidVerificationTokenError extends Error {
  constructor() {
    super("Liên kết không hợp lệ hoặc đã hết hạn");
    this.name = "InvalidVerificationTokenError";
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Email hoặc mật khẩu không chính xác");
    this.name = "InvalidCredentialsError";
  }
}

export const authService = new AuthService();

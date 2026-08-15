import "server-only";
import { prisma } from "@/lib/prisma";
import { OAuthEmailRequiredError, type OAuthProfile } from "@/lib/oauth/types";
import { AccountBannedError, InvalidCredentialsError } from "./auth.service";
import { userService, type PublicUser } from "./user.service";

/**
 * Quy về `PublicUser` từ một hồ sơ OAuth đã chuẩn hoá.
 *
 * Ba đường, theo đúng thứ tự ưu tiên:
 *   1. `provider` + `providerAccountId` đã từng đăng nhập → user cũ, xong.
 *   2. Chưa từng, nhưng email trùng với user có sẵn (đăng ký bằng mật khẩu
 *      trước đó, hoặc đã liên kết provider khác) → LIÊN KẾT vào user đó.
 *   3. Chưa từng, email cũng chưa ai dùng → tạo user mới.
 *
 * Chỉ tin email khi provider xác nhận đã xác thực (`profile.email` đã được
 * `profile.ts` lọc theo điều kiện đó) — liên kết theo một email chưa xác
 * thực là mở đường chiếm tài khoản người khác bằng chính email của họ.
 */
export class OAuthService {
  async loginWithProfile(profile: OAuthProfile): Promise<PublicUser> {
    const user = await this.resolveUser(profile);

    // BANNED chặn mọi cách đăng nhập, kể cả OAuth. `lockedUntil` thì KHÔNG
    // áp dụng ở đây — đó là khoá do brute-force MẬT KHẨU, không liên quan gì
    // tới việc đăng nhập bằng Google/Github.
    if (user.status === "BANNED") {
      throw new AccountBannedError();
    }

    return user;
  }

  private async resolveUser(profile: OAuthProfile): Promise<PublicUser> {
    const existingAccount = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: profile.provider,
          providerAccountId: profile.providerAccountId,
        },
      },
      select: { userId: true },
    });

    if (existingAccount) {
      const user = await userService.findById(existingAccount.userId);
      // User đứng sau Account này có thể đã bị xoá mềm — coi như không có
      // tài khoản nào cả, cùng cách `validateCredentials` xử lý user đã xoá.
      if (!user) throw new InvalidCredentialsError();
      return user;
    }

    if (!profile.email) {
      throw new OAuthEmailRequiredError(profile.provider);
    }

    const existingUser = await userService.findByEmail(profile.email);
    const user =
      existingUser ??
      (await userService.createOAuthUser({ email: profile.email, fullName: profile.fullName }));

    await prisma.account.create({
      data: {
        userId: user.id,
        provider: profile.provider,
        providerAccountId: profile.providerAccountId,
      },
    });

    return user;
  }
}

export const oauthService = new OAuthService();

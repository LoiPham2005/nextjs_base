import "server-only";
import { Prisma, type UserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CryptoUtils } from "@/lib/crypto";
import { SYSTEM_ROLES } from "@/lib/permissions";
import { tokenService } from "./token.service";
import type { CreateUserInput, UpdateUserInput } from "@/schemas/user.schema";

/**
 * Cột được phép rời khỏi service. Không bao giờ có `password`.
 *
 * `role` là quan hệ nên phải khai báo `select` lồng — nếu để `role: true`,
 * Prisma trả về cả bản ghi vai trò kèm mốc thời gian, thừa và dễ lộ dần ra API.
 */
const USER_SELECT = {
  id: true,
  email: true,
  username: true,
  fullName: true,
  emailVerifiedAt: true,
  status: true,
  lockedUntil: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { key: true, name: true } },
} as const;

/** Mọi truy vấn "user đang hoạt động" phải đi qua điều kiện này — xem `delete()`. */
const NOT_DELETED = { deletedAt: null } as const;

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

/**
 * Hình dạng user trả ra ngoài.
 *
 * `role` được làm phẳng thành chuỗi khoá thay vì để nguyên object lồng. Nhờ
 * vậy `user.role === "ADMIN"` vẫn viết được như khi còn dùng enum, và toàn bộ
 * giao diện lẫn client mobile không phải sửa theo việc vai trò chuyển xuống
 * database.
 */
export type PublicUser = {
  id: string;
  email: string;
  username: string | null;
  fullName: string | null;
  /** Khoá vai trò, ví dụ `"ADMIN"`. */
  role: string;
  /** Tên hiển thị của vai trò, ví dụ `"Quản trị viên"`. */
  roleName: string;
  emailVerifiedAt: Date | null;
  status: UserStatus;
  /** Khoá tạm tự động do sai mật khẩu liên tiếp — null/quá khứ = không bị khoá. */
  lockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toPublicUser(row: UserRow): PublicUser {
  const { role, ...rest } = row;
  return { ...rest, role: role.key, roleName: role.name };
}

/**
 * Chuẩn hoá email trước khi ghi và trước khi tra cứu.
 *
 * Không có bước này thì `Loi@example.com` và `loi@example.com` là hai tài
 * khoản khác nhau — người dùng đăng ký một lần rồi không đăng nhập lại được vì
 * gõ hoa chữ đầu. Tên miền email vốn không phân biệt hoa thường.
 */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Trần cứng cho `take`, để một query độc hại không kéo cả bảng về. */
const MAX_PAGE_SIZE = 100;

export class UserService {
  /**
   * Đổi khoá vai trò thành id.
   *
   * Tách riêng vì mọi đường ghi user đều cần, và vì vai trò không tồn tại phải
   * cho ra lỗi nghiệp vụ đọc được, chứ không phải lỗi ràng buộc khoá ngoại thô
   * từ database.
   */
  private async resolveRoleId(roleKey: string): Promise<string> {
    const role = await prisma.role.findUnique({ where: { key: roleKey }, select: { id: true } });
    if (!role) throw new RoleNotFoundError(roleKey);
    return role.id;
  }

  async create(input: CreateUserInput): Promise<PublicUser> {
    const password = input.password ? await CryptoUtils.hashPassword(input.password) : null;
    const roleId = await this.resolveRoleId(input.roleKey ?? SYSTEM_ROLES.USER);

    try {
      const row = await prisma.user.create({
        data: {
          email: normalizeEmail(input.email),
          password,
          username: input.username ?? null,
          fullName: input.fullName ?? null,
          roleId,
        },
        select: USER_SELECT,
      });

      return toPublicUser(row);
    } catch (error) {
      // Dựa vào unique constraint thay vì "kiểm tra rồi mới ghi": hai request
      // đồng thời cùng một email đều vượt qua được bước kiểm tra, chỉ database
      // mới phân xử được.
      if (isPrismaError(error, "P2002")) {
        throw duplicateFieldError(error, input);
      }
      throw error;
    }
  }

  /**
   * Tạo user từ hồ sơ OAuth — email coi như đã xác thực (provider đảm bảo),
   * không có mật khẩu, luôn gán vai trò USER mặc định.
   *
   * Tách riêng khỏi `create()` thay vì thêm tham số tuỳ chọn: `create()` phục
   * vụ input công khai (đăng ký, admin tạo user) và KHÔNG được để bên gọi tự
   * set `emailVerifiedAt` — làm vậy là mở đường giả mạo email đã xác thực.
   */
  async createOAuthUser(input: { email: string; fullName: string | null }): Promise<PublicUser> {
    const roleId = await this.resolveRoleId(SYSTEM_ROLES.USER);

    try {
      const row = await prisma.user.create({
        data: {
          email: normalizeEmail(input.email),
          password: null,
          fullName: input.fullName,
          roleId,
          emailVerifiedAt: new Date(),
        },
        select: USER_SELECT,
      });

      return toPublicUser(row);
    } catch (error) {
      if (isPrismaError(error, "P2002")) throw duplicateFieldError(error, input);
      throw error;
    }
  }

  /**
   * @param actorId Người đang thực hiện thao tác, hoặc `null` nếu là tiến
   * trình hệ thống (seed, cron, script quản trị).
   *
   * Bắt buộc truyền, cùng lý do với `delete()`: luật "không tự đổi vai trò của
   * chính mình" là luật nghiệp vụ, nên nó phải sống ở đây thay vì được chép
   * lại ở từng cửa vào. Không có luật này thì quản trị viên cuối cùng tự hạ
   * quyền mình là khoá cửa cả hệ thống — và không còn ai đủ quyền để mở lại.
   */
  async update(id: string, input: UpdateUserInput, actorId: string | null): Promise<PublicUser> {
    if (input.roleKey !== undefined && actorId !== null && actorId === id) {
      throw new SelfRoleChangeError();
    }

    const roleId = input.roleKey ? await this.resolveRoleId(input.roleKey) : undefined;

    try {
      const row = await prisma.user.update({
        where: { id, ...NOT_DELETED },
        data: {
          // `undefined` nghĩa là không đụng tới, `null` nghĩa là xoá giá trị.
          // Phân biệt được hai cái đó là lý do schema dùng `.nullish()`.
          ...(input.username !== undefined ? { username: input.username } : {}),
          ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
          ...(roleId ? { roleId } : {}),
        },
        select: USER_SELECT,
      });

      return toPublicUser(row);
    } catch (error) {
      if (isPrismaError(error, "P2025")) throw new UserNotFoundError(id);
      if (isPrismaError(error, "P2002")) throw duplicateFieldError(error, input);
      throw error;
    }
  }

  /**
   * Khoá/mở khoá tài khoản — hành động quản trị, khác hẳn `lockedUntil` (tự
   * động, tạm thời, do sai mật khẩu liên tiếp). Xem enum `UserStatus`.
   *
   * @param actorId Cùng luật với `delete()`: không tự khoá chính mình. Một
   * admin tự BANNED chính mình mà không còn admin nào khác thì không ai mở
   * khoá lại được.
   */
  async setStatus(id: string, status: UserStatus, actorId: string): Promise<PublicUser> {
    if (actorId === id) throw new SelfStatusChangeError();

    try {
      const row = await prisma.user.update({
        where: { id, ...NOT_DELETED },
        data: { status },
        select: USER_SELECT,
      });
      return toPublicUser(row);
    } catch (error) {
      if (isPrismaError(error, "P2025")) throw new UserNotFoundError(id);
      throw error;
    }
  }

  /** Mở khoá sớm thay vì đợi `lockedUntil` tự hết hạn — hành động quản trị. */
  async unlock(id: string): Promise<PublicUser> {
    try {
      const row = await prisma.user.update({
        where: { id, ...NOT_DELETED },
        data: { failedLoginAttempts: 0, lockedUntil: null },
        select: USER_SELECT,
      });
      return toPublicUser(row);
    } catch (error) {
      if (isPrismaError(error, "P2025")) throw new UserNotFoundError(id);
      throw error;
    }
  }

  /**
   * Phân trang kiểu cursor, không phải `skip`/`take` (offset).
   *
   * Offset càng về sau càng chậm — trang thứ N phải quét qua N×take dòng để
   * bỏ qua, kể cả khi Postgres đã có index trên `createdAt`. Cursor tra thẳng
   * vào vị trí bằng index, không phụ thuộc đang ở trang bao nhiêu — quan
   * trọng cho màn hình danh sách kiểu kéo vô hạn trên mobile khi bảng lớn.
   *
   * Sắp theo `createdAt` rồi `id` làm tiêu chí phụ: chỉ mình `createdAt` không
   * đảm bảo thứ tự duy nhất (2 user tạo cùng mili giây là có thật), cursor cần
   * thứ tự tuyệt đối để không bỏ sót hoặc lặp dòng giữa các lần gọi.
   */
  async list(
    options: { cursor?: string; take?: number } = {},
  ): Promise<{ users: PublicUser[]; nextCursor: string | null }> {
    const take = Math.min(options.take ?? 50, MAX_PAGE_SIZE);

    const rows = await prisma.user.findMany({
      where: NOT_DELETED,
      select: USER_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      // Lấy dư 1 dòng để biết còn trang sau không, mà không cần đếm riêng.
      take: take + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    return { users: page.map(toPublicUser), nextCursor };
  }

  async count(): Promise<number> {
    return prisma.user.count({ where: NOT_DELETED });
  }

  async findById(id: string): Promise<PublicUser | null> {
    const row = await prisma.user.findFirst({ where: { id, ...NOT_DELETED }, select: USER_SELECT });
    return row ? toPublicUser(row) : null;
  }

  async findByEmail(email: string): Promise<PublicUser | null> {
    const row = await prisma.user.findFirst({
      where: { email: normalizeEmail(email), ...NOT_DELETED },
      select: USER_SELECT,
    });
    return row ? toPublicUser(row) : null;
  }

  async findByUsername(username: string): Promise<PublicUser | null> {
    const row = await prisma.user.findFirst({
      where: { username: username.trim().toLowerCase(), ...NOT_DELETED },
      select: USER_SELECT,
    });
    return row ? toPublicUser(row) : null;
  }

  /**
   * @param actorId Người đang thực hiện thao tác, hoặc `null` nếu là tiến
   * trình hệ thống (seed, cron, script quản trị).
   *
   * Tham số này BẮT BUỘC chứ không phải tuỳ chọn: luật "không tự xoá chính
   * mình" là luật nghiệp vụ, nên nó phải sống ở đây thay vì được chép lại ở
   * từng cửa vào. Bắt buộc truyền thì TypeScript ép mọi nơi gọi phải nói rõ
   * ai đang thao tác, và không thể vô tình bỏ sót luật.
   *
   * XOÁ MỀM: chỉ set `deletedAt` — không có `onDelete: Cascade` nào chạy, nên
   * refresh token phải tự thu hồi ở đây. Email đổi thành giá trị vô hại kèm id
   * để giải phóng cho người khác (hoặc chính chủ) đăng ký lại — email vẫn là
   * cột NOT NULL + unique nên không thể để trống. Username (nullable) thì chỉ
   * cần null hoá, Postgres cho phép nhiều NULL trên cột unique.
   */
  async delete(id: string, actorId: string | null): Promise<PublicUser> {
    if (actorId !== null && actorId === id) {
      throw new SelfDeletionError();
    }

    try {
      const row = await prisma.user.update({
        where: { id, ...NOT_DELETED },
        data: {
          deletedAt: new Date(),
          email: `deleted_${id}@deleted.invalid`,
          username: null,
        },
        select: USER_SELECT,
      });

      await tokenService.revokeAllForUser(id);

      return toPublicUser(row);
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

/**
 * Đổi lỗi trùng khoá của Prisma thành lỗi nghiệp vụ nói rõ trường nào bị trùng.
 *
 * Người dùng cần biết là trùng email hay trùng tên đăng nhập — hai việc phải
 * sửa khác hẳn nhau.
 */
function duplicateFieldError(
  error: unknown,
  input: { email?: string; username?: string | null },
): Error {
  const target =
    error instanceof Prisma.PrismaClientKnownRequestError ? error.meta?.target : undefined;

  // `meta.target` được Prisma khai báo là `unknown`: tuỳ database, nó có thể là
  // mảng tên cột, một chuỗi, hoặc không có gì. Chỉ hai dạng đầu mới dùng được;
  // dạng khác thì coi như không biết trường nào trùng và rơi về lỗi mặc định.
  const fields = Array.isArray(target)
    ? target.filter((item): item is string => typeof item === "string")
    : typeof target === "string"
      ? [target]
      : [];

  if (fields.some((field) => field.includes("username")) && input.username) {
    return new UsernameAlreadyExistsError(input.username);
  }

  return new UserAlreadyExistsError(input.email ?? "");
}

export class UserAlreadyExistsError extends Error {
  constructor(email: string) {
    super(`Email "${email}" đã được sử dụng`);
    this.name = "UserAlreadyExistsError";
  }
}

export class UsernameAlreadyExistsError extends Error {
  constructor(username: string) {
    super(`Tên đăng nhập "${username}" đã được sử dụng`);
    this.name = "UsernameAlreadyExistsError";
  }
}

export class UserNotFoundError extends Error {
  constructor(id: string) {
    super(`Không tìm thấy người dùng có id "${id}"`);
    this.name = "UserNotFoundError";
  }
}

export class RoleNotFoundError extends Error {
  constructor(roleKey: string) {
    super(`Không tìm thấy vai trò "${roleKey}"`);
    this.name = "RoleNotFoundError";
  }
}

export class SelfDeletionError extends Error {
  constructor() {
    super("Bạn không thể tự xoá tài khoản đang đăng nhập");
    this.name = "SelfDeletionError";
  }
}

export class SelfStatusChangeError extends Error {
  constructor() {
    super("Bạn không thể tự khoá/mở khoá tài khoản đang đăng nhập");
    this.name = "SelfStatusChangeError";
  }
}

export class SelfRoleChangeError extends Error {
  constructor() {
    super("Bạn không thể tự đổi vai trò của tài khoản đang đăng nhập");
    this.name = "SelfRoleChangeError";
  }
}

export const userService = new UserService();

import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isKnownPermission, type Permission, type RoleKey } from "@/lib/permissions";
import { permissionService } from "./permission.service";

/**
 * Quản trị vai trò và bảng phân quyền.
 *
 * ---
 * VÌ SAO SERVICE NÀY TỒN TẠI
 *
 * Cả schema lẫn README đều hứa: "quản trị viên tự tạo vai trò và tự tick
 * quyền, không cần deploy". Nhưng trước file này, không có một đường ghi nào
 * tới ba bảng `roles`/`permissions`/`role_permissions` — bằng chứng rõ nhất là
 * `permissionService.invalidate()` chưa từng được gọi ở đâu. Lời hứa đó chỉ
 * thực hiện được bằng cách gõ SQL tay.
 *
 * ---
 * BA LUẬT AN TOÀN, VÀ VÌ SAO CHÚNG NẰM Ở ĐÂY
 *
 * 1. `key` KHÔNG đổi được sau khi tạo. Nó nằm trong mọi JWT đang lưu hành và
 *    trong các câu `role === "ADMIN"` của code. Đổi `key` là vô hiệu hoá toàn
 *    bộ token đang có hiệu lực, im lặng, cho tới khi chúng hết hạn.
 *
 * 2. Vai trò `isSystem` không xoá được. Xoá nhầm ADMIN là khoá cửa cả hệ
 *    thống và không còn ai đủ quyền để tạo lại.
 *
 * 3. Vai trò còn người dùng thì không xoá được. `users.roleId` là khoá ngoại
 *    bắt buộc, nên database sẽ chặn — nhưng nó chặn bằng lỗi ràng buộc thô,
 *    khó hiểu với người bấm nút. Chặn sớm để nói được câu người ta hiểu.
 *
 * Mọi thao tác GHI đều phải gọi `permissionService.invalidate()`. Quên là quản
 * trị viên bỏ tick một quyền, thử lại ngay, thấy vẫn làm được, rồi kết luận
 * hệ thống hỏng.
 */

const ROLE_SELECT = {
  key: true,
  name: true,
  description: true,
  isSystem: true,
  createdAt: true,
  updatedAt: true,
  permissions: { select: { permission: { select: { key: true } } } },
  _count: { select: { users: true } },
} as const;

type RoleRow = Prisma.RoleGetPayload<{ select: typeof ROLE_SELECT }>;

export type PublicRole = {
  key: string;
  name: string;
  description: string | null;
  /** Vai trò hệ thống: không xoá được, không đổi `key` được. */
  isSystem: boolean;
  /** Chỉ những quyền còn tồn tại trong code — xem `isKnownPermission`. */
  permissions: Permission[];
  /** Số người dùng đang mang vai trò này. Cần để biết xoá có an toàn không. */
  userCount: number;
  createdAt: Date;
  updatedAt: Date;
};

function toPublicRole(row: RoleRow): PublicRole {
  return {
    key: row.key,
    name: row.name,
    description: row.description,
    isSystem: row.isSystem,
    // Lọc bản ghi còn sót của quyền đã bị xoá khỏi code. Không lọc thì giao
    // diện hiện một ô tick cho thứ không dòng mã nào còn kiểm tra — người
    // quản trị tưởng đã cấm được, mà thực tế không có gì thay đổi.
    permissions: row.permissions
      .map((item) => item.permission.key)
      .filter((key): key is Permission => isKnownPermission(key)),
    userCount: row._count.users,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export type CreateRoleInput = {
  key: string;
  name: string;
  description?: string | null;
  permissions?: readonly Permission[];
};

export type UpdateRoleInput = {
  name?: string;
  description?: string | null;
  /**
   * Danh sách quyền ĐẦY ĐỦ sau khi sửa, không phải phần thêm vào.
   *
   * Ngữ nghĩa "thay thế toàn bộ" là thứ giao diện tick-chọn cần: bỏ tick một ô
   * phải thực sự gỡ quyền đó. Với ngữ nghĩa "chỉ thêm" thì không có cách nào
   * gỡ, và đó chính là kiểu API khiến người ta phải gõ SQL tay.
   */
  permissions?: readonly Permission[];
};

export class RoleService {
  async list(): Promise<PublicRole[]> {
    const rows = await prisma.role.findMany({
      select: ROLE_SELECT,
      orderBy: [{ isSystem: "desc" }, { key: "asc" }],
    });
    return rows.map(toPublicRole);
  }

  async findByKey(key: RoleKey): Promise<PublicRole | null> {
    const row = await prisma.role.findUnique({ where: { key }, select: ROLE_SELECT });
    return row ? toPublicRole(row) : null;
  }

  async create(input: CreateRoleInput): Promise<PublicRole> {
    const permissionIds = await this.resolvePermissionIds(input.permissions ?? []);

    try {
      const row = await prisma.role.create({
        data: {
          key: input.key,
          name: input.name,
          description: input.description ?? null,
          // Vai trò do người dùng tạo KHÔNG bao giờ là vai trò hệ thống. Cờ
          // này chỉ dành cho những vai trò code có nhắc tên trực tiếp.
          isSystem: false,
          permissions: { create: permissionIds.map((permissionId) => ({ permissionId })) },
        },
        select: ROLE_SELECT,
      });

      permissionService.invalidate();
      return toPublicRole(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new RoleKeyAlreadyExistsError(input.key);
      }
      throw error;
    }
  }

  /**
   * Đổi tên/mô tả và/hoặc thay toàn bộ danh sách quyền.
   *
   * `key` cố ý không nằm trong input — xem luật 1 ở đầu file.
   */
  async update(key: RoleKey, input: UpdateRoleInput): Promise<PublicRole> {
    const role = await prisma.role.findUnique({ where: { key }, select: { id: true } });
    if (!role) throw new RoleNotFoundError(key);

    const permissionIds =
      input.permissions === undefined ? null : await this.resolvePermissionIds(input.permissions);

    // Gói trong transaction: xoá hết rồi tạo lại là hai bước, mà giữa hai bước
    // đó vai trò không có quyền nào cả. Không có transaction thì một request
    // rơi đúng khe hở ấy sẽ bị từ chối oan.
    await prisma.$transaction([
      prisma.role.update({
        where: { id: role.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
        },
      }),
      ...(permissionIds === null
        ? []
        : [
            prisma.rolePermission.deleteMany({ where: { roleId: role.id } }),
            prisma.rolePermission.createMany({
              data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
            }),
          ]),
    ]);

    permissionService.invalidate();

    const updated = await this.findByKey(key);
    if (!updated) throw new RoleNotFoundError(key);
    return updated;
  }

  async delete(key: RoleKey): Promise<void> {
    const role = await prisma.role.findUnique({
      where: { key },
      select: { id: true, isSystem: true, _count: { select: { users: true } } },
    });

    if (!role) throw new RoleNotFoundError(key);
    if (role.isSystem) throw new SystemRoleImmutableError(key);
    if (role._count.users > 0) throw new RoleInUseError(key, role._count.users);

    // `role_permissions` có onDelete: Cascade nên hàng phân quyền tự biến mất.
    await prisma.role.delete({ where: { id: role.id } });

    permissionService.invalidate();
  }

  /**
   * Đổi danh sách khoá quyền thành id, và chặn khoá không có trong code.
   *
   * Bác sớm thay vì bỏ qua im lặng: người quản trị gửi lên một quyền không tồn
   * tại thường là do gõ sai hoặc do client cũ — nếu ta lặng lẽ bỏ qua, họ thấy
   * ô tick tự bỏ chọn sau khi lưu mà không hiểu vì sao.
   */
  private async resolvePermissionIds(keys: readonly Permission[]): Promise<string[]> {
    if (keys.length === 0) return [];

    const unique = [...new Set(keys)];
    const rows = await prisma.permission.findMany({
      where: { key: { in: unique } },
      select: { id: true, key: true },
    });

    if (rows.length !== unique.length) {
      const found = new Set(rows.map((row) => row.key));
      const missing = unique.filter((key) => !found.has(key));
      throw new UnknownPermissionError(missing);
    }

    return rows.map((row) => row.id);
  }
}

export class RoleNotFoundError extends Error {
  constructor(key: string) {
    super(`Không tìm thấy vai trò "${key}"`);
    this.name = "RoleNotFoundError";
  }
}

export class RoleKeyAlreadyExistsError extends Error {
  constructor(key: string) {
    super(`Khoá vai trò "${key}" đã tồn tại`);
    this.name = "RoleKeyAlreadyExistsError";
  }
}

export class SystemRoleImmutableError extends Error {
  constructor(key: string) {
    super(`Vai trò hệ thống "${key}" không xoá được`);
    this.name = "SystemRoleImmutableError";
  }
}

export class RoleInUseError extends Error {
  constructor(key: string, userCount: number) {
    super(
      `Vai trò "${key}" đang được ${userCount} người dùng sử dụng. ` +
        `Chuyển họ sang vai trò khác trước khi xoá.`,
    );
    this.name = "RoleInUseError";
  }
}

/**
 * Quyền gửi lên không có trong danh mục của code.
 *
 * Danh mục quyền TỒN TẠI nằm trong `src/lib/permissions.ts`, không phải trong
 * database — cho tạo quyền mới từ giao diện sẽ sinh ra những dòng không ràng
 * buộc điều gì.
 */
export class UnknownPermissionError extends Error {
  constructor(readonly keys: string[]) {
    super(`Quyền không tồn tại: ${keys.join(", ")}`);
    this.name = "UnknownPermissionError";
  }
}

export const roleService = new RoleService();

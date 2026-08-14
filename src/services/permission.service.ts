import "server-only";
import { prisma } from "@/lib/prisma";
import { isKnownPermission, type Permission, type RoleKey } from "@/lib/permissions";

/**
 * Kiểm tra quyền lúc chạy, đọc từ database.
 *
 * ---
 * VÌ SAO CÓ CACHE
 *
 * Kiểm tra quyền chạy trên gần như MỌI request. Nếu mỗi lần đều join ba bảng
 * thì đó là một truy vấn thêm vào đường đi nóng, chỉ để đọc dữ liệu gần như
 * không bao giờ đổi — bảng phân quyền được sửa vài lần một năm.
 *
 * Cache toàn bộ bản đồ vai trò → quyền vào RAM, nạp một lần rồi dùng lại.
 *
 * ---
 * HAI GIỚI HẠN PHẢI BIẾT
 *
 * 1. Cache nằm trong RAM của MỘT tiến trình. Chạy nhiều replica thì mỗi replica
 *    giữ bản sao riêng, và `invalidate()` chỉ xoá bản sao của replica đang xử
 *    lý request đó. Đây là lý do vẫn có TTL: replica khác tự làm mới sau
 *    `CACHE_TTL_MS`. Cần đồng bộ tức thì giữa các replica thì chuyển cache sang
 *    Redis — chỗ gọi giữ nguyên, chỉ thay phần bên trong file này.
 *
 * 2. Người dùng bị đổi vai trò vẫn giữ `role` cũ trong token cho tới khi token
 *    hết hạn. Cache ở đây không liên quan tới điều đó — xem ghi chú trong
 *    `src/lib/api/auth.ts`.
 */

/**
 * Hạn cache. Một phút là đủ ngắn để thay đổi phân quyền lan ra nhanh, đủ dài
 * để chặn gần như toàn bộ truy vấn lặp lại.
 */
const CACHE_TTL_MS = 60_000;

type PermissionMap = Map<RoleKey, ReadonlySet<Permission>>;

export class PermissionService {
  private cache: PermissionMap | null = null;
  private loadedAt = 0;
  /** Gộp các lần nạp đồng thời thành một truy vấn duy nhất. */
  private inFlight: Promise<PermissionMap> | null = null;

  /**
   * Xoá cache. Gọi sau MỌI thao tác ghi lên vai trò hoặc phân quyền.
   *
   * Quên gọi thì thay đổi phân quyền chỉ có hiệu lực sau khi TTL hết — người
   * quản trị bỏ tick một quyền, thử lại ngay, thấy vẫn làm được, và kết luận
   * là hệ thống hỏng.
   */
  invalidate(): void {
    this.cache = null;
    this.loadedAt = 0;
  }

  private async load(): Promise<PermissionMap> {
    const roles = await prisma.role.findMany({
      select: {
        key: true,
        permissions: { select: { permission: { select: { key: true } } } },
      },
    });

    const map: PermissionMap = new Map();

    for (const role of roles) {
      const granted = new Set<Permission>();

      for (const { permission } of role.permissions) {
        // Bỏ qua bản ghi còn sót của quyền đã bị xoá khỏi code. Không có bước
        // này, một dòng cũ trong database vẫn cấp được quyền mà không dòng mã
        // nào còn kiểm tra nó.
        if (isKnownPermission(permission.key)) granted.add(permission.key);
      }

      map.set(role.key, granted);
    }

    return map;
  }

  private async getMap(): Promise<PermissionMap> {
    const fresh = this.cache && Date.now() - this.loadedAt < CACHE_TTL_MS;
    if (fresh && this.cache) return this.cache;

    // Nhiều request cùng đến lúc cache vừa hết hạn sẽ cùng thấy `fresh` là
    // false. Không gộp lại thì tất cả đều bắn truy vấn — đúng lúc tải cao nhất.
    this.inFlight ??= this.load()
      .then((map) => {
        this.cache = map;
        this.loadedAt = Date.now();
        return map;
      })
      .finally(() => {
        this.inFlight = null;
      });

    return this.inFlight;
  }

  /** Quyền của một vai trò. Vai trò không tồn tại trả về tập rỗng. */
  async permissionsFor(roleKey: RoleKey): Promise<ReadonlySet<Permission>> {
    const map = await this.getMap();
    return map.get(roleKey) ?? new Set<Permission>();
  }

  async can(roleKey: RoleKey, permission: Permission): Promise<boolean> {
    const granted = await this.permissionsFor(roleKey);
    return granted.has(permission);
  }

  /** Đúng khi vai trò có ÍT NHẤT MỘT trong các quyền được liệt kê. */
  async canAny(roleKey: RoleKey, permissions: readonly Permission[]): Promise<boolean> {
    const granted = await this.permissionsFor(roleKey);
    return permissions.some((permission) => granted.has(permission));
  }

  /** Đúng khi vai trò có ĐỦ TẤT CẢ các quyền được liệt kê. */
  async canAll(roleKey: RoleKey, permissions: readonly Permission[]): Promise<boolean> {
    const granted = await this.permissionsFor(roleKey);
    return permissions.every((permission) => granted.has(permission));
  }

  /**
   * Kiểm tra quyền trên một tài nguyên cụ thể, có xét quyền `:own`.
   *
   * Ví dụ: ADMIN đọc được hồ sơ của bất kỳ ai, còn USER chỉ đọc được hồ sơ của
   * chính mình. Gói luật đó vào một chỗ để nó không bị chép lại — và chép sai —
   * ở từng route.
   */
  async canActOnResource(
    roleKey: RoleKey,
    ownerId: string,
    actorId: string,
    permissions: { any: Permission; own: Permission },
  ): Promise<boolean> {
    const granted = await this.permissionsFor(roleKey);

    if (granted.has(permissions.any)) return true;
    return ownerId === actorId && granted.has(permissions.own);
  }
}

export const permissionService = new PermissionService();

/**
 * DANH MỤC quyền hạn và bộ gán MẶC ĐỊNH.
 *
 * ---
 * PHÂN CÔNG GIỮA CODE VÀ DATABASE
 *
 * Code giữ danh mục quyền TỒN TẠI. Database giữ việc GÁN quyền cho vai trò.
 *
 * Vì sao chia như vậy: một quyền chỉ có ý nghĩa khi có dòng mã nào đó kiểm tra
 * nó. Cho phép tạo quyền mới từ giao diện quản trị sẽ sinh ra những bản ghi
 * không ràng buộc điều gì — người quản trị tick vào rồi tưởng đã cấm được, mà
 * thực tế không có gì thay đổi.
 *
 * Ngược lại, việc "vai trò KẾ TOÁN được xem báo cáo nhưng không xoá đơn" là
 * quyết định nghiệp vụ, thay đổi theo từng khách hàng, và không nên cần một
 * lần deploy.
 *
 * Kết quả: tên quyền vẫn được TypeScript bắt lỗi lúc biên dịch, còn ai được
 * làm gì thì sửa được lúc chạy.
 *
 * ---
 * FILE NÀY KHÔNG DÙNG ĐỂ KIỂM TRA QUYỀN LÚC CHẠY
 *
 * Dùng `permissionService.can()` — nó đọc từ database (có cache). Bảng
 * `DEFAULT_ROLE_PERMISSIONS` dưới đây chỉ là dữ liệu nền cho `pnpm db:seed`.
 */

/**
 * Toàn bộ quyền hạn của hệ thống.
 *
 * Quy ước đặt tên: `<tài-nguyên>:<hành-động>`, thêm hậu tố `:own` khi hành động
 * chỉ áp dụng cho dữ liệu của chính người đó.
 *
 * Thêm quyền mới: khai báo ở đây rồi chạy `pnpm db:seed` để đồng bộ xuống
 * database. Không cần viết migration.
 */
export const PERMISSIONS = [
  "user:read",
  "user:create",
  "user:update",
  "user:delete",
  "profile:read:own",
  "profile:update:own",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Khoá vai trò hệ thống — hai vai trò này luôn tồn tại và không xoá được. */
export const SYSTEM_ROLES = {
  USER: "USER",
  ADMIN: "ADMIN",
} as const;

export type SystemRoleKey = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

/**
 * Khoá vai trò, dạng chuỗi tự do.
 *
 * Cố ý KHÔNG phải union type: khách hàng tạo được vai trò mới lúc chạy, nên
 * TypeScript không thể biết trước danh sách. Đây chính là cái giá của việc đưa
 * vai trò xuống database — đổi lại là không phải deploy mỗi lần thêm vai trò.
 */
export type RoleKey = string;

export type RoleSeed = {
  key: SystemRoleKey;
  name: string;
  description: string;
  permissions: readonly Permission[];
};

/**
 * Dữ liệu nền cho `pnpm db:seed`.
 *
 * Seed chỉ THÊM phần còn thiếu, không ghi đè phần đã có — nếu không, mỗi lần
 * deploy sẽ xoá sạch những điều chỉnh mà quản trị viên đã làm trên giao diện.
 */
export const DEFAULT_ROLE_PERMISSIONS: readonly RoleSeed[] = [
  {
    key: SYSTEM_ROLES.USER,
    name: "Người dùng",
    description: "Chỉ thao tác trên dữ liệu của chính mình",
    permissions: ["profile:read:own", "profile:update:own"],
  },
  {
    key: SYSTEM_ROLES.ADMIN,
    name: "Quản trị viên",
    description: "Toàn quyền quản lý người dùng",
    permissions: [
      "user:read",
      "user:create",
      "user:update",
      "user:delete",
      "profile:read:own",
      "profile:update:own",
    ],
  },
];

/** Mô tả hiển thị cho từng quyền trên giao diện phân quyền. */
export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  "user:read": "Xem danh sách và chi tiết người dùng",
  "user:create": "Tạo người dùng mới",
  "user:update": "Sửa thông tin người dùng",
  "user:delete": "Xoá người dùng",
  "profile:read:own": "Xem hồ sơ của chính mình",
  "profile:update:own": "Sửa hồ sơ của chính mình",
};

const PERMISSION_SET: ReadonlySet<string> = new Set(PERMISSIONS);

/**
 * Kiểm tra một chuỗi bất kỳ có phải quyền hợp lệ không.
 *
 * Cần vì quyền đọc lên từ database là `string`. Bản ghi còn sót lại sau khi
 * một quyền bị xoá khỏi code phải bị bỏ qua, chứ không được coi là hợp lệ.
 */
export function isKnownPermission(value: string): value is Permission {
  return PERMISSION_SET.has(value);
}

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
  // Quản lý người dùng
  "user:read",
  "user:create",
  "user:update",
  "user:delete",

  // Hồ sơ cá nhân
  "profile:read:own",
  "profile:update:own",

  // Quản trị vai trò & phân quyền
  "role:read",
  "role:create",
  "role:update",
  "role:delete",

  // Nhật ký kiểm toán & Hệ thống
  "audit:read",
  
  // Thông báo & Chiến dịch
  "notification:read",
  "notification:send",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Khoá vai trò hệ thống — các vai trò cốt lõi được định nghĩa sẵn. */
export const SYSTEM_ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN", // Quản trị tối cao
  ADMIN: "ADMIN",             // Quản trị viên
  MANAGER: "MANAGER",         // Chủ sân / Quản lý chi nhánh
  STAFF: "STAFF",             // Nhân viên sân / Lễ tân
  CUSTOMER: "CUSTOMER",       // Khách hàng đặt sân
  USER: "USER",               // Người dùng thông thường
} as const;

export type SystemRoleKey = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

/**
 * Khoá vai trò, dạng chuỗi tự do.
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
 * Định nghĩa sẵn 5 vai trò chuẩn mực phổ biến:
 * 1. SUPER_ADMIN: Toàn quyền tối cao hệ thống.
 * 2. ADMIN: Quản trị viên điều hành (quản lý user, role, notification, audit).
 * 3. MANAGER: Quản lý chi nhánh / Trưởng phòng (xem user, gửi thông báo, xem audit).
 * 4. STAFF: Nhân viên vận hành / CSKH (xem & hỗ trợ user, xem thông báo).
 * 5. USER: Người dùng / Khách hàng thông thường (chỉ quản lý dữ liệu của chính mình).
 */
export const DEFAULT_ROLE_PERMISSIONS: readonly RoleSeed[] = [
  {
    key: SYSTEM_ROLES.SUPER_ADMIN,
    name: "Quản trị cấp cao (Super Admin)",
    description: "Toàn quyền tối cao mọi chức năng hệ thống",
    permissions: [
      "user:read",
      "user:create",
      "user:update",
      "user:delete",
      "profile:read:own",
      "profile:update:own",
      "role:read",
      "role:create",
      "role:update",
      "role:delete",
      "audit:read",
      "notification:read",
      "notification:send",
    ],
  },
  {
    key: SYSTEM_ROLES.ADMIN,
    name: "Quản trị viên (Admin)",
    description: "Quản lý người dùng, phân quyền và gửi thông báo",
    permissions: [
      "user:read",
      "user:create",
      "user:update",
      "profile:read:own",
      "profile:update:own",
      "role:read",
      "role:create",
      "role:update",
      "audit:read",
      "notification:read",
      "notification:send",
    ],
  },
  {
    key: SYSTEM_ROLES.MANAGER,
    name: "Quản lý (Manager)",
    description: "Quản lý hoạt động nhân sự và gửi thông báo nội bộ",
    permissions: [
      "user:read",
      "profile:read:own",
      "profile:update:own",
      "role:read",
      "audit:read",
      "notification:read",
      "notification:send",
    ],
  },
  {
    key: SYSTEM_ROLES.STAFF,
    name: "Nhân viên (Staff)",
    description: "Nhân viên vận hành, xem thông tin người dùng và nhận thông báo",
    permissions: [
      "user:read",
      "profile:read:own",
      "profile:update:own",
      "notification:read",
    ],
  },
  {
    key: SYSTEM_ROLES.USER,
    name: "Người dùng (User / Customer)",
    description: "Người dùng thông thường, chỉ thao tác trên dữ liệu của chính mình",
    permissions: [
      "profile:read:own",
      "profile:update:own",
      "notification:read",
    ],
  },
];

/** Metadata chi tiết (Tên hiển thị, Nhóm phân loại, Mô tả) của từng quyền */
export const PERMISSION_METADATA: Record<
  Permission,
  { name: string; category: string; description: string }
> = {
  "user:read": {
    name: "Xem người dùng",
    category: "Quản lý Người dùng",
    description: "Xem danh sách và chi tiết người dùng",
  },
  "user:create": {
    name: "Tạo người dùng",
    category: "Quản lý Người dùng",
    description: "Tạo người dùng mới trong hệ thống",
  },
  "user:update": {
    name: "Sửa người dùng",
    category: "Quản lý Người dùng",
    description: "Sửa thông tin và trạng thái người dùng",
  },
  "user:delete": {
    name: "Xoá người dùng",
    category: "Quản lý Người dùng",
    description: "Xoá tài khoản người dùng khỏi hệ thống",
  },
  "profile:read:own": {
    name: "Xem hồ sơ cá nhân",
    category: "Hồ sơ Cá nhân",
    description: "Xem hồ sơ của chính mình",
  },
  "profile:update:own": {
    name: "Sửa hồ sơ cá nhân",
    category: "Hồ sơ Cá nhân",
    description: "Sửa hồ sơ của chính mình",
  },
  "role:read": {
    name: "Xem vai trò & quyền",
    category: "Phân quyền (RBAC)",
    description: "Xem danh sách vai trò và bảng phân quyền",
  },
  "role:create": {
    name: "Tạo vai trò",
    category: "Phân quyền (RBAC)",
    description: "Tạo vai trò mới trong hệ thống",
  },
  "role:update": {
    name: "Sửa vai trò",
    category: "Phân quyền (RBAC)",
    description: "Đổi tên vai trò và gán/gỡ quyền",
  },
  "role:delete": {
    name: "Xoá vai trò",
    category: "Phân quyền (RBAC)",
    description: "Xoá vai trò khỏi hệ thống",
  },
  "audit:read": {
    name: "Xem nhật ký kiểm toán",
    category: "Hệ thống & Bảo mật",
    description: "Xem nhật ký kiểm toán hành động hệ thống",
  },
  "notification:read": {
    name: "Xem thông báo",
    category: "Thông báo & Tin nhắn",
    description: "Xem danh sách thông báo và hộp thư",
  },
  "notification:send": {
    name: "Gửi thông báo",
    category: "Thông báo & Tin nhắn",
    description: "Tạo và gửi thông báo (Push FCM & In-App)",
  },
};

/** Mô tả hiển thị cho từng quyền trên giao diện phân quyền. */
export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = Object.fromEntries(
  Object.entries(PERMISSION_METADATA).map(([k, v]) => [k, v.description])
) as Record<Permission, string>;

const PERMISSION_SET: ReadonlySet<string> = new Set(PERMISSIONS);

/**
 * Kiểm tra một chuỗi bất kỳ có phải quyền hợp lệ không.
 */
export function isKnownPermission(value: string): value is Permission {
  return PERMISSION_SET.has(value);
}

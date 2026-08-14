-- Chuyển phân quyền từ enum `Role` sang bảng, KHÔNG mất dữ liệu.
--
-- Prisma tự sinh sẽ xoá thẳng cột `users.role` rồi thêm `roleId NOT NULL` —
-- câu lệnh đó thất bại ngay trên bảng có dữ liệu, và nếu ép chạy được thì mọi
-- người dùng hiện tại mất vai trò. Nên file này viết tay theo thứ tự:
-- tạo bảng → nạp dữ liệu nền → thêm cột → chuyển dữ liệu → siết ràng buộc →
-- mới xoá cột cũ.
--
-- Id của các bản ghi hệ thống được đặt cố định thay vì sinh ngẫu nhiên: nhờ vậy
-- migration chạy lại trên môi trường khác vẫn ra cùng kết quả, và seed đối
-- chiếu được bằng `key` mà không sợ tạo trùng.

-- ---------------------------------------------------------------------------
-- 1. Bảng
-- ---------------------------------------------------------------------------

CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

CREATE TABLE "role_permissions" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

CREATE INDEX "role_permissions_permissionId_idx" ON "role_permissions"("permissionId");

ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey"
    FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 2. Dữ liệu nền — hai vai trò hệ thống và danh mục quyền
--
-- Danh mục này phải khớp với hằng `PERMISSIONS` trong src/lib/permissions.ts.
-- `pnpm db:seed` sẽ đồng bộ lại mỗi lần chạy, nên thêm quyền mới về sau chỉ cần
-- sửa file TypeScript rồi seed, không cần viết migration.
-- ---------------------------------------------------------------------------

INSERT INTO "roles" ("id", "key", "name", "description", "isSystem") VALUES
    ('role_user',  'USER',  'Người dùng',   'Chỉ thao tác trên dữ liệu của chính mình', true),
    ('role_admin', 'ADMIN', 'Quản trị viên', 'Toàn quyền quản lý người dùng',            true);

INSERT INTO "permissions" ("id", "key", "description") VALUES
    ('perm_user_read',           'user:read',           'Xem danh sách và chi tiết người dùng'),
    ('perm_user_create',         'user:create',         'Tạo người dùng mới'),
    ('perm_user_update',         'user:update',         'Sửa thông tin người dùng'),
    ('perm_user_delete',         'user:delete',         'Xoá người dùng'),
    ('perm_profile_read_own',    'profile:read:own',    'Xem hồ sơ của chính mình'),
    ('perm_profile_update_own',  'profile:update:own',  'Sửa hồ sơ của chính mình');

INSERT INTO "role_permissions" ("roleId", "permissionId") VALUES
    ('role_user',  'perm_profile_read_own'),
    ('role_user',  'perm_profile_update_own'),
    ('role_admin', 'perm_user_read'),
    ('role_admin', 'perm_user_create'),
    ('role_admin', 'perm_user_update'),
    ('role_admin', 'perm_user_delete'),
    ('role_admin', 'perm_profile_read_own'),
    ('role_admin', 'perm_profile_update_own');

-- ---------------------------------------------------------------------------
-- 3. Chuyển users.role (enum) sang users.roleId (khoá ngoại)
--
-- Thêm cột ở dạng cho phép NULL trước, chuyển dữ liệu, rồi mới siết NOT NULL.
-- Thêm thẳng NOT NULL sẽ thất bại vì các dòng đang có chưa có giá trị.
-- ---------------------------------------------------------------------------

ALTER TABLE "users" ADD COLUMN "roleId" TEXT;

UPDATE "users" SET "roleId" = CASE
    WHEN "role" = 'ADMIN' THEN 'role_admin'
    ELSE 'role_user'
END;

ALTER TABLE "users" ALTER COLUMN "roleId" SET NOT NULL;

ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "users_roleId_idx" ON "users"("roleId");

-- Chỉ xoá cột cũ SAU KHI dữ liệu đã nằm an toàn ở cột mới.
ALTER TABLE "users" DROP COLUMN "role";

DROP TYPE "Role";

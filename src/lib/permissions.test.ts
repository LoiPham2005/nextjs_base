import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  SYSTEM_ROLES,
  isKnownPermission,
} from "./permissions";

/**
 * Danh mục quyền là nguồn sự thật cho seed và cho việc lọc dữ liệu đọc lên từ
 * database. Sai ở đây thì sai lan ra cả hệ thống, nên nó phải tự nhất quán.
 */

describe("danh mục PERMISSIONS", () => {
  it("không có tên quyền trùng nhau", () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });

  it("mọi quyền đều theo quy ước <tài-nguyên>:<hành-động>", () => {
    for (const permission of PERMISSIONS) {
      expect(permission, `sai quy ước: ${permission}`).toMatch(/^[a-z]+:[a-z]+(:own)?$/);
    }
  });

  it("mọi quyền đều có mô tả hiển thị", () => {
    // Thiếu mô tả thì giao diện phân quyền hiện ra một ô trống, và người quản
    // trị phải đoán xem mình đang tick vào cái gì.
    for (const permission of PERMISSIONS) {
      expect(PERMISSION_DESCRIPTIONS[permission], `thiếu mô tả: ${permission}`).toBeTruthy();
    }
  });
});

describe("isKnownPermission", () => {
  it("nhận quyền có trong danh mục", () => {
    expect(isKnownPermission("user:read")).toBe(true);
  });

  it("từ chối chuỗi lạ", () => {
    // Đây là lớp chặn bản ghi còn sót trong database sau khi một quyền bị xoá
    // khỏi code. Không có nó, dòng cũ vẫn cấp quyền mà không mã nào kiểm tra.
    expect(isKnownPermission("user:destroy")).toBe(false);
    expect(isKnownPermission("")).toBe(false);
  });
});

describe("DEFAULT_ROLE_PERMISSIONS", () => {
  it("có đủ hai vai trò hệ thống", () => {
    const keys = DEFAULT_ROLE_PERMISSIONS.map((role) => role.key);
    expect(keys).toContain(SYSTEM_ROLES.USER);
    expect(keys).toContain(SYSTEM_ROLES.ADMIN);
  });

  it("mọi quyền được gán đều nằm trong danh mục", () => {
    for (const role of DEFAULT_ROLE_PERMISSIONS) {
      for (const permission of role.permissions) {
        expect(PERMISSIONS, `${role.key} gán quyền lạ: ${permission}`).toContain(permission);
      }
    }
  });

  it("không vai trò nào bị gán trùng một quyền hai lần", () => {
    for (const role of DEFAULT_ROLE_PERMISSIONS) {
      expect(new Set(role.permissions).size, `${role.key} có quyền lặp`).toBe(
        role.permissions.length,
      );
    }
  });

  it("USER không có quyền nào trên dữ liệu người khác", () => {
    const user = DEFAULT_ROLE_PERMISSIONS.find((role) => role.key === SYSTEM_ROLES.USER);

    for (const permission of user?.permissions ?? []) {
      expect(permission, `USER không được có ${permission}`).toMatch(/:own$/);
    }
  });

  it("ADMIN có mọi quyền của USER", () => {
    const user = DEFAULT_ROLE_PERMISSIONS.find((role) => role.key === SYSTEM_ROLES.USER);
    const admin = DEFAULT_ROLE_PERMISSIONS.find((role) => role.key === SYSTEM_ROLES.ADMIN);

    for (const permission of user?.permissions ?? []) {
      expect(admin?.permissions, `ADMIN thiếu ${permission}`).toContain(permission);
    }
  });
});

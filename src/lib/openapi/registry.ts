import "server-only";
import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  verifyEmailSchema,
} from "@/schemas/auth.schema";
import {
  createUserSchema,
  updateUserSchema,
  updateUserStatusSchema,
  userSchema,
} from "@/schemas/user.schema";
import { createRoleSchema, updateRoleSchema } from "@/schemas/role.schema";
import { API_PREFIX } from "@/lib/api/version";

/**
 * Đăng ký OpenAPI cho toàn bộ REST API mobile (`/api/v1/**`).
 *
 * Tái dùng THẲNG các Zod schema đã có trong `src/schemas/*.ts` — không định
 * nghĩa lại. Đây chính là bài học từ `src/types/api.ts` đã xoá trước đó: 2 nơi
 * mô tả cùng 1 hợp đồng thì sớm muộn cũng lệch nhau, một nơi thì không thể.
 *
 * `extendZodWithOpenApi` phải chạy TRƯỚC khi bất kỳ schema nào gọi `.openapi()`
 * — side-effect import này chỉ cần chạy 1 lần, ở đây là đủ vì mọi consumer đều
 * đi qua `getOpenApiDocument()`.
 */
extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

// --- Response chung ---------------------------------------------------------

const apiErrorSchema = registry.register(
  "ApiError",
  z.object({
    error: z.object({
      code: z.string().openapi({
        example: "VALIDATION_ERROR",
        description:
          "Client nên switch theo trường này, KHÔNG phải theo `message` — xem src/lib/api/response.ts",
      }),
      message: z.string(),
      fields: z.record(z.string(), z.array(z.string())).optional(),
    }),
  }),
);

function errorResponses(...statuses: (401 | 403 | 404 | 409 | 422 | 423 | 429)[]) {
  const labels: Record<number, string> = {
    401: "Chưa đăng nhập / token sai hoặc hết hạn",
    403: "Không đủ quyền",
    404: "Không tìm thấy tài nguyên",
    409: "Xung đột (email/username đã tồn tại, tự thao tác lên chính mình...)",
    422: "Dữ liệu gửi lên không hợp lệ",
    423: "Tài khoản đang khoá tạm do sai mật khẩu liên tiếp",
    429: "Vượt rate limit",
  };

  return Object.fromEntries(
    statuses.map((status) => [
      status,
      {
        description: labels[status],
        content: { "application/json": { schema: apiErrorSchema } },
      },
    ]),
  );
}

function okResponse(schema: z.ZodTypeAny, description = "Thành công") {
  return { 200: { description, content: { "application/json": { schema } } } };
}

const bearerAuth = registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  description: "Access token từ /auth/login, /auth/register, hoặc /auth/refresh",
});

// --- Auth ---------------------------------------------------------------

const tokenPairSchema = registry.register(
  "TokenPair",
  z.object({
    user: userSchema,
    accessToken: z.string(),
    expiresIn: z.number().int(),
    tokenType: z.literal("Bearer"),
    refreshToken: z.string(),
    refreshExpiresAt: z.iso.datetime(),
    sessionId: z.string().openapi({
      description:
        "Id phiên vừa cấp. Không phải bí mật. Client lưu lại để đánh dấu " +
        "'thiết bị này' trên GET /auth/sessions. ĐỔI sau mỗi lần refresh.",
    }),
  }),
);

registry.registerPath({
  method: "post",
  path: "/auth/login",
  tags: ["Auth"],
  summary: "Đăng nhập bằng email hoặc username",
  request: { body: { content: { "application/json": { schema: loginSchema } } } },
  responses: {
    ...okResponse(tokenPairSchema),
    ...errorResponses(401, 422, 423, 429),
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/register",
  tags: ["Auth"],
  summary: "Tạo tài khoản mới — luôn gán vai trò USER",
  request: { body: { content: { "application/json": { schema: registerSchema } } } },
  responses: { ...okResponse(tokenPairSchema, "Tạo thành công"), ...errorResponses(409, 422, 429) },
});

registry.registerPath({
  method: "post",
  path: "/auth/refresh",
  tags: ["Auth"],
  summary: "Đổi refresh token lấy access token mới",
  request: {
    body: {
      content: { "application/json": { schema: z.object({ refreshToken: z.string() }) } },
    },
  },
  responses: { ...okResponse(tokenPairSchema), ...errorResponses(401, 429) },
});

registry.registerPath({
  method: "post",
  path: "/auth/logout",
  tags: ["Auth"],
  security: [{ [bearerAuth.name]: [] }],
  summary: "Thu hồi refresh token hiện tại",
  responses: { ...okResponse(z.object({}), "Đã đăng xuất"), ...errorResponses(401) },
});

registry.registerPath({
  method: "get",
  path: "/auth/me",
  tags: ["Auth"],
  security: [{ [bearerAuth.name]: [] }],
  summary: "Hồ sơ user đang đăng nhập — luôn đọc lại từ database, không tin token",
  responses: { ...okResponse(z.object({ user: userSchema })), ...errorResponses(401, 404) },
});

registry.registerPath({
  method: "post",
  path: "/auth/change-password",
  tags: ["Auth"],
  security: [{ [bearerAuth.name]: [] }],
  summary: "Đổi mật khẩu khi đang đăng nhập",
  request: { body: { content: { "application/json": { schema: changePasswordSchema } } } },
  responses: { ...okResponse(z.object({}), "Đổi thành công"), ...errorResponses(401, 422, 429) },
});

registry.registerPath({
  method: "post",
  path: "/auth/forgot-password",
  tags: ["Auth"],
  summary: "Gửi link đặt lại mật khẩu — LUÔN trả 200 dù email có tồn tại hay không",
  request: { body: { content: { "application/json": { schema: forgotPasswordSchema } } } },
  responses: {
    ...okResponse(z.object({}), "Đã gửi (nếu email tồn tại)"),
    ...errorResponses(422, 429),
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/reset-password",
  tags: ["Auth"],
  summary: "Đặt lại mật khẩu bằng token trong email",
  request: { body: { content: { "application/json": { schema: resetPasswordSchema } } } },
  responses: { ...okResponse(z.object({}), "Đặt lại thành công"), ...errorResponses(422, 429) },
});

registry.registerPath({
  method: "post",
  path: "/auth/verify-email",
  tags: ["Auth"],
  summary: "Xác thực email bằng token trong link",
  request: { body: { content: { "application/json": { schema: verifyEmailSchema } } } },
  responses: { ...okResponse(z.object({ user: userSchema })), ...errorResponses(422) },
});

registry.registerPath({
  method: "post",
  path: "/auth/verify-email/request",
  tags: ["Auth"],
  security: [{ [bearerAuth.name]: [] }],
  summary: "Gửi lại email xác thực",
  responses: { ...okResponse(z.object({}), "Đã gửi"), ...errorResponses(401, 429) },
});

const sessionSchema = z.object({
  id: z.string().openapi({ description: "Đối chiếu với `sessionId` nhận lúc đăng nhập/refresh" }),
  userAgent: z.string().nullable(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});

registry.registerPath({
  method: "get",
  path: "/auth/sessions",
  tags: ["Auth"],
  security: [{ [bearerAuth.name]: [] }],
  summary:
    "Thiết bị đang đăng nhập — CHỈ của chính mình. " +
    "Response không tự đánh dấu phiên hiện tại: client đối chiếu với `sessionId` " +
    "nhận được lúc đăng nhập/refresh (access token không mang thông tin đó).",
  responses: {
    ...okResponse(z.object({ sessions: z.array(sessionSchema) })),
    ...errorResponses(401),
  },
});

registry.registerPath({
  method: "delete",
  path: "/auth/sessions/{id}",
  tags: ["Auth"],
  security: [{ [bearerAuth.name]: [] }],
  summary:
    "Đăng xuất một thiết bị. Trả 404 cho cả phiên không tồn tại lẫn phiên của " +
    "người khác — phân biệt hai ca đó là xác nhận id có thật.",
  request: { params: z.object({ id: z.string() }) },
  responses: {
    ...okResponse(z.object({ id: z.string() })),
    ...errorResponses(401, 404),
  },
});

// --- Users (ADMIN) --------------------------------------------------------

registry.registerPath({
  method: "get",
  path: "/users",
  tags: ["Users"],
  security: [{ [bearerAuth.name]: [] }],
  summary: "Danh sách user — phân trang kiểu cursor",
  request: {
    query: z.object({
      cursor: z.string().optional().openapi({ description: "id của dòng cuối trang trước" }),
      perPage: z.coerce.number().int().min(1).max(100).default(20).optional(),
    }),
  },
  responses: {
    ...okResponse(
      z.object({
        users: z.array(userSchema),
        pagination: z.object({ perPage: z.number(), nextCursor: z.string().nullable() }),
      }),
    ),
    ...errorResponses(401, 403),
  },
});

registry.registerPath({
  method: "post",
  path: "/users",
  tags: ["Users"],
  security: [{ [bearerAuth.name]: [] }],
  summary: "Admin tạo user mới, được phép chỉ định vai trò",
  request: { body: { content: { "application/json": { schema: createUserSchema } } } },
  responses: {
    ...okResponse(z.object({ user: userSchema }), "Tạo thành công"),
    ...errorResponses(401, 403, 409, 422),
  },
});

const userIdParam = { params: z.object({ id: z.string() }) };

registry.registerPath({
  method: "get",
  path: "/users/{id}",
  tags: ["Users"],
  security: [{ [bearerAuth.name]: [] }],
  summary: "Xem 1 user — chính mình cần profile:read:own, xem người khác cần user:read",
  request: userIdParam,
  responses: { ...okResponse(z.object({ user: userSchema })), ...errorResponses(401, 403, 404) },
});

registry.registerPath({
  method: "patch",
  path: "/users/{id}",
  tags: ["Users"],
  security: [{ [bearerAuth.name]: [] }],
  summary:
    "Sửa hồ sơ — chính mình cần profile:update:own, sửa người khác cần user:update. " +
    "Riêng roleKey LUÔN đòi user:update, kể cả khi đang sửa chính mình.",
  request: {
    ...userIdParam,
    body: { content: { "application/json": { schema: updateUserSchema } } },
  },
  responses: {
    ...okResponse(z.object({ user: userSchema })),
    ...errorResponses(401, 403, 404, 409, 422),
  },
});

registry.registerPath({
  method: "delete",
  path: "/users/{id}",
  tags: ["Users"],
  security: [{ [bearerAuth.name]: [] }],
  summary: "Xoá mềm user — không tự xoá được chính mình",
  request: userIdParam,
  responses: { ...okResponse(z.object({ id: z.string() })), ...errorResponses(401, 403, 409) },
});

registry.registerPath({
  method: "patch",
  path: "/users/{id}/status",
  tags: ["Users"],
  security: [{ [bearerAuth.name]: [] }],
  summary: "Khoá/mở khoá tài khoản — không tự khoá được chính mình",
  request: {
    ...userIdParam,
    body: { content: { "application/json": { schema: updateUserStatusSchema } } },
  },
  responses: {
    ...okResponse(z.object({ user: userSchema })),
    ...errorResponses(401, 403, 404, 409, 422),
  },
});

registry.registerPath({
  method: "post",
  path: "/users/{id}/unlock",
  tags: ["Users"],
  security: [{ [bearerAuth.name]: [] }],
  summary: "Mở khoá sớm — xoá lockedUntil do brute-force thay vì đợi tự hết hạn",
  request: userIdParam,
  responses: { ...okResponse(z.object({ user: userSchema })), ...errorResponses(401, 403, 404) },
});

// --- Roles & phân quyền ---------------------------------------------------

/**
 * Hình dạng vai trò trả ra ngoài.
 *
 * Viết riêng thay vì suy ra từ `createRoleSchema`: schema đầu vào và dữ liệu
 * đầu ra khác nhau thật (`isSystem`, `userCount` chỉ có ở đầu ra), gộp lại là
 * tài liệu nói sai.
 */
const roleSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  permissions: z.array(z.string()),
  userCount: z.number(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

registry.registerPath({
  method: "get",
  path: "/roles",
  tags: ["Roles"],
  security: [{ [bearerAuth.name]: [] }],
  summary:
    "Danh sách vai trò kèm bảng phân quyền, VÀ danh mục quyền tồn tại. " +
    "Danh mục đến từ code (src/lib/permissions.ts), không phải database.",
  responses: {
    ...okResponse(
      z.object({
        roles: z.array(roleSchema),
        permissions: z.array(z.object({ key: z.string(), description: z.string() })),
      }),
    ),
    ...errorResponses(401, 403),
  },
});

registry.registerPath({
  method: "post",
  path: "/roles",
  tags: ["Roles"],
  security: [{ [bearerAuth.name]: [] }],
  summary: "Tạo vai trò mới — key không đổi được sau khi tạo",
  request: { body: { content: { "application/json": { schema: createRoleSchema } } } },
  responses: {
    ...okResponse(z.object({ role: roleSchema }), "Tạo thành công"),
    ...errorResponses(401, 403, 409, 422),
  },
});

const roleKeyParam = { params: z.object({ key: z.string() }) };

registry.registerPath({
  method: "get",
  path: "/roles/{key}",
  tags: ["Roles"],
  security: [{ [bearerAuth.name]: [] }],
  summary: "Chi tiết một vai trò",
  request: roleKeyParam,
  responses: { ...okResponse(z.object({ role: roleSchema })), ...errorResponses(401, 403, 404) },
});

registry.registerPath({
  method: "patch",
  path: "/roles/{key}",
  tags: ["Roles"],
  security: [{ [bearerAuth.name]: [] }],
  summary:
    "Đổi tên/mô tả và/hoặc thay TOÀN BỘ danh sách quyền. " +
    "`permissions` là thay thế, không phải thêm vào — gửi thiếu là gỡ mất.",
  request: {
    ...roleKeyParam,
    body: { content: { "application/json": { schema: updateRoleSchema } } },
  },
  responses: {
    ...okResponse(z.object({ role: roleSchema })),
    ...errorResponses(401, 403, 404, 422),
  },
});

registry.registerPath({
  method: "delete",
  path: "/roles/{key}",
  tags: ["Roles"],
  security: [{ [bearerAuth.name]: [] }],
  summary: "Xoá vai trò — không xoá được vai trò hệ thống hoặc vai trò còn người dùng",
  request: roleKeyParam,
  responses: {
    ...okResponse(z.object({ key: z.string() })),
    ...errorResponses(401, 403, 404, 409),
  },
});

export function getOpenApiDocument() {
  const generator = new OpenApiGeneratorV31(registry.definitions);

  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "nextjs_prisma_base API",
      version: "1.0.0",
      description:
        "REST API cho client mobile — dùng Bearer token, khác cookie session của web. " +
        "Tự sinh từ Zod schema thật trong src/schemas/*.ts, không phải viết tay riêng.",
    },
    servers: [{ url: API_PREFIX }],
  });
}

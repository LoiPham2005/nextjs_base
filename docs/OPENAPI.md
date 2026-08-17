# Hướng dẫn sử dụng OpenAPI & REST API Documentation

Tài liệu này hướng dẫn cách truy cập, xem và kiểm thử hệ thống REST API (`/api/v1/**`) của dự án thông qua chuẩn **OpenAPI 3.0**.

---

## 1. Đường dẫn Endpoint OpenAPI

Khi ứng dụng đang chạy (`pnpm dev` hoặc `make dev`):

- **OpenAPI JSON Spec URL:**  
  👉 `http://localhost:3000/api/v1/openapi.json`
- **File sinh tự động:** `src/lib/openapi/registry.ts`  
  *(Tự động đồng bộ 100% với Zod Schema trong `src/schemas/*.ts`, không bao giờ bị lệch dữ liệu).*

---

## 2. Cách xem và kiểm thử (Test API)

### Cách 1: Import vào Postman / Insomnia (Khuyên dùng)
1. Mở **Postman** hoặc **Insomnia**.
2. Chọn nút **Import** ở góc trên bên trái.
3. Chọn tab **Link / URL** và dán:
   ```text
   http://localhost:3000/api/v1/openapi.json
   ```
4. Bấm **Import**. Toàn bộ danh sách API sẽ được tự động tạo kèm:
   - Các Headers (`Authorization: Bearer <token>`).
   - Request Body mẫu (đầy đủ các trường validate bởi Zod).
   - Danh sách Status Code và Error response (`401`, `403`, `422`, `500`).

---

### Cách 2: Xem giao diện Swagger UI trực tuyến
1. Truy cập [editor.swagger.io](https://editor.swagger.io/).
2. Chọn **File** ➡️ **Import URL**.
3. Dán link `http://localhost:3000/api/v1/openapi.json` và bấm **OK**.
4. Giao diện Swagger trực quan sẽ hiển thị đầy đủ schema và cho phép gọi thử API trực tiếp.

---

### Cách 3: Sinh Model & API Client tự động cho Mobile (Flutter / React Native)
Bạn có thể dùng công cụ sinh code tự động từ file OpenAPI spec:

- **Dành cho Flutter / Dart (`openapi-generator`):**
  ```bash
  openapi-generator-cli generate -i http://localhost:3000/api/v1/openapi.json -g dart-dio -o ./lib/api_client
  ```
- **Dành cho TypeScript / Web:**
  ```bash
  npx openapi-typescript http://localhost:3000/api/v1/openapi.json -o ./src/types/api-schema.d.ts
  ```

---

## 3. Danh sách các nhóm API chính

| Nhóm API | Endpoint | Quyền hạn | Mô tả |
| :--- | :--- | :---: | :--- |
| **Auth** | `POST /api/v1/auth/register` | Public | Đăng ký tài khoản mới |
| | `POST /api/v1/auth/login` | Public | Đăng nhập lấy access & refresh token |
| | `POST /api/v1/auth/refresh` | Public | Cấp lại access token từ refresh token |
| | `GET /api/v1/auth/me` | Bearer Token | Lấy thông tin user hiện tại |
| | `POST /api/v1/auth/change-password` | Bearer Token | Đổi mật khẩu |
| | `POST /api/v1/auth/forgot-password` | Public | Yêu cầu gửi link đặt lại mật khẩu |
| | `POST /api/v1/auth/reset-password` | Public | Đặt lại mật khẩu với token |
| | `POST /api/v1/auth/logout` | Bearer Token | Đăng xuất và thu hồi token |
| **Users** | `GET /api/v1/users` | `user:read` | Lấy danh sách người dùng (hỗ trợ phân trang cursor) |
| | `POST /api/v1/users` | `user:create` | Tạo người dùng mới |
| | `GET /api/v1/users/[id]` | `user:read` | Xem chi tiết người dùng |
| | `DELETE /api/v1/users/[id]` | `user:delete` | Xóa mềm người dùng |
| | `PATCH /api/v1/users/[id]/status` | `user:update` | Khóa/Mở khóa tài khoản |
| | `POST /api/v1/users/[id]/unlock` | `user:update` | Mở khóa sớm tài khoản bị khóa tạm |
| **Hệ thống** | `GET /api/health` | Public | Kiểm tra sức khỏe hệ thống (Health check) |

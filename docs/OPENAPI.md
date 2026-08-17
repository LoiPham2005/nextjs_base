# Hướng dẫn sử dụng OpenAPI, Scalar UI & Code Generation cho Mobile (Flutter / Dart)

Tài liệu này hướng dẫn cách truy cập, xem tài liệu trực quan trên Web, Import vào Postman và **Tự động sinh mã nguồn (Code Gen) trọn gói cho Flutter/Dart** từ chuẩn **OpenAPI 3.1** của dự án.

---

## 1. Đường dẫn Endpoint OpenAPI & Docs

Khi ứng dụng đang chạy (`pnpm dev` hoặc `make dev`):

- **Trang giao diện trực quan (Dành cho Người xem & Test API trực tiếp):**  
  👉 `http://localhost:3000/docs` _(Giao diện Scalar UI hiện đại, mượt mà, hỗ trợ Dark/Light Mode)_
- **OpenAPI JSON Spec (Dành cho Postman / Tool Code Gen):**  
  👉 `http://localhost:3000/api/v1/openapi.json`
- **File sinh đặc tả từ Backend:** `src/lib/openapi/registry.ts` _(Tự động đồng bộ 100% với Zod Schema trong `src/schemas/*.ts`)_

---

## 2. Cách xem và kiểm thử nhanh (Test API)

### Cách 1: Xem và gọi thử trực tiếp trên Web (`/docs`)

1. Mở trình duyệt vào `http://localhost:3000/docs`.
2. Chọn bất kỳ API nào (ví dụ: `POST /api/v1/auth/login`).
3. Bấm **"Test Request"** / **"Send"** để gửi request trực tiếp trên trình duyệt.

---

### Cách 2: Import vào Postman / Insomnia (1 Click)

1. Mở **Postman** hoặc **Insomnia**.
2. Chọn nút **Import** ở góc trên bên trái.
3. Chọn tab **Link / URL** và dán:
   ```text
   http://localhost:3000/api/v1/openapi.json
   ```
4. Bấm **Import**. Postman sẽ tự động tạo một Collection gồm đầy đủ:
   - Toàn bộ danh sách Endpoint kèm HTTP Method (`GET`, `POST`, `PATCH`, `DELETE`).
   - Request Body mẫu (đầy đủ các trường validate bởi Zod).
   - Header `Authorization: Bearer <token>`.
   - Danh sách Status Code và Error response (`401`, `403`, `422`, `500`).

---

## 3. Hướng dẫn chi tiết: Tự động sinh mã nguồn (Code Gen) cho Flutter / Dart

Bạn không cần phải viết tay các file Model (`User`, `LoginResponse`...) hay API Services trong Flutter. Hãy để công cụ tự động sinh từ file `openapi.json`.

### Bước 1: Mở Terminal tại thư mục dự án Flutter của bạn

Đảm bảo bạn đang đứng ở thư mục gốc của dự án Flutter (nơi có file `pubspec.yaml`).

### Bước 2: Chạy lệnh sinh Code (Dùng `openapi-generator-cli`)

Chạy một trong các lệnh sau tùy theo HTTP Client mà bạn sử dụng:

#### ⚡ Cách 1: Dùng `Dio` (Khuyên dùng cho Flutter)

```bash
npx @openapitools/openapi-generator-cli generate \
  -i http://localhost:3000/api/v1/openapi.json \
  -g dart-dio \
  -o ./lib/core/api_client \
  --additional-properties=pubName=api_client
```

#### ⚡ Cách 2: Dùng `http` chuẩn của Dart

```bash
npx @openapitools/openapi-generator-cli generate \
  -i http://localhost:3000/api/v1/openapi.json \
  -g dart \
  -o ./lib/core/api_client
```

---

### Bước 3: Cài đặt Dependencies trong `pubspec.yaml` (nếu cần)

Nếu dùng `dart-dio`, thêm các package sau vào `pubspec.yaml` của Flutter:

```yaml
dependencies:
  dio: ^5.7.0
  built_value: ^8.9.2
  built_collection: ^5.1.1

dev_dependencies:
  build_runner: ^2.4.13
  built_value_generator: ^8.9.2
```

Sau đó chạy:

```bash
flutter pub get
dart run build_runner build --delete-conflicting-outputs
```

---

### Bước 4: Sử dụng trong Code Flutter

Sau khi sinh code, bạn có thể gọi API dễ dàng và có Type Safety 100%:

```dart
import 'package:your_app/core/api_client/lib/api.dart';
import 'package:dio/dio.dart';

void main() async {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost:3000/api/v1'));
  final api = Openapi(dio: dio);

  try {
    // 1. Gọi API Đăng nhập
    final response = await api.getAuthApi().authLoginPost(
      loginRequest: LoginRequestBuilder()
        ..email = 'admin@example.com'
        ..password = 'admin123456'
    );

    final accessToken = response.data?.accessToken;
    print('Token: $accessToken');

    // 2. Gọi API với Bearer Token
    dio.options.headers['Authorization'] = 'Bearer $accessToken';
    final userRes = await api.getAuthApi().authMeGet();
    print('Current User: ${userRes.data?.user?.email}');
  } catch (e) {
    print('Error calling API: $e');
  }
}
```

---

## 4. Tự động sinh TypeScript Types (Dành cho Web Client / React / Vue)

Nếu bạn có một dự án Web Frontend khác muốn dùng chung API này:

```bash
npx openapi-typescript http://localhost:3000/api/v1/openapi.json -o ./src/types/api-schema.d.ts
```

---

## 5. Bảng tổng hợp các Endpoint REST API (`/api/v1/**`)

| Nhóm API     | Endpoint                            |   Quyền hạn   | Mô tả                                               |
| :----------- | :---------------------------------- | :-----------: | :-------------------------------------------------- |
| **Auth**     | `POST /api/v1/auth/register`        |    Public     | Đăng ký tài khoản mới                               |
|              | `POST /api/v1/auth/login`           |    Public     | Đăng nhập lấy access & refresh token                |
|              | `POST /api/v1/auth/refresh`         |    Public     | Cấp lại access token từ refresh token               |
|              | `GET /api/v1/auth/me`               | Bearer Token  | Lấy thông tin user hiện tại                         |
|              | `POST /api/v1/auth/change-password` | Bearer Token  | Đổi mật khẩu                                        |
|              | `POST /api/v1/auth/forgot-password` |    Public     | Yêu cầu gửi link đặt lại mật khẩu                   |
|              | `POST /api/v1/auth/reset-password`  |    Public     | Đặt lại mật khẩu với token                          |
|              | `POST /api/v1/auth/logout`          | Bearer Token  | Đăng xuất và thu hồi token                          |
| **Users**    | `GET /api/v1/users`                 |  `user:read`  | Lấy danh sách người dùng (hỗ trợ phân trang cursor) |
|              | `POST /api/v1/users`                | `user:create` | Tạo người dùng mới                                  |
|              | `GET /api/v1/users/[id]`            |  `user:read`  | Xem chi tiết người dùng                             |
|              | `DELETE /api/v1/users/[id]`         | `user:delete` | Xóa mềm người dùng                                  |
|              | `PATCH /api/v1/users/[id]/status`   | `user:update` | Khóa/Mở khóa tài khoản                              |
|              | `POST /api/v1/users/[id]/unlock`    | `user:update` | Mở khóa sớm tài khoản bị khóa tạm                   |
| **Hệ thống** | `GET /api/health`                   |    Public     | Kiểm tra sức khỏe hệ thống (Health check)           |

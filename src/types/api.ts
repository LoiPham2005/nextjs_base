/**
 * Hợp đồng Kiểu dữ liệu (Type Contract) cho REST API Response
 * Đồng bộ chính xác với logic thực thi tại src/lib/api/response.ts
 */

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "ACCOUNT_BANNED"
  | "ACCOUNT_LOCKED"
  | "INTERNAL_ERROR";

export interface ApiErrorDetail {
  code: ApiErrorCode | string;
  message: string;
  fields?: Record<string, string[]>;
}

export interface ApiSuccessResponse<T = unknown> {
  data: T;
  error?: never;
}

export interface ApiErrorResponse {
  data?: never;
  error: ApiErrorDetail;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Kiểu dữ liệu cho Phân trang (Pagination)
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/**
 * Các kiểu dữ liệu tiện ích dùng chung
 */

export type ActionState<T = unknown> = {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
  data?: T;
} | null;

export interface Option<T = string | number> {
  label: string;
  value: T;
  disabled?: boolean;
}

export type ID = string;

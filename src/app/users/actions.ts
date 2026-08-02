"use server";

import { revalidatePath } from "next/cache";
import { userService, UserAlreadyExistsError } from "@/services/user.service";
import { createUserSchema } from "@/schemas/user.schema";

export type CreateUserState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function createUserAction(
  _prevState: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  const parsed = createUserSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name") || undefined,
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    await userService.create(parsed.data);
  } catch (err) {
    if (err instanceof UserAlreadyExistsError) {
      return { error: err.message };
    }
    throw err;
  }

  revalidatePath("/users");
  return {};
}

export async function deleteUserAction(id: string): Promise<{ error?: string }> {
  try {
    await userService.delete(id);
    revalidatePath("/users");
    return {};
  } catch (err) {
    if (err instanceof Error) {
      return { error: err.message };
    }
    return { error: "An unexpected error occurred." };
  }
}

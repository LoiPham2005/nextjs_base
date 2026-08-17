import { enforceRateLimit } from "@/lib/api/auth";
import { apiOk, handleApiError, parseJsonBody } from "@/lib/api/response";
import { issueTokenPair } from "@/lib/api/tokens";
import { logger } from "@/lib/logger";
import { RATE_LIMITS, resetRateLimit } from "@/lib/rate-limit";
import { loginSchema } from "@/schemas/auth.schema";
import { authService } from "@/services/auth.service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const rateLimitKey = await enforceRateLimit(request, "api:login", RATE_LIMITS.login);

    const body = await parseJsonBody(request, loginSchema);
    const user = await authService.validateCredentials(body);

    await resetRateLimit(rateLimitKey);
    logger.info("API login", { userId: user.id });

    const tokens = await issueTokenPair(user, request.headers.get("user-agent"));

    return apiOk({ user, ...tokens });
  } catch (error) {
    return handleApiError(error, { route: "POST /api/v1/auth/login", request });
  }
}

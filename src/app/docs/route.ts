import { ApiReference } from "@scalar/nextjs-api-reference";

export const dynamic = "force-dynamic";

export const GET = ApiReference({
  spec: {
    url: "/api/v1/openapi.json",
  },
  theme: "purple",
  layout: "modern",
  pageTitle: "REST API Documentation",
});

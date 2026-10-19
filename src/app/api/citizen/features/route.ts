import {
  authenticateCitizenApiRequest,
  citizenApiJson,
  citizenApiOptions,
} from "@/lib/citizen/api";
import { getAdminFeatureSettings } from "@/lib/admin/features";

export async function OPTIONS(request: Request) {
  return citizenApiOptions(request);
}

export async function GET(request: Request) {
  const result = await authenticateCitizenApiRequest(request);
  if ("response" in result) return result.response;

  try {
    return citizenApiJson(request, { features: await getAdminFeatureSettings() });
  } catch (error) {
    console.error("Could not load citizen feature settings.", error instanceof Error ? error.name : "UnknownError");
    return citizenApiJson(request, { error: "Feature availability could not be checked." }, { status: 503 });
  }
}

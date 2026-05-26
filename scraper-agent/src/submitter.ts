import type { AppConfig, ScrapedProduct } from "./types.js";
import { formatForSubmission, validateProduct } from "./validator.js";

interface SubmissionResult {
  success: boolean;
  error?: string;
}

export async function submitToMainApp(
  product: ScrapedProduct,
  config: AppConfig,
): Promise<SubmissionResult> {
  const validation = validateProduct(product);
  if (!validation.valid) {
    return {
      success: false,
      error: `Validation failed: ${validation.errors.map((e) => e.message).join("; ")}`,
    };
  }

  const body = formatForSubmission(product);

  try {
    const response = await fetch(`${config.appUrl}/api/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...body,
        captchaToken: "bypass-scraper-agent",
      }),
    });

    if (!response.ok) {
      let errorMsg = `HTTP ${response.status}`;
      try {
        const json = (await response.json()) as Record<string, unknown>;
        errorMsg = (json?.error as string) || errorMsg;
      } catch {
        const text = await response.text();
        if (text) errorMsg = text;
      }
      return { success: false, error: errorMsg };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

import { toast } from "sonner";

type FieldErr = { code?: string; message: string; field?: string };

type ApiErrorShape = {
  response?: { data?: { error?: string; errors?: FieldErr[]; capabilityGated?: boolean } };
  message?: string;
};

/** Pull the normalized message + field errors out of an axios error. */
export function extractApiError(
  err: unknown,
  fallback = "Something went wrong"
): { message: string; errors: FieldErr[]; capabilityGated: boolean } {
  const data = (err as ApiErrorShape)?.response?.data;
  const errors: FieldErr[] = Array.isArray(data?.errors) ? data!.errors! : [];
  const message = data?.error || (err as ApiErrorShape)?.message || fallback;
  return { message, errors, capabilityGated: !!data?.capabilityGated };
}

/**
 * Show an error toast that includes the API's field-level detail as the
 * description, so users see *why* a mutation was rejected — not just "failed".
 *
 * Capability-gated failures get a longer duration: "ask your OpenAI partner
 * representative to enable conversion bidding" is a message someone needs time
 * to actually read, not a transient blip.
 */
export function adsErrorToast(err: unknown, fallback = "Something went wrong") {
  const { message, errors, capabilityGated } = extractApiError(err, fallback);
  const extra = errors
    .filter((e) => e.message && e.message !== message)
    .slice(0, 4)
    .map((e) => (e.field ? `${e.field}: ${e.message}` : e.message));

  toast.error(message, {
    ...(extra.length ? { description: extra.join("\n") } : {}),
    ...(capabilityGated ? { duration: 12_000 } : {}),
  });
}

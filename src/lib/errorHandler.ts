/**
 * Universal error extractor for Supabase, PostgrestError, DOMException, and JavaScript Error objects.
 * Prevents errors from being masked as "Unknown error".
 */
export function extractErrorMessage(err: unknown, fallback = 'Unknown error'): string {
  if (!err) return fallback;
  if (typeof err === 'string' && err.trim().length > 0) return err;

  if (typeof err === 'object') {
    const record = err as Record<string, unknown>;

    // Supabase PostgrestError standard fields
    if (typeof record.message === 'string' && record.message.trim().length > 0) {
      // Include hint or details if available for actionable debugging
      if (typeof record.details === 'string' && record.details.trim().length > 0 && record.details !== 'null') {
        return `${record.message} (${record.details})`;
      }
      return record.message;
    }

    if (typeof record.error_description === 'string' && record.error_description.trim().length > 0) {
      return record.error_description;
    }

    if (typeof record.details === 'string' && record.details.trim().length > 0) {
      return record.details;
    }

    if (typeof record.hint === 'string' && record.hint.trim().length > 0) {
      return record.hint;
    }

    if (record instanceof Error && record.message) {
      return record.message;
    }
  }

  return fallback;
}

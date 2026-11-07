import { apiError } from "@/lib/http/api-response";

import { MetaCommentError } from "./meta-comments-core";

export function metaCommentErrorResponse(error: unknown) {
  if (error instanceof MetaCommentError) {
    return apiError(error.status, error.code, error.message);
  }
  console.error("meta_comment_action_failed", {
    error: error instanceof Error ? error.name : "unknown",
  });
  return apiError(500, "facebook_comment_action_failed", "Facebook comment action failed.");
}

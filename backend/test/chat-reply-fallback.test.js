import test from "node:test";
import assert from "node:assert/strict";

import { canFallbackChatReplyQuery } from "../chat-routes.js";

test("le fallback du chat est réservé à l'absence historique de reply_to_id", () => {
  assert.equal(
    canFallbackChatReplyQuery({ code: "42703", message: 'column cm.reply_to_id does not exist' }),
    true,
  );
  assert.equal(
    canFallbackChatReplyQuery({ code: "42703", message: 'column cm.poll does not exist' }),
    false,
  );
  assert.equal(
    canFallbackChatReplyQuery({ code: "42P01", message: 'relation chat_messages does not exist' }),
    false,
  );
  assert.equal(canFallbackChatReplyQuery(new Error("connexion perdue")), false);
});

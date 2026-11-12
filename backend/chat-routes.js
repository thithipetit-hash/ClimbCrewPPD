import express from "express";
import {
  validateChatMessage,
  validateChatPinned,
  validateChatPoll,
  validateChatPollOption,
  validateChatReaction,
} from "./validation.js";
import { addRealisationKudo, removeRealisationKudo } from "./realisation-kudo-service.js";

const CHAT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const KUDO_REACTION = "👍";
const CHAT_REACTIONS_SQL = `coalesce((
  select json_agg(
    json_build_object('reaction', reaction_items.reaction, 'participantId', reaction_items.participant_id)
    order by reaction_items.created_at asc
  )
  from (
    select r.reaction, r.participant_id, r.created_at
    from chat_message_reactions r
    where r.message_id = cm.id
      and not (
        r.reaction = '👍'
        and cm.kind = 'system'
        and cm.event_type = 'realisation'
        and cm.event_ref is not null
      )
    union all
    select '👍'::text, k.participant_id, k.created_at
    from realisation_kudos k
    where cm.kind = 'system'
      and cm.event_type = 'realisation'
      and cm.event_ref is not null
      and k.realisation_id = cm.event_ref
  ) reaction_items
), '[]'::json)`;

function isRealisationKudoMessage(message, reaction) {
  return reaction === KUDO_REACTION
    && message?.kind === "system"
    && message?.eventType === "realisation"
    && Boolean(message?.eventRef);
}

function participantIdFromRequest(req) {
  return req.auth?.user?.participantId || req.enhancementAuth?.user?.participantId || null;
}

function decodeHeader(value, fallback = "", maxLength = 240) {
  try {
    return decodeURIComponent(String(value || fallback)).replace(/[\r\n]/g, "").slice(0, maxLength);
  } catch {
    return fallback;
  }
}

export function canFallbackChatReplyQuery(error) {
  return error?.code === "42703" && /reply_to_id/i.test(String(error?.message || ""));
}

function publicMessageRow(row) {
  return {
    id: row.id,
    participantId: row.participantId,
    message: row.message,
    createdAt: row.createdAt,
    attachmentName: row.attachmentName || null,
    attachmentMimeType: row.attachmentMimeType || null,
    attachmentSize: row.attachmentSize == null ? null : Number(row.attachmentSize),
    attachmentUrl: row.attachmentName ? `/chat/messages/${row.id}/attachment` : null,
    kind: row.kind || "user",
    eventType: row.eventType || null,
    reactions: row.reactions || [],
    editedAt: row.editedAt || null,
    pinned: Boolean(row.pinned),
    poll: row.poll || null,
    eventRef: row.eventRef || null,
    replyTo: row.replyTo || null,
  };
}

export function installChatRoutes(app, { requireAuth, requireAdmin, pool }) {
  app.get("/chat/messages", requireAuth, async (_req, res) => {
    try {
      let rows;
      try {
        ({ rows } = await pool.query(
          `select cm.id, cm.participant_id as "participantId", cm.message, cm.created_at as "createdAt",
                  cm.attachment_name as "attachmentName", cm.attachment_mime_type as "attachmentMimeType",
                  cm.attachment_size as "attachmentSize", cm.kind, cm.event_type as "eventType", cm.event_ref as "eventRef",
                  cm.edited_at as "editedAt", cm.pinned, cm.poll,
                  case when parent.id is null then null else json_build_object('id', parent.id, 'participantId', parent.participant_id, 'message', parent.message, 'attachmentName', parent.attachment_name) end as "replyTo",
                  ${CHAT_REACTIONS_SQL} as reactions
           from chat_messages cm
           left join chat_messages parent on parent.id = cm.reply_to_id
           order by cm.created_at desc
           limit 200`
        ));
      } catch (replyQueryError) {
        // Le repli ne couvre que l'absence historique de reply_to_id. Toute autre
        // erreur SQL doit remonter afin de ne pas masquer une panne réelle du chat.
        if (!canFallbackChatReplyQuery(replyQueryError)) throw replyQueryError;
        console.warn("chat reply query unavailable, fallback to base chat query:", replyQueryError.message);
        ({ rows } = await pool.query(
          `select cm.id, cm.participant_id as "participantId", cm.message, cm.created_at as "createdAt",
                  cm.attachment_name as "attachmentName", cm.attachment_mime_type as "attachmentMimeType",
                  cm.attachment_size as "attachmentSize", cm.kind, cm.event_type as "eventType", cm.event_ref as "eventRef",
                  cm.edited_at as "editedAt", cm.pinned, cm.poll,
                  null::json as "replyTo",
                  ${CHAT_REACTIONS_SQL} as reactions
           from chat_messages cm
           order by cm.created_at desc
           limit 200`
        ));
      }
      res.json(rows.reverse().map(publicMessageRow));
    } catch (error) {
      console.error("chat list error:", error);
      res.status(500).json({ error: "Lecture du chat impossible." });
    }
  });

  app.get("/chat/messages/:id/attachment", requireAuth, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `select attachment_name, attachment_mime_type, attachment_content
         from chat_messages where id = $1 limit 1`,
        [req.params.id],
      );
      const item = rows[0];
      if (!item?.attachment_content) return res.status(404).json({ error: "Fichier introuvable." });
      const safeName = String(item.attachment_name || "fichier").replace(/[\r\n"]/g, "_");
      res.set("Content-Type", item.attachment_mime_type || "application/octet-stream");
      res.set("Content-Disposition", `inline; filename="${safeName}"`);
      res.set("Cache-Control", "private, max-age=300");
      return res.send(item.attachment_content);
    } catch (error) {
      console.error("chat attachment read error:", error);
      return res.status(500).json({ error: "Lecture du fichier impossible." });
    }
  });

  app.post("/chat/messages", requireAuth, async (req, res) => {
    try {
      const participantId = participantIdFromRequest(req);
      if (!participantId) return res.status(403).json({ error: "Compte non relié à un grimpeur." });
      const message = validateChatMessage(req.body?.message);
      const replyToId = req.body?.replyToId == null ? null : Number(req.body.replyToId);
      if (replyToId != null && (!Number.isInteger(replyToId) || !(await pool.query("select 1 from chat_messages where id=$1", [replyToId])).rowCount)) return res.status(400).json({ error: "Message cité invalide." });
      let rows;
      if (replyToId == null) {
        // Envoi standard : ne dépend pas de la colonne reply_to_id afin que le
        // chat reste utilisable sur une base où la migration des réponses tarde.
        ({ rows } = await pool.query(
          `insert into chat_messages (participant_id, message)
           values ($1, $2)
           returning id, participant_id as "participantId", message, created_at as "createdAt",
                     attachment_name as "attachmentName", attachment_mime_type as "attachmentMimeType",
                     attachment_size as "attachmentSize"`,
          [participantId, message]
        ));
      } else {
        ({ rows } = await pool.query(
          `insert into chat_messages (participant_id, message, reply_to_id)
           values ($1, $2, $3)
           returning id, participant_id as "participantId", message, created_at as "createdAt",
                     attachment_name as "attachmentName", attachment_mime_type as "attachmentMimeType",
                     attachment_size as "attachmentSize"`,
          [participantId, message, replyToId]
        ));
      }
      res.status(201).json(publicMessageRow(rows[0]));
    } catch (error) {
      console.error("chat send error:", error);
      res.status(error.status || 500).json({
        error: error.status ? error.message : "Envoi du message impossible.",
        fields: error.fields || undefined,
      });
    }
  });


  app.patch("/chat/messages/:id", requireAuth, async (req, res) => {
    try {
      const participantId = participantIdFromRequest(req);
      const message = validateChatMessage(req.body?.message);
      if (!participantId) return res.status(403).json({ error: "Compte non relié à un grimpeur." });
      const { rows } = await pool.query(
        `update chat_messages set message=$1, edited_at=now()
         where id=$2 and participant_id=$3 and kind='user'
         returning id, participant_id as "participantId", message, created_at as "createdAt",
          edited_at as "editedAt", pinned, poll, kind, event_type as "eventType", event_ref as "eventRef",
          attachment_name as "attachmentName", attachment_mime_type as "attachmentMimeType", attachment_size as "attachmentSize"`,
        [message, req.params.id, participantId],
      );
      if (!rows[0]) return res.status(404).json({ error: "Message introuvable ou non modifiable." });
      return res.json(publicMessageRow(rows[0]));
    } catch (error) {
      console.error("chat edit error:", error);
      return res.status(error.status || 500).json({ error: error.status ? error.message : "Modification impossible.", fields: error.fields || undefined });
    }
  });

  app.delete("/chat/messages/:id", requireAuth, async (req, res) => {
    try {
      const participantId = participantIdFromRequest(req);
      if (!participantId) return res.status(403).json({ error: "Compte non relié à un grimpeur." });
      const result = await pool.query("delete from chat_messages where id=$1 and participant_id=$2 and kind='user'", [req.params.id, participantId]);
      if (!result.rowCount) return res.status(404).json({ error: "Message introuvable ou non supprimable." });
      return res.json({ ok: true });
    } catch (error) { console.error("chat delete error:", error); return res.status(500).json({ error: "Suppression impossible." }); }
  });

  app.post("/chat/messages/:id/pin", requireAuth, requireAdmin, async (req, res) => {
    try {
      const pinned = validateChatPinned(req.body?.pinned);
      const { rows } = await pool.query("update chat_messages set pinned=$1 where id=$2 returning id, pinned", [pinned, req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: "Message introuvable." });
      return res.json(rows[0]);
    } catch (error) {
      return res.status(error.status || 500).json({ error: error.status ? error.message : "Épinglage impossible.", fields: error.fields || undefined });
    }
  });

  app.post("/chat/polls", requireAuth, async (req, res) => {
    try {
      const participantId = participantIdFromRequest(req);
      if (!participantId) return res.status(403).json({ error: "Compte non relié à un grimpeur." });
      const { question, options } = validateChatPoll(req.body || {});
      const poll = { question, options: options.map((label, index) => ({ id: index + 1, label, votes: [] })) };
      const { rows } = await pool.query(
        `insert into chat_messages(participant_id,message,kind,event_type,poll) values($1,$2,'user','poll',$3::jsonb)
         returning id, participant_id as "participantId", message, created_at as "createdAt", kind, event_type as "eventType", poll, pinned, edited_at as "editedAt"`,
        [participantId, question, JSON.stringify(poll)],
      );
      return res.status(201).json(publicMessageRow(rows[0]));
    } catch (error) {
      console.error("chat poll error:", error);
      return res.status(error.status || 500).json({ error: error.status ? error.message : "Création du sondage impossible.", fields: error.fields || undefined });
    }
  });

  app.post("/chat/messages/:id/poll-vote", requireAuth, async (req, res) => {
    const participantId = participantIdFromRequest(req);
    if (!participantId) return res.status(403).json({ error: "Compte non relié à un grimpeur." });

    const client = await pool.connect();
    try {
      await client.query("begin");
      const { rows } = await client.query(
        "select poll from chat_messages where id=$1 and event_type='poll' for update",
        [req.params.id],
      );
      const poll = rows[0]?.poll;
      if (!poll) {
        await client.query("rollback");
        return res.status(404).json({ error: "Sondage introuvable." });
      }
      const optionId = validateChatPollOption(req.body?.optionId, poll);
      poll.options = (poll.options || []).map((option) => ({
        ...option,
        votes: Number(option.id) === optionId
          ? [...new Set([...(option.votes || []).filter((id) => String(id) !== String(participantId)), participantId])]
          : (option.votes || []).filter((id) => String(id) !== String(participantId)),
      }));
      await client.query("update chat_messages set poll=$1::jsonb where id=$2", [JSON.stringify(poll), req.params.id]);
      await client.query("commit");
      return res.json({ ok: true, poll });
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      console.error("chat vote error:", error);
      return res.status(error.status || 500).json({ error: error.status ? error.message : "Vote impossible.", fields: error.fields || undefined });
    } finally {
      client.release();
    }
  });

  app.get("/chat/kudos", requireAuth, async (_req, res) => {
    try {
      const { rows } = await pool.query(`
        select participant_id as "participantId", count(*)::int as kudos
        from (
          select r.participant_id
          from chat_message_reactions r
          join chat_messages cm on cm.id = r.message_id
          where r.reaction = '👍'
            and not (
              cm.kind = 'system'
              and cm.event_type = 'realisation'
              and cm.event_ref is not null
            )
          union all
          select participant_id
          from realisation_kudos
        ) kudo_sources
        group by participant_id
        order by kudos desc, participant_id asc
      `);
      return res.json(rows);
    } catch (error) { return res.status(500).json({ error: "Classement Kudos indisponible." }); }
  });

  app.post("/chat/messages/:id/reactions", requireAuth, async (req, res) => {
    try {
      const participantId = participantIdFromRequest(req);
      if (!participantId) return res.status(403).json({ error: "Compte non relié à un grimpeur." });
      const reaction = validateChatReaction(req.body?.reaction);
      const messageResult = await pool.query(
        `select kind, event_type as "eventType", event_ref as "eventRef"
         from chat_messages where id = $1 limit 1`,
        [req.params.id],
      );
      const message = messageResult.rows[0];
      if (!message) return res.status(404).json({ error: "Message introuvable." });

      if (isRealisationKudoMessage(message, reaction)) {
        const state = await addRealisationKudo(pool, {
          realisationId: message.eventRef,
          participantId,
        });
        return res.json({ ok: true, realisationId: message.eventRef, ...state });
      }

      await pool.query(
        `insert into chat_message_reactions (message_id, participant_id, reaction)
         values ($1,$2,$3) on conflict (message_id, participant_id, reaction) do nothing`,
        [req.params.id, participantId, reaction],
      );
      return res.json({ ok: true });
    } catch (error) {
      console.error("chat reaction error:", error);
      return res.status(error.status || 500).json({
        error: error.status ? error.message : "Réaction impossible.",
      });
    }
  });

  app.delete("/chat/messages/:id/reactions", requireAuth, async (req, res) => {
    try {
      const participantId = participantIdFromRequest(req);
      const reaction = validateChatReaction(req.body?.reaction);
      if (!participantId) return res.status(403).json({ error: "Compte non relié à un grimpeur." });
      const messageResult = await pool.query(
        `select kind, event_type as "eventType", event_ref as "eventRef"
         from chat_messages where id = $1 limit 1`,
        [req.params.id],
      );
      const message = messageResult.rows[0];
      if (!message) return res.status(404).json({ error: "Message introuvable." });

      if (isRealisationKudoMessage(message, reaction)) {
        const state = await removeRealisationKudo(pool, {
          realisationId: message.eventRef,
          participantId,
        });
        return res.json({ ok: true, realisationId: message.eventRef, ...state });
      }

      await pool.query(
        "delete from chat_message_reactions where message_id = $1 and participant_id = $2 and reaction = $3",
        [req.params.id, participantId, reaction],
      );
      return res.json({ ok: true });
    } catch (error) {
      console.error("chat reaction delete error:", error);
      return res.status(error.status || 500).json({
        error: error.status ? error.message : "Retrait de la réaction impossible.",
      });
    }
  });

  app.post(
    "/chat/messages/attachment",
    requireAuth,
    express.raw({ type: () => true, limit: CHAT_ATTACHMENT_MAX_BYTES }),
    async (req, res) => {
      try {
        const participantId = participantIdFromRequest(req);
        if (!participantId) return res.status(403).json({ error: "Compte non relié à un grimpeur." });
        if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
          return res.status(400).json({ error: "Fichier vide." });
        }
        if (req.body.length > CHAT_ATTACHMENT_MAX_BYTES) {
          return res.status(413).json({ error: "Fichier trop volumineux. Maximum 10 Mo." });
        }
        const fileName = decodeHeader(req.headers["x-file-name"], "fichier") || "fichier";
        const message = validateChatMessage(decodeHeader(req.headers["x-chat-message"], "", 2000), { required: false });
        const mimeType = String(req.headers["content-type"] || "application/octet-stream")
          .split(";")[0].trim().toLowerCase().slice(0, 160);
        const { rows } = await pool.query(
          `insert into chat_messages (
             participant_id, message, attachment_name, attachment_mime_type, attachment_size, attachment_content
           ) values ($1,$2,$3,$4,$5,$6)
           returning id, participant_id as "participantId", message, created_at as "createdAt",
                     attachment_name as "attachmentName", attachment_mime_type as "attachmentMimeType",
                     attachment_size as "attachmentSize"`,
          [participantId, message, fileName, mimeType, req.body.length, req.body],
        );
        return res.status(201).json(publicMessageRow(rows[0]));
      } catch (error) {
        console.error("chat attachment send error:", error);
        return res.status(error.type === "entity.too.large" ? 413 : 500)
          .json({ error: error.type === "entity.too.large" ? "Fichier trop volumineux. Maximum 10 Mo." : "Envoi du fichier impossible." });
      }
    },
  );
}

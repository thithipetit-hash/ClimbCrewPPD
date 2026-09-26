import React from "react";
import { API_BASE, apiFetch, apiUpload } from "../lib/api.js";
import { customAvatarSource } from "../lib/custom-avatar.js";
import { AVATAR_OPTIONS } from "../components/ProfileGecko.jsx";
import "../styles/chat.css";

const EMOJIS = ["😀","😂","😊","😍","👍","👏","💪","🧗","🔥","🎉","❤️","🤔","😅","🙌","👋","✅","📸","🏆"];

export default function Chat({ myParticipantId, participants = [] }) {
  const [messages, setMessages] = React.useState([]);
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState("");
  const [showEmoji, setShowEmoji] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [filter, setFilter] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [showMedia, setShowMedia] = React.useState(false);
  const [showPoll, setShowPoll] = React.useState(false);
  const [activeMessageId, setActiveMessageId] = React.useState(null);
  const [replyTo, setReplyTo] = React.useState(null);
  const [reactionDetails, setReactionDetails] = React.useState(null);
  const bottomRef = React.useRef(null);
  const fileRef = React.useRef(null);
  const participantsById = React.useMemo(
    () => Object.fromEntries(participants.map((participant) => [String(participant.id), participant])),
    [participants],
  );

  const loadMessages = React.useCallback(async () => {
    try {
      const data = await apiFetch("/chat/messages");
      setMessages(Array.isArray(data) ? data : []);
      setError("");
    } catch (err) {
      setError(String(err.message || err));
    }
  }, []);

  React.useEffect(() => {
    void loadMessages();
    const timer = window.setInterval(() => void loadMessages(), 5000);
    return () => window.clearInterval(timer);
  }, [loadMessages]);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function sendMessage(event) {
    event.preventDefault();
    const message = text.trim();
    if (!message || sending) return;
    try {
      setSending(true);
      setText("");
      await apiFetch("/chat/messages", {
        method: "POST",
        body: JSON.stringify({ message, replyToId: replyTo?.id || null }),
      });
      setReplyTo(null);
      await loadMessages();
    } catch (err) {
      setText(message);
      setError(String(err.message || err));
    } finally {
      setSending(false);
    }
  }

  async function shareFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || sending) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("Fichier trop volumineux. Maximum 10 Mo.");
      return;
    }
    try {
      setSending(true);
      const message = text.trim();
      setText("");
      await apiUpload("/chat/messages/attachment", file, {
        headers: { "X-Chat-Message": encodeURIComponent(message) },
      });
      await loadMessages();
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setSending(false);
    }
  }

  async function toggleReaction(item, reaction) {
    const mine = (item.reactions || []).some((r) => String(r.participantId) === String(myParticipantId) && r.reaction === reaction);
    try {
      await apiFetch(`/chat/messages/${item.id}/reactions`, {
        method: mine ? "DELETE" : "POST",
        body: JSON.stringify({ reaction }),
      });
      await loadMessages();
    } catch (err) {
      setError(String(err.message || err));
    }
  }

  function reactionGroups(item) {
    const groups = new Map();
    for (const reaction of item.reactions || []) {
      const key = reaction.reaction;
      const current = groups.get(key) || { reaction: key, count: 0, mine: false, participantIds: [] };
      current.count += 1;
      if (String(reaction.participantId) === String(myParticipantId)) current.mine = true;
      groups.set(key, current);
    }
    return [...groups.values()];
  }

  async function editMessage(item) {
    const value = window.prompt("Modifier le message", item.message || "");
    if (!value?.trim() || value.trim() === item.message) return;
    await apiFetch(`/chat/messages/${item.id}`, { method: "PATCH", body: JSON.stringify({ message: value.trim() }) });
    await loadMessages();
  }
  async function deleteMessage(item) {
    if (!window.confirm("Supprimer ce message ?")) return;
    await apiFetch(`/chat/messages/${item.id}`, { method: "DELETE" }); await loadMessages();
  }
  async function togglePin(item) {
    await apiFetch(`/chat/messages/${item.id}/pin`, { method: "POST", body: JSON.stringify({ pinned: !item.pinned }) }); await loadMessages();
  }
  async function createPoll() {
    const question = window.prompt("Question du sondage");
    if (!question?.trim()) return;
    const raw = window.prompt("Réponses possibles, séparées par des points-virgules", "Oui;Non");
    const options = String(raw || "").split(";").map(x => x.trim()).filter(Boolean);
    if (options.length < 2) return;
    await apiFetch("/chat/polls", { method: "POST", body: JSON.stringify({ question: question.trim(), options }) }); setShowPoll(false); await loadMessages();
  }
  async function vote(item, optionId) {
    await apiFetch(`/chat/messages/${item.id}/poll-vote`, { method: "POST", body: JSON.stringify({ optionId }) }); await loadMessages();
  }
  const visibleMessages = messages.filter(item => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || String(item.message || "").toLowerCase().includes(q) || displayName(item.participantId).toLowerCase().includes(q);
    const matchesFilter = filter === "all" || (filter === "media" ? Boolean(item.attachmentUrl) : item.eventType === filter);
    return matchesSearch && matchesFilter;
  });
  const mediaMessages = messages.filter(item => item.attachmentUrl);

  function displayName(participantId) {
    const participant = participantsById[String(participantId)];
    if (!participant) return "Grimpeur";
    return [participant.prenom, participant.nom].filter(Boolean).join(" ") || "Grimpeur";
  }

  function avatarSource(participantId) {
    const participant = participantsById[String(participantId)];
    if (!participant) return "";
    const custom = customAvatarSource(participant);
    if (custom) return custom;
    return AVATAR_OPTIONS.find((option) => option.id === participant.avatarId)?.image
      || AVATAR_OPTIONS[0]?.image
      || "";
  }

  function attachmentUrl(item) {
    return `${API_BASE}${item.attachmentUrl}`;
  }

  function renderAttachment(item) {
    if (!item.attachmentUrl) return null;
    const isImage = String(item.attachmentMimeType || "").startsWith("image/");
    if (isImage) {
      return (
        <a href={attachmentUrl(item)} target="_blank" rel="noreferrer" className="chat-image-link">
          <img className="chat-image" src={attachmentUrl(item)} alt={item.attachmentName || "Image partagée"} />
        </a>
      );
    }
    return (
      <a className="chat-file" href={attachmentUrl(item)} target="_blank" rel="noreferrer">
        <span aria-hidden="true">📎</span>
        <span>{item.attachmentName || "Fichier"}</span>
        {item.attachmentSize != null && <small>{Math.max(1, Math.round(item.attachmentSize / 1024))} Ko</small>}
      </a>
    );
  }

  return (
    <div className="card chat-page">
      <div className="card-header">
        <div>
          <h2 style={{ margin: 0 }}>Chat du club</h2>
          <div className="small">Messages, emoji, photos et fichiers entre les membres de ClimbCrew.</div>
        </div>
      </div>
      {error && <div className="muted-box" role="alert">{error}</div>}
      <div className="chat-toolbar">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…" aria-label="Rechercher dans le chat" />
        <select value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filtrer le chat">
          <option value="all">Tous</option><option value="realisation">Réalisations</option><option value="badge">Badges</option>
          <option value="session">Séances</option><option value="route">Voies</option><option value="poll">Sondages</option><option value="media">Médias</option>
        </select>
        <button type="button" onClick={() => setShowMedia(v => !v)}>🖼️ Médias</button>
        <button type="button" onClick={() => setShowPoll(true)}>📊 Sondage</button>
      </div>
      {showPoll && <div className="muted-box">Créer un sondage pour le club. <button type="button" onClick={createPoll}>Créer</button></div>}
      {showMedia && <div className="chat-gallery">{mediaMessages.map(item => <a key={item.id} href={attachmentUrl(item)} target="_blank" rel="noreferrer">{String(item.attachmentMimeType||"").startsWith("image/") ? <img src={attachmentUrl(item)} alt={item.attachmentName || "Média"} /> : <span>📎 {item.attachmentName}</span>}</a>)}</div>}
      <div className="chat-thread" aria-live="polite">
        {messages.length === 0 && <div className="muted-box">Aucun message. Lancez la conversation.</div>}
        {visibleMessages.map((item) => {
          const mine = String(item.participantId) === String(myParticipantId);
          return (
            <div className={mine ? "chat-row chat-row-mine" : "chat-row"} key={item.id}>
              {item.kind !== "system" && avatarSource(item.participantId) && (
                <img className="chat-avatar" src={avatarSource(item.participantId)} alt="" aria-hidden="true" />
              )}
              <div className={`${mine ? "chat-bubble chat-bubble-mine" : "chat-bubble"} ${item.kind === "system" ? "chat-bubble-system" : ""}`} role="button" tabIndex={0} aria-expanded={activeMessageId === item.id} onClick={() => setActiveMessageId((current) => current === item.id ? null : item.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActiveMessageId((current) => current === item.id ? null : item.id); } }}>
                {!mine && <strong>{displayName(item.participantId)}</strong>}
                {item.replyTo && <div className="chat-reply-quote"><strong>{displayName(item.replyTo.participantId)}</strong><span>{item.replyTo.message || (item.replyTo.attachmentName ? `📎 ${item.replyTo.attachmentName}` : "Message")}</span></div>}
                {renderAttachment(item)}
                {item.pinned && <div className="chat-pinned">📌 Épinglé</div>}
                {item.message && <div className="chat-message-text">{item.message}</div>}
                {item.poll?.options && <div className="chat-poll">{item.poll.options.map(option => <button type="button" key={option.id} onClick={() => vote(item, option.id)}>{option.label} · {(option.votes || []).length}</button>)}</div>}
                {item.editedAt && <span className="small"> · modifié</span>}
                <div className="small">{new Date(item.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</div>
                {reactionGroups(item).length > 0 && (
                  <div className="chat-reactions chat-reactions-display" onClick={(event) => event.stopPropagation()}>
                    {reactionGroups(item).map((group) => (
                      <button type="button" className={group.mine ? "chat-reaction active" : "chat-reaction"} key={group.reaction} onClick={() => setReactionDetails({ reaction: group.reaction, names: group.participantIds.map(displayName) })}>{group.reaction} {group.count}</button>
                    ))}
                  </div>
                )}
                {activeMessageId === item.id && (
                  <div className="chat-message-menu" onClick={(event) => event.stopPropagation()}>
                    <div className="chat-reaction-picker">
                      <button type="button" className="chat-reaction chat-kudo" onClick={() => toggleReaction(item, "👍")} aria-label="Ajouter un Kudo">👍 Kudo</button>
                      <select className="chat-reaction-select" aria-label="Ajouter un emoji" defaultValue="" onChange={(event) => { if (event.target.value) void toggleReaction(item, event.target.value); event.target.value = ""; }}>
                        <option value="">😊 Emoji</option>
                        {EMOJIS.filter((emoji) => emoji !== "👍").map((emoji) => <option value={emoji} key={emoji}>{emoji}</option>)}
                      </select>
                    </div>
                    <div className="chat-actions"><button type="button" onClick={() => { setReplyTo(item); setActiveMessageId(null); }}>↩️ Répondre</button><button type="button" onClick={() => togglePin(item)}>{item.pinned ? "Désépingler" : "📌 Épingler"}</button>{mine && item.kind !== "system" && <><button type="button" onClick={() => editMessage(item)}>✏️ Modifier</button><button type="button" onClick={() => deleteMessage(item)}>🗑️ Supprimer</button></>}</div>

                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      {showEmoji && (
        <div className="chat-emoji-picker" aria-label="Choisir un emoji">
          {EMOJIS.map((emoji) => (
            <button type="button" key={emoji} onClick={() => setText((value) => value + emoji)}>{emoji}</button>
          ))}
        </div>
      )}
      {reactionDetails && <div className="chat-reaction-details" role="dialog" aria-label="Détail des réactions"><strong>{reactionDetails.reaction} Réactions</strong><span>{reactionDetails.names.join(", ")}</span><button type="button" onClick={() => setReactionDetails(null)}>Fermer</button></div>}
      {replyTo && <div className="chat-reply-preview"><div><strong>Réponse à {displayName(replyTo.participantId)}</strong><span>{replyTo.message || (replyTo.attachmentName ? `📎 ${replyTo.attachmentName}` : "Message")}</span></div><button type="button" onClick={() => setReplyTo(null)} aria-label="Annuler la réponse">✕</button></div>}
      <form className="chat-composer" onSubmit={sendMessage}>
        <button type="button" className="chat-tool-button" onClick={() => setShowEmoji((value) => !value)} aria-label="Emoji">😊</button>
        <button type="button" className="chat-tool-button" onClick={() => fileRef.current?.click()} aria-label="Partager une image ou un fichier">📎</button>
        <input
          ref={fileRef}
          type="file"
          className="chat-file-input"
          onChange={shareFile}
          aria-label="Choisir une image ou un fichier"
        />
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={2000}
          placeholder="Message"
          aria-label="Message"
        />
        <button type="submit" className="button" disabled={!text.trim() || sending}>{sending ? "…" : "Envoyer"}</button>
      </form>
    </div>
  );
}

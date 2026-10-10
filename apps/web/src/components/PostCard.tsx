import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, type PostDTO } from "../lib/api";
import { useSession } from "../state/session";
import { Avatar } from "./ui";

const action = "font-mono text-micro uppercase tracking-[0.1em] text-text-secondary hover:text-leaf disabled:opacity-40";

export function PostCard({ post, onChanged }: { post: PostDTO; onChanged?: () => void }) {
  const { user } = useSession();
  const ref = useRef<HTMLElement>(null);
  const [liked, setLiked] = useState(post.liked);
  const [likes, setLikes] = useState(post.likes);
  const [replies, setReplies] = useState<PostDTO[] | null>(null);
  const [expanded, setExpanded] = useState<"reply" | "quote" | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<PostDTO | null>(null);

  useEffect(() => { setLiked(post.liked); setLikes(post.likes); }, [post.id, post.liked, post.likes]);
  useEffect(() => {
    const id = post.quotePostId ?? post.repostOfId;
    if (!id) return;
    let active = true;
    api.post(id).then(({ post: result }) => { if (active) setReference(result); }).catch(() => {});
    return () => { active = false; };
  }, [post.quotePostId, post.repostOfId]);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        void api.viewPost(post.id).catch(() => {});
      }
    }, { threshold: 0.5 });
    observer.observe(element);
    return () => observer.disconnect();
  }, [post.id]);

  const toggleLike = async () => {
    if (pending) return;
    setPending(true); setError(null);
    try {
      if (liked) await api.unlikePost(post.id); else await api.likePost(post.id);
      setLiked(!liked); setLikes((count) => count + (liked ? -1 : 1));
    } catch { setError("Could not update your like. Try again."); }
    finally { setPending(false); }
  };
  const submit = async () => {
    if (!draft.trim() || pending) return;
    setPending(true); setError(null);
    try {
      await api.createPost({ text: draft.trim(), ...(expanded === "reply" ? { replyToId: post.id } : { quotePostId: post.id }) });
      setDraft(""); setExpanded(null);
      if (replies) setReplies((await api.replies(post.id)).posts);
      onChanged?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not publish. Try again."); }
    finally { setPending(false); }
  };
  const repost = async () => {
    if (pending) return;
    setPending(true); setError(null);
    try { await api.createPost({ repostOfId: post.id }); onChanged?.(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not reshare. Try again."); }
    finally { setPending(false); }
  };
  const showReplies = async () => {
    if (replies) { setReplies(null); return; }
    try { setReplies((await api.replies(post.id)).posts); }
    catch { setError("Could not load replies. Try again."); }
  };
  const report = async () => {
    const reason = window.prompt("Why are you reporting this post?");
    if (!reason?.trim()) return;
    try { await api.report("post", post.id, reason.trim()); setError("Report sent for review."); }
    catch { setError("Could not send the report. Try again."); }
  };
  const deletePost = async () => {
    if (pending || !window.confirm("Delete this post? This cannot be undone.")) return;
    setPending(true); setError(null);
    try { await api.deletePost(post.id); onChanged?.(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete this post. Try again."); }
    finally { setPending(false); }
  };

  return <article ref={ref} className="border border-border bg-surface1 p-4" aria-label={`Post by ${post.author.displayName}`}>
    {post.repostOfId && <p className="mb-2 font-mono text-micro uppercase tracking-[0.1em] text-text-muted">↻ {post.author.displayName} reshared</p>}
    <div className="flex gap-3">
      <Link to={`/users/${post.author.id}`} aria-label={`${post.author.displayName}'s profile`}><Avatar name={post.author.displayName} url={post.author.avatarUrl} size={40} /></Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><Link to={`/users/${post.author.id}`} className="font-semibold text-text hover:text-leaf">{post.author.displayName}</Link><span className="font-mono text-micro text-text-muted">@{post.author.handle}</span><time className="font-mono text-micro text-text-muted" dateTime={new Date(post.createdAt).toISOString()}>· {new Date(post.createdAt).toLocaleString()}</time></div>
        {post.body && <p className="mt-2 whitespace-pre-wrap break-words text-body text-text">{post.body}</p>}
        {post.linkUrl && <a className="mt-2 block break-all font-mono text-bodysm text-leaf underline" href={post.linkUrl} target="_blank" rel="noopener noreferrer nofollow">{post.linkUrl}</a>}
        {post.media.length > 0 && <div className="mt-3 grid gap-1 sm:grid-cols-2">{post.media.map((url) => /\.(mp4|webm)(\?|$)/i.test(url) ? <video key={url} src={url} controls preload="metadata" className="max-h-[420px] w-full bg-black" /> : <img key={url} src={url} alt="Post attachment" loading="lazy" className="max-h-[420px] w-full object-cover" />)}</div>}
        {post.streamId && <Link to={`/live/${post.streamId}`} className="mt-3 block border border-border bg-surface2 p-3 font-mono text-bodysm text-leaf">● Watch linked live stream →</Link>}
        {post.momentId && <Link to={`/moments/${post.momentId}`} className="mt-3 block border border-border bg-surface2 p-3 font-mono text-bodysm text-leaf">✦ Watch linked Moment →</Link>}
        {reference && <div className="mt-3 border border-border bg-surface2 p-3"><p className="font-semibold text-text">{reference.author.displayName} <span className="font-mono text-micro text-text-muted">@{reference.author.handle}</span></p><p className="mt-1 line-clamp-3 text-bodysm text-text-secondary">{reference.body || "Reshared post"}</p></div>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <button className={action} onClick={() => void showReplies()}>Reply · {post.replies}</button>
          <button className={action} disabled={pending} onClick={() => void repost()}>Reshare · {post.reposts}</button>
          <button className={action} onClick={() => setExpanded(expanded === "quote" ? null : "quote")}>Quote</button>
          <button className={`${action} ${liked ? "text-leaf" : ""}`} disabled={pending} aria-pressed={liked} onClick={() => void toggleLike()}>♥ {likes}</button>
          <span className="font-mono text-micro text-text-muted">Views · {post.views}</span>
          {user?.id === post.author.id
            ? <button className={`${action} text-error`} disabled={pending} onClick={() => void deletePost()}>Delete</button>
            : <button className={action} onClick={() => void report()}>Report</button>}
        </div>
        {expanded && <div className="mt-3 space-y-2"><label htmlFor={`${expanded}-${post.id}`} className="font-mono text-micro uppercase text-text-secondary">{expanded === "reply" ? "Your reply" : "Your quote"}</label><textarea id={`${expanded}-${post.id}`} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2800} className="min-h-20 w-full border border-border bg-surface2 p-3 text-body text-text" /><div className="flex gap-2"><button className="bg-brand px-4 py-2 font-mono text-micro uppercase text-white disabled:opacity-40" disabled={pending || !draft.trim()} onClick={() => void submit()}>Publish</button><button className={action} onClick={() => setExpanded(null)}>Cancel</button></div></div>}
        {replies && <div className="mt-4 space-y-3 border-l border-border pl-3"><button className={action} onClick={() => setExpanded("reply")}>Write a reply</button>{replies.length === 0 ? <p className="text-bodysm text-text-muted">No replies yet.</p> : replies.map((reply) => <div key={reply.id} className="border-t border-border pt-2"><p className="text-bodysm font-semibold">{reply.author.displayName} <span className="font-mono text-micro text-text-muted">@{reply.author.handle}</span></p><p className="mt-1 whitespace-pre-wrap text-bodysm text-text-secondary">{reply.body}</p></div>)}</div>}
        {error && <p role="alert" className={`mt-3 text-bodysm ${error.startsWith("Report sent") ? "text-success" : "text-error"}`}>{error}</p>}
      </div>
    </div>
  </article>;
}

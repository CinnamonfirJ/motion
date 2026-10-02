import { useRef, useState } from "react";
import { api, type MomentDTO, type StreamDTO } from "../lib/api";
import { Avatar } from "./ui";

export function PostComposer({ user, communityId, streams, moments, onPublished }: {
  user: { displayName: string; avatarUrl: string | null };
  communityId?: string;
  streams: StreamDTO[];
  moments: MomentDTO[];
  onPublished: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploadedIds, setUploadedIds] = useState<string[]>([]);
  const [embed, setEmbed] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chooseFiles = (selected: FileList | null) => {
    if (!selected) return;
    const next = Array.from(selected);
    if (next.length > 4 || (next.some((file) => file.type.startsWith("video/")) && next.length > 1)) {
      setError("Choose up to four images or one video."); return;
    }
    setFiles(next); setUploadedIds([]); setError(null);
  };

  const publish = async () => {
    if (pending || (!text.trim() && !files.length && !linkUrl.trim() && !embed)) return;
    setPending(true); setError(null);
    const ids = [...uploadedIds];
    try {
      for (let index = ids.length; index < files.length; index++) {
        const file = files[index]!;
        if (file.type.startsWith("image/")) {
          // Images relay through our API → R2 (no browser CORS needed).
          const { uploadId } = await api.uploadImageDirect(file);
          ids.push(uploadId);
        } else {
          // Videos stream straight to R2 via a presigned PUT (needs R2 CORS).
          const signed = await api.uploadPostMedia(file.type, file.size);
          const upload = await fetch(signed.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
          if (!upload.ok) throw new Error(`Upload failed (${upload.status}). Check R2 CORS and retry.`);
          ids.push(signed.uploadId);
        }
        setUploadedIds([...ids]);
      }
      await api.createPost({
        text: text.trim(), uploadIds: ids, linkUrl: linkUrl.trim() || undefined, communityId,
        ...(embed.startsWith("stream:") ? { streamId: embed.slice(7) } : embed.startsWith("moment:") ? { momentId: embed.slice(7) } : {}),
      });
      setText(""); setLinkUrl(""); setFiles([]); setUploadedIds([]); setEmbed("");
      if (input.current) input.current.value = "";
      onPublished();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not publish. Your draft is still here."); }
    finally { setPending(false); }
  };

  return <section className="border border-border bg-surface1 p-4" aria-label="Create post">
    <div className="flex gap-3"><Avatar name={user.displayName} url={user.avatarUrl} size={40} /><div className="min-w-0 flex-1"><label htmlFor="post-text" className="font-mono text-micro uppercase tracking-[0.12em] text-text-secondary">{communityId ? "Post to community" : "Share a thought"}</label><textarea id="post-text" value={text} onChange={(event) => setText(event.target.value)} maxLength={2800} placeholder="What's happening?" className="mt-2 min-h-24 w-full resize-y border-0 bg-transparent text-body text-text outline-none placeholder:text-text-muted" /></div></div>
    <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3 sm:flex-row"><input aria-label="Optional HTTPS link" type="url" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="Add a link (optional)" className="min-w-0 flex-1 border border-border bg-surface2 px-3 py-2 text-bodysm text-text" /><select aria-label="Embed a live stream or Moment" value={embed} onChange={(event) => setEmbed(event.target.value)} className="min-w-0 flex-1 border border-border bg-surface2 px-3 py-2 text-bodysm text-text"><option value="">No embed</option>{streams.map((stream) => <option key={stream.id} value={`stream:${stream.id}`}>Live · {stream.title}</option>)}{moments.map((moment) => <option key={moment.id} value={`moment:${moment.id}`}>Moment · {moment.streamTitle}</option>)}</select></div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><label className="cursor-pointer border border-border bg-surface2 px-3 py-2 font-mono text-micro uppercase text-text-secondary hover:text-text">Add images/video<input ref={input} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" multiple className="sr-only" onChange={(event) => chooseFiles(event.target.files)} /></label><button className="bg-brand px-5 py-2 font-mono text-micro uppercase tracking-[0.12em] text-white disabled:opacity-40" disabled={pending || (!text.trim() && !files.length && !linkUrl.trim() && !embed)} onClick={() => void publish()}>{pending ? "Publishing…" : "Post"}</button></div>
    {files.length > 0 && <p className="mt-2 text-bodysm text-text-secondary">{files.map((file) => file.name).join(", ")}</p>}
    {error && <p role="alert" className="mt-2 text-bodysm text-error">{error}</p>}
  </section>;
}

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type CommunityDTO, type FeedItemDTO, type MomentDTO, type StreamDTO } from "../lib/api";
import { realtime } from "../lib/realtime";
import { useSession } from "../state/session";
import { Avatar, EmptyState, LivePill, Pill } from "../components/ui";
import { MomentCard } from "../components/MomentCard";
import { PostCard } from "../components/PostCard";
import { PostComposer } from "../components/PostComposer";

type Tab = "for-you" | "following" | "communities";

function StreamCard({ stream }: { stream: StreamDTO }) {
  return <Link to={`/live/${stream.id}`} className="block border border-border bg-surface1 hover:border-borderStrong">
    <div className="relative aspect-video bg-black">{stream.thumbnailUrl && <img src={stream.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover" />}<div className="absolute left-3 top-3"><LivePill count={stream.viewerCount} /></div></div>
    <div className="flex items-center gap-3 p-3"><Avatar name={stream.creator?.displayName ?? "Host"} url={stream.creator?.avatarUrl} size={36} /><div><p className="font-semibold text-text">{stream.title}</p><p className="text-bodysm text-text-secondary">{stream.creator?.displayName}</p></div></div>
  </Link>;
}

export function Home() {
  const { user } = useSession();
  const [tab, setTab] = useState<Tab>("for-you");
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [communities, setCommunities] = useState<CommunityDTO[]>([]);
  const [member, setMember] = useState(false);
  const [communityName, setCommunityName] = useState("");
  const [communityDescription, setCommunityDescription] = useState("");
  const [communityError, setCommunityError] = useState<string | null>(null);
  const [items, setItems] = useState<FeedItemDTO[] | null>(null);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [streams, setStreams] = useState<StreamDTO[]>([]);
  const [moments, setMoments] = useState<MomentDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const mode = tab === "following" ? "following" : "for-you";
  const selectedCommunity = tab === "communities" ? communityId ?? undefined : undefined;
  const refresh = useCallback(async () => {
    try {
      const [feed, live, recent] = await Promise.all([api.feed(mode, undefined, selectedCommunity), api.streams(), api.moments()]);
      setItems(feed.items); setNextBefore(feed.nextBefore); setStreams(live.streams); setMoments(recent.moments.slice(0, 15)); setError(null);
    } catch { setError("Feed could not refresh. Try again."); }
  }, [mode, selectedCommunity]);

  useEffect(() => {
    setItems(null); setError(null);
    void refresh();
    realtime.connect(); realtime.subscribe("feed");
    const off = realtime.on((event) => { if (event.t === "feed") void refresh(); });
    return () => { off(); realtime.unsubscribe("feed"); };
  }, [refresh]);
  useEffect(() => { void api.communities().then((result) => setCommunities(result.communities)).catch(() => setCommunityError("Could not load communities.")); }, []);
  useEffect(() => {
    if (!communityId) { setMember(false); return; }
    void api.community(communityId).then((result) => setMember(result.community.member)).catch(() => setMember(false));
  }, [communityId]);

  const loadMore = async () => {
    if (!nextBefore || loadingMore) return;
    setLoadingMore(true);
    try {
      const feed = await api.feed(mode, nextBefore, selectedCommunity);
      setItems((current) => [...(current ?? []), ...feed.items.filter((candidate) => !current?.some((item) => `${item.type}:${item.post?.id ?? item.stream?.id ?? item.moment?.id}` === `${candidate.type}:${candidate.post?.id ?? candidate.stream?.id ?? candidate.moment?.id}`))]);
      setNextBefore(feed.nextBefore); setError(null);
    } catch { setError("Could not load more posts. Try again."); }
    finally { setLoadingMore(false); }
  };
  const createCommunity = async () => {
    if (!communityName.trim()) return;
    try {
      const result = await api.createCommunity(communityName.trim(), communityDescription.trim());
      setCommunities((current) => [result.community, ...current]); setCommunityId(result.community.id); setMember(true);
      setCommunityName(""); setCommunityDescription(""); setCommunityError(null);
    } catch (cause) { setCommunityError(cause instanceof Error ? cause.message : "Could not create community."); }
  };
  const toggleMembership = async () => {
    if (!communityId) return;
    try {
      if (member) await api.leaveCommunity(communityId); else await api.joinCommunity(communityId);
      setMember(!member); setCommunityError(null);
    } catch { setCommunityError("Could not update membership. Try again."); }
  };
  const selected = communities.find((community) => community.id === communityId);

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-mono text-micro uppercase tracking-[0.14em] text-leaf">Your world, live</p><h1 className="text-h1 text-text">Feed</h1></div><Link to="/go-live" className="border border-lime px-4 py-2 font-mono text-micro uppercase tracking-[0.1em] text-leaf">Go live</Link></div>
    <nav className="grid grid-cols-3 border border-border bg-surface1" aria-label="Feed tabs">{(["for-you", "following", "communities"] as const).map((item) => <button key={item} aria-current={tab === item ? "page" : undefined} className={`border-r border-border px-2 py-3 font-mono text-micro uppercase tracking-[0.1em] last:border-r-0 ${tab === item ? "bg-surface2 text-leaf" : "text-text-secondary hover:bg-surface2"}`} onClick={() => setTab(item)}>{item === "for-you" ? "For You" : item}</button>)}</nav>
    {tab === "communities" && <section className="space-y-3 border border-border bg-surface1 p-4"><div className="flex flex-wrap gap-2"><button className={`border px-3 py-2 font-mono text-micro uppercase ${!communityId ? "border-lime text-leaf" : "border-border text-text-secondary"}`} onClick={() => setCommunityId(null)}>Discover</button>{communities.map((community) => <button key={community.id} className={`border px-3 py-2 font-mono text-micro uppercase ${communityId === community.id ? "border-lime text-leaf" : "border-border text-text-secondary"}`} onClick={() => setCommunityId(community.id)}>{community.name}</button>)}</div>
      {selected ? <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-h3">{selected.name}</h2><p className="text-bodysm text-text-secondary">{selected.description} · {selected.memberCount} members</p></div><button className="border border-border bg-surface2 px-3 py-2 font-mono text-micro uppercase text-text" onClick={() => void toggleMembership()}>{member ? "Leave" : "Join"}</button></div> : <div className="space-y-3"><p className="text-bodysm text-text-secondary">Public communities are open to discover. Join one to post there.</p><div className="flex flex-col gap-2 sm:flex-row"><input aria-label="New community name" value={communityName} onChange={(event) => setCommunityName(event.target.value)} placeholder="Community name" className="min-w-0 flex-1 border border-border bg-surface2 px-3 py-2 text-body text-text" /><input aria-label="Community description" value={communityDescription} onChange={(event) => setCommunityDescription(event.target.value)} placeholder="Description" className="min-w-0 flex-1 border border-border bg-surface2 px-3 py-2 text-body text-text" /><button className="bg-brand px-4 py-2 font-mono text-micro uppercase text-white" onClick={() => void createCommunity()}>Create</button></div></div>}
      {communityError && <p role="alert" className="text-bodysm text-error">{communityError}</p>}
    </section>}
    {user && (tab !== "communities" || (communityId && member)) && <PostComposer user={user} communityId={selectedCommunity} streams={streams} moments={moments} onPublished={() => void refresh()} />}
    {error && <div role="alert" className="border border-error bg-surface1 p-3 text-bodysm text-error">{error} <button className="ml-2 underline" onClick={() => void refresh()}>Retry</button></div>}
    {items === null ? <div className="border border-border bg-surface1 p-8 text-center text-text-secondary">Loading feed…</div> : items.length === 0 ? <EmptyState title={tab === "following" ? "Your Following feed is quiet." : tab === "communities" ? "No posts here yet." : "Your feed is just getting started."} body={tab === "following" ? "Follow people to see their posts, live streams, and Moments here." : "Start a conversation or come back when something goes live."} /> : <div className="space-y-4">{items.map((item) => item.type === "post" && item.post ? <PostCard key={`post:${item.post.id}`} post={item.post} onChanged={() => void refresh()} /> : item.type === "stream" && item.stream ? <StreamCard key={`stream:${item.stream.id}`} stream={item.stream} /> : item.type === "moment" && item.moment ? <MomentCard key={`moment:${item.moment.id}`} moment={item.moment} /> : null)}</div>}
    {nextBefore && <button className="w-full border border-border bg-surface1 px-4 py-3 font-mono text-micro uppercase text-text-secondary hover:text-text disabled:opacity-40" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Loading…" : "Load more"}</button>}
    {tab === "for-you" && <div className="flex items-center justify-center gap-2 pt-2"><Pill tone="lime">Live + posts + Moments</Pill></div>}
  </div>;
}

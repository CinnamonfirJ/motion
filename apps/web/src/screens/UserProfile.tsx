import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, type CreatorMini, type PostDTO } from "../lib/api";
import { useSession } from "../state/session";
import { Avatar, EmptyState } from "../components/ui";
import { PostCard } from "../components/PostCard";

export function UserProfile() {
  const { id = "" } = useParams();
  const { user: me } = useSession();
  const [user, setUser] = useState<CreatorMini | null>(null);
  const [stats, setStats] = useState<{ followers: number; following: number; posts: number; followedByMe: boolean } | null>(null);
  const [posts, setPosts] = useState<PostDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const refresh = async () => {
    try {
      const [profile, social, feed] = await Promise.all([api.publicUser(id), api.userSocial(id), api.userPosts(id)]);
      setUser(profile.user); setStats(social); setPosts(feed.posts); setError(null);
    } catch { setError("Could not load this profile."); }
  };
  useEffect(() => { setUser(null); setPosts(null); void refresh(); }, [id]);
  const toggleFollow = async () => {
    if (!stats || pending) return;
    setPending(true);
    try { if (stats.followedByMe) await api.unfollow(id); else await api.follow(id); await refresh(); }
    catch { setError("Could not update follow. Try again."); }
    finally { setPending(false); }
  };

  if (error && !user) return <div role="alert" className="border border-error bg-surface1 p-5 text-error">{error} <button onClick={() => void refresh()} className="ml-2 underline">Retry</button></div>;
  if (!user || !stats || !posts) return <div className="border border-border bg-surface1 p-8 text-center text-text-secondary">Loading profile…</div>;
  return <div className="space-y-5"><header className="border border-border bg-surface1 p-5"><div className="flex flex-wrap items-center gap-4"><Avatar name={user.displayName} url={user.avatarUrl} size={72} /><div className="min-w-0 flex-1"><h1 className="text-h2 text-text">{user.displayName}</h1><p className="font-mono text-bodysm text-text-muted">@{user.handle}</p></div>{me?.id !== id && <button className="bg-brand px-5 py-2 font-mono text-micro uppercase text-white disabled:opacity-40" disabled={pending} onClick={() => void toggleFollow()}>{stats.followedByMe ? "Following ✓" : "Follow"}</button>}</div><div className="mt-5 flex flex-wrap gap-5 border-t border-border pt-4 font-mono text-micro uppercase text-text-secondary"><span>{stats.posts} posts</span><span>{stats.followers} followers</span><span>{stats.following} following</span></div></header>{error && <p role="alert" className="text-bodysm text-error">{error}</p>}{posts.length ? posts.map((post) => <PostCard key={post.id} post={post} onChanged={() => void refresh()} />) : <EmptyState title="No posts yet." body="When this person posts, it will appear here." />}</div>;
}

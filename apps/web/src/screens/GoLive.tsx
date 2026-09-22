import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Button, Card } from "../components/ui";

export function GoLive() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.createStream(title.trim());
      navigate(`/live/${result.stream.id}`, { replace: true });
    } catch {
      setError("ENNOIA could not start the LiveKit room or permanent recording. Check the service configuration and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mx-auto max-w-xl p-6">
      <form onSubmit={start} className="space-y-5">
        <div>
          <h1 className="text-h2">Go live</h1>
          <p className="mt-2 text-body text-text-secondary">Your camera and microphone begin after the room and R2 recording are ready.</p>
        </div>
        <label className="block">
          <span className="eyebrow text-micro text-text-muted">Stream title</span>
          <input autoFocus maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 min-h-12 w-full border border-border bg-surface2 px-4 text-body text-text outline-none focus:border-lime" placeholder="What are you streaming?" />
        </label>
        {error && <p role="alert" className="text-bodysm text-error">{error}</p>}
        <Button type="submit" disabled={busy || !title.trim()} className="w-full">{busy ? "Starting secure room…" : "Go live"}</Button>
      </form>
    </Card>
  );
}

import { Link } from "react-router-dom";

export function Legal({ kind }: { kind: "privacy" | "terms" }) {
  return (
    <main className="min-h-screen bg-night px-5 py-10 text-text">
      <article className="mx-auto max-w-2xl space-y-6">
        <Link to="/" className="font-mono text-label uppercase tracking-[0.1em] text-electric">← ENNOIA</Link>
        <h1 className="text-h1">{kind === "privacy" ? "Privacy notice" : "Terms of use"}</h1>
        <p className="text-bodysm text-text-muted">Effective September 22, 2026</p>
        {kind === "privacy" ? <Privacy /> : <Terms />}
      </article>
    </main>
  );
}

function Section({ title, children }: React.PropsWithChildren<{ title: string }>) {
  return <section className="space-y-2"><h2 className="text-h3">{title}</h2><div className="space-y-2 text-body text-text-secondary">{children}</div></section>;
}

function Privacy() {
  return <>
    <Section title="What ENNOIA processes"><p>We process your Privy account identifier, public wallet address, profile details, streams, reactions, clips, reports, blocks, and service diagnostics needed to operate and secure ENNOIA. Camera and microphone media is sent only when you host a live stream.</p></Section>
    <Section title="Where data goes"><p>Privy provides authentication and embedded wallets; LiveKit carries live audio/video; Cloudflare R2 stores recordings and clips; Neon stores application records; Monad records public transactions; Envio indexes public Monad events; and the configured hosting providers serve the app.</p></Section>
    <Section title="Public blockchain data"><p>Monad transactions and wallet addresses are public and cannot be deleted by ENNOIA. Do not include private information in transaction data.</p></Section>
    <Section title="Retention and control"><p>You can report or block users and delete your account in Profile. Deletion removes the Privy login and anonymizes offchain activity that must remain linked to streams, reactions, or rewards. Security, fraud, and legal records may be retained when necessary.</p></Section>
    <Section title="Contact"><p>Before launch, replace this paragraph with the project team's monitored privacy email and jurisdiction-specific contact details.</p></Section>
  </>;
}

function Terms() {
  return <>
    <Section title="Using ENNOIA"><p>You must be legally able to use the service and follow applicable law. Do not stream unlawful, abusive, infringing, deceptive, dangerous, or privacy-invasive content, manipulate reactions, evade blocks, or interfere with the service.</p></Section>
    <Section title="Streams and Moments"><p>You retain rights you hold in your content and grant ENNOIA permission to transmit, store, display, and create Moment clips solely to operate and promote the service. You are responsible for having rights to everything you stream.</p></Section>
    <Section title="Testnet assets"><p>The exhibition uses Monad testnet. Testnet MON and displayed rewards have no promised monetary value, may reset, and are not an investment or guaranteed payment.</p></Section>
    <Section title="Moderation"><p>ENNOIA may remove content, restrict accounts, or preserve evidence to protect users and the service. Reports are reviewed by the project administrators configured for the deployment.</p></Section>
    <Section title="Launch review"><p>These are project terms, not legal advice. The team should have counsel review them and add its legal name, contact address, governing law, age policy, and required regional disclosures before a public commercial launch.</p></Section>
  </>;
}

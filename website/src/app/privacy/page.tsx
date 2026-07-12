import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How FilDOS handles your data. The app is fully on-device, your files, embeddings, and chats never leave your machine. The website uses privacy-friendly, cookieless analytics only.",
  alternates: { canonical: "/privacy" },
};

const CONTACT_EMAIL = "ahmed.fahim0207@gmail.com";
const GITHUB_URL = "https://github.com/ahmedfahim21/FilDOS";

export default function PrivacyPage() {
  return (
    <LegalPage eyebrow="Legal" title="Privacy Policy" updated="12 July 2026">
      <p>
        FilDOS is built privacy-first. This policy explains what happens to your data across two
        separate things: the <strong>FilDOS desktop app</strong> and the{" "}
        <strong>fildos website</strong>. In short, the app runs on your own device and sends
        us nothing (the only exception is any cloud storage you choose to connect, which talks
        directly to that provider, not to us), and the website uses only cookieless, privacy-friendly
        analytics.
      </p>

      <h2>The FilDOS app is fully on-device</h2>
      <p>
        FilDOS is a local file browser. Everything it does with your files happens on your own
        machine:
      </p>
      <ul>
        <li>
          <strong>Your files never leave your device.</strong> Browsing, search, tags, and organisation
          all operate on your local filesystem.
        </li>
        <li>
          <strong>AI runs locally.</strong> Semantic search embeddings, the knowledge-graph analysis,
          and the assistant chat are all computed on-device using models that run on your own hardware.
          Your file contents, search queries, and chat conversations are not transmitted to us or any
          third party.
        </li>
        <li>
          <strong>Your data stays on your disk.</strong> The search index, embeddings, chat history,
          tags, and preferences are stored locally in the app&rsquo;s data directory on your computer.
        </li>
        <li>
          <strong>No account, no tracking, no telemetry.</strong> The app does not require you to sign
          in and does not send usage analytics or telemetry back to us.
        </li>
      </ul>

      <h2>Model downloads</h2>
      <p>
        When you enable AI features, FilDOS downloads open-source model weights so they can run
        locally. These are fetched directly from their hosting provider (such as Hugging Face) to your
        machine. Those requests are made by your device to that provider and are subject to the
        provider&rsquo;s own privacy policy. We do not receive the contents of, or metadata about,
        these downloads. Once downloaded, models run entirely offline.
      </p>

      <h2>Connecting cloud services</h2>
      <p>
        FilDOS can <strong>optionally</strong> connect to third-party cloud storage such as Google
        Drive, Dropbox, etc, so you can browse and search those
        files alongside your local ones. This is entirely opt-in; if you never connect an account,
        none of this applies to you.
      </p>
      <p>When you do connect a cloud account, here is exactly what happens:</p>
      <ul>
        <li>
          <strong>Authorisation is direct between you and the provider.</strong> Sign-in uses a standard
          OAuth flow that opens in your browser and exchanges tokens directly between your device and the
          provider (for example, Google or Dropbox). Your credentials and access tokens do not pass
          through, and are never seen by, any FilDOS server.
        </li>
        <li>
          <strong>Credentials are stored locally and encrypted.</strong> The access tokens (or, for
          object-storage backends, the keys you enter) are stored on your own device and encrypted at
          rest using your operating system&rsquo;s secure keychain.
        </li>
        <li>
          <strong>File access is device-to-provider.</strong> When you browse, open, search, or move a
          remote file, FilDOS talks to that provider directly from your device. We do not proxy,
          intercept, or store your cloud files.
        </li>
        <li>
          <strong>You stay in control.</strong> Disconnecting an account from FilDOS deletes its stored
          credentials from your device. You should also revoke FilDOS&rsquo;s access in the
          provider&rsquo;s own security settings if you want to fully sever the connection.
        </li>
      </ul>
      <p>
        Your use of each connected service remains subject to that provider&rsquo;s own terms and
        privacy policy.
      </p>

      <h2>The website</h2>
      <p>
        The fildos website is intentionally minimal about data:
      </p>
      <ul>
        <li>
          <strong>Cookieless analytics.</strong> We use Vercel Web Analytics to understand aggregate
          traffic (page views, referrers, country, device type). It is privacy-friendly by design: it
          sets <strong>no cookies</strong>, does not track you across other websites, and does not build
          a persistent profile of you. Because of this, the site does not need a cookie-consent banner.
        </li>
        <li>
          <strong>Self-hosted fonts.</strong> Fonts are served from our own domain, so visiting the site
          does not leak your visit to a font provider.
        </li>
        <li>
          <strong>Strictly-necessary infrastructure.</strong> Our hosting provider may set essential
          cookies required for security and to serve the site. These are not used to track you.
        </li>
      </ul>
      <p>
        We do not sell your data, and we do not use advertising or cross-site tracking anywhere.
      </p>

      <h2>Links to other services</h2>
      <p>
        The site and app link out to third-party services such as GitHub, Discord, Hugging Face, and
        our documentation. Once you follow those links, the destination&rsquo;s own privacy policy
        applies.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        We may update this policy as FilDOS evolves. When we do, we&rsquo;ll revise the &ldquo;Last
        updated&rdquo; date above. Because FilDOS is open source, the full history of changes is
        visible in our{" "}
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
          repository
        </a>
        .
      </p>

      <h2>Contact</h2>
      <p>
        Questions about privacy? Reach us at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> or open an issue on{" "}
        <a href={`${GITHUB_URL}/issues`} target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
        .
      </p>
    </LegalPage>
  );
}

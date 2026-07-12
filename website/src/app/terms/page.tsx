import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description:
    "The terms that govern your use of the FilDOS app and the fildos website. FilDOS is free, open-source software provided as-is.",
  alternates: { canonical: "/terms" },
};

const CONTACT_EMAIL = "ahmed.fahim0207@gmail.com";
const GITHUB_URL = "https://github.com/ahmedfahim21/FilDOS";
const LICENSE_URL = "https://github.com/ahmedfahim21/FilDOS/blob/main/LICENSE";

export default function TermsPage() {
  return (
    <LegalPage eyebrow="Legal" title="Terms &amp; Conditions" updated="12 July 2026">
      <p>
        These terms govern your use of the <strong>FilDOS desktop app</strong> and the{" "}
        <strong>fildos website</strong> (together, &ldquo;FilDOS&rdquo;). By downloading,
        installing, or using FilDOS, you agree to these terms. If you don&rsquo;t agree, please
        don&rsquo;t use it.
      </p>

      <h2>FilDOS is free and open source</h2>
      <p>
        FilDOS is free, open-source software. The source code is released under the{" "}
        <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer">
          MIT License
        </a>
        , which governs your rights to use, copy, modify, and distribute the code. These Terms cover
        your use of the distributed application and the website; the MIT License covers reuse of the
        source. Where they overlap, the MIT License controls for the source code itself.
      </p>

      <h2>Provided &ldquo;as is&rdquo;</h2>
      <p>
        FilDOS is provided <strong>&ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without
        warranty of any kind</strong>, express or implied, including but not limited to warranties of
        merchantability, fitness for a particular purpose, and non-infringement. You use FilDOS at your
        own risk.
      </p>
      <p>
        FilDOS reads, writes, moves, and deletes files on your device. You are responsible for keeping
        backups of anything important. Deletions are sent to your operating system&rsquo;s Trash / Recycle
        Bin where possible, but we cannot guarantee recovery of any data.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, the authors and contributors of FilDOS shall not be
        liable for any direct, indirect, incidental, special, or consequential damages including loss
        of data, files, or profits arising out of or in connection with your use of, or inability to
        use, FilDOS.
      </p>

      <h2>Your responsibilities</h2>
      <ul>
        <li>You will use FilDOS in compliance with all applicable laws.</li>
        <li>
          You will only point FilDOS at files and folders you are authorised to access and process.
        </li>
        <li>
          You are responsible for the AI models you choose to download and run, and for how you use
          their output.
        </li>
      </ul>

      <h2>AI features</h2>
      <p>
        FilDOS can run on-device AI models to search, summarise, and chat about your files. AI output
        can be inaccurate or incomplete and should not be relied upon as professional advice. You are
        responsible for reviewing any actions the assistant takes on your files; file-modifying actions
        are designed to be recoverable (for example, deletions go to the OS Trash), but you should still
        keep backups.
      </p>

      <h2>Connecting cloud services</h2>
      <p>
        FilDOS lets you optionally connect third-party cloud storage such as Google Drive, Dropbox,
        etc. to browse and search those files alongside your local
        ones. By connecting an account, you represent that you are authorised to access it and you
        authorise FilDOS to access, read, and (where you request it) modify files in that account on
        your behalf.
      </p>
      <ul>
        <li>
          Your use of each connected service is governed by that provider&rsquo;s own terms and
          policies, which are separate from these Terms.
        </li>
        <li>
          Authorisation happens directly between your device and the provider, and your credentials are
          stored locally on your device; they are not sent to us.
        </li>
        <li>
          You are responsible for your cloud accounts, their contents, and any charges or limits the
          provider applies. You can disconnect an account at any time and should revoke access in the
          provider&rsquo;s settings to fully sever it.
        </li>
        <li>
          We are not responsible for the availability, accuracy, or loss of data held by third-party
          providers.
        </li>
      </ul>

      <h2>Other third-party services</h2>
      <p>
        FilDOS also links to and downloads from third-party services (such as GitHub and Hugging Face).
        Your use of those services is governed by their own terms and policies, not these.
      </p>

      <h2>Changes to these terms</h2>
      <p>
        We may update these terms as FilDOS evolves. When we do, we&rsquo;ll revise the &ldquo;Last
        updated&rdquo; date above. Continued use of FilDOS after a change means you accept the updated
        terms.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms? Reach us at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> or open an issue on{" "}
        <a href={`${GITHUB_URL}/issues`} target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
        .
      </p>
    </LegalPage>
  );
}

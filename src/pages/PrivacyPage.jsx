import { Link } from 'react-router-dom'

/**
 * Minimal privacy policy for client-view analytics (Phase 3 / POL-01).
 */
export default function PrivacyPage() {
  return (
    <div className="min-h-screen w-full bg-[#0a0a0c] text-white/85 px-5 py-12 pb-24">
      <div className="max-w-xl mx-auto space-y-8">
        <header className="space-y-2 border-b border-white/10 pb-6">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">TOO:AWAKE</p>
          <h1
            className="text-2xl font-semibold text-white tracking-tight"
            style={{ fontFamily: "'Chakra Petch', sans-serif" }}
          >
            Privacy &amp; analytics
          </h1>
          <p className="text-sm text-white/50">Last updated April 2026</p>
        </header>

        <section className="space-y-3 text-sm leading-relaxed text-white/70">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-white/45">What we collect</h2>
          <p>
            On shared client view links (<code className="text-violet-300/90 text-[13px]">/view/…</code>), we may
            record: a pseudonymous session identifier (stored in your browser&apos;s{' '}
            <strong className="text-white/80">sessionStorage</strong> only, not in cookies), device type and
            operating system family, screen size, session duration, which clips were played and for how long, and
            coarse interaction events (for example camera preset changes and when a screenshot is taken).
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-white/70">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-white/45">Why</h2>
          <p>
            This information is used only to help project owners understand how presentations are experienced. It is
            not used for advertising profiles.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-white/70">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-white/45">Who can see it</h2>
          <p>
            Access to raw analytics is limited to authenticated administrators of the TOO:AWAKE Stage Visualizer
            tooling for your project.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-white/70">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-white/45">Retention</h2>
          <p>
            We aim to delete analytics rows that are older than <strong className="text-white/80">90 days</strong>{' '}
            on a scheduled basis. Exact timing depends on hosting and database configuration.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-white/70">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-white/45">Cookies</h2>
          <p>We do not set analytics cookies for this product. Session identifiers use sessionStorage in the tab.</p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-white/70">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-white/45">Your rights</h2>
          <p>
            To request deletion of analytics associated with a visit or project, contact your project administrator or
            email{' '}
            <a
              href="mailto:hello@tooawake.online"
              className="text-violet-300 hover:text-violet-200 underline underline-offset-2"
            >
              hello@tooawake.online
            </a>
            . We will respond as soon as reasonably practical.
          </p>
        </section>

        <p className="pt-4">
          <Link
            to="/"
            className="text-sm text-violet-400 hover:text-violet-300 underline underline-offset-2"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}

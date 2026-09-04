// The interview screen. Auth lands next; until then the user is named
// explicitly so the voice path can be walked end to end.

import Recorder from "./Recorder";

export const metadata = { title: "Sofar — Interview" };

export default async function InterviewPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string }>;
}) {
  const { user } = await searchParams;

  if (!user) {
    return (
      <main style={{ maxWidth: "34rem", margin: "0 auto", padding: "80px 24px" }}>
        <h1
          style={{
            fontFamily: "var(--font-book)",
            fontWeight: 400,
            fontSize: "31px",
            margin: "0 0 16px",
          }}
        >
          Sofar
        </h1>
        <p style={{ fontFamily: "var(--font-book)", fontSize: "19px", lineHeight: 1.55 }}>
          Sign-in arrives with the next milestone. To walk the interview now,
          open this page with <code>?user=&lt;id&gt;</code>.
        </p>
      </main>
    );
  }

  return (
    <main>
      <Recorder userId={user} />
    </main>
  );
}

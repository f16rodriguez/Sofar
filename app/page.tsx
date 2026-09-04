import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";

export default async function Home() {
  if (await currentUser()) redirect("/interview");

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
      }}
    >
      <div style={{ maxWidth: "30rem" }}>
        <h1
          style={{
            fontFamily: "var(--font-book)",
            fontWeight: 400,
            fontSize: "clamp(30px, 6vw, 44px)",
            lineHeight: 1.12,
            letterSpacing: "-.015em",
            margin: 0,
          }}
        >
          You&rsquo;re the only one who was there for all of it.
        </h1>
        <p
          style={{
            fontFamily: "var(--font-book)",
            fontSize: 19,
            lineHeight: 1.55,
            color: "#3d3932",
            margin: "20px 0 28px",
          }}
        >
          Twenty minutes of questions, and the first chapters of your own book —
          written from what you say, about your life as it is right now.
        </p>
        <Link
          href="/signin"
          style={{
            display: "inline-block",
            fontFamily: "var(--font-chrome)",
            fontSize: 16,
            fontWeight: 500,
            background: "#7a2e2a",
            color: "#f4eee2",
            padding: "16px 26px",
            borderRadius: 4,
            textDecoration: "none",
          }}
        >
          Start the interview
        </Link>
      </div>
    </main>
  );
}

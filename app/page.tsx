export default function Home() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <h1
          style={{
            fontFamily: "var(--font-book)",
            fontWeight: 400,
            fontSize: "2.5rem",
            margin: 0,
          }}
        >
          Sofar
        </h1>
        <p style={{ opacity: 0.6, marginTop: "0.5rem" }}>
          A living autobiography.
        </p>
      </div>
    </main>
  );
}

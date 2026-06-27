export function Gloss() {
  return (
    <>
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: "8%",
          left: "16%",
          right: "26%",
          height: "26%",
          background:
            "radial-gradient(100% 100% at 50% 0%, rgba(255,255,255,0.7), rgba(255,255,255,0) 74%)",
          borderRadius: "50%",
          filter: "blur(1px)",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />
    </>
  );
}

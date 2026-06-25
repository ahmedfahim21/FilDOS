import { ImageResponse } from "next/og";

export const alt = "FilDOS — The open-source, AI-native file explorer";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// 3×3 node grid echoing the brand mark — ghost nodes (bottom-right) dimmed.
const NODES: [number, number, boolean][] = [
  [0, 0, false], [1, 0, false], [2, 0, false],
  [0, 1, false], [1, 1, false], [2, 1, true],
  [0, 2, false], [1, 2, true], [2, 2, true],
];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          backgroundColor: "#0c1322",
          backgroundImage:
            "radial-gradient(900px 500px at 78% 18%, rgba(2,149,246,0.30), transparent 60%)",
          color: "#eef2fb",
          fontFamily: "sans-serif",
        }}
      >
        {/* Top: mark + wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: "28px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {[0, 1, 2].map((r) => (
              <div key={r} style={{ display: "flex", gap: "10px" }}>
                {[0, 1, 2].map((c) => {
                  const ghost = NODES.find((n) => n[0] === c && n[1] === r)?.[2];
                  return (
                    <div
                      key={c}
                      style={{
                        width: "22px",
                        height: "22px",
                        borderRadius: "50%",
                        backgroundColor: "#0295f6",
                        opacity: ghost ? 0.25 : 1,
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", fontSize: "44px", letterSpacing: "-0.02em" }}>
            <span style={{ fontWeight: 300 }}>Fil</span>
            <span style={{ color: "#0295f6", fontWeight: 600 }}>DOS</span>
          </div>
        </div>

        {/* Headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div
            style={{
              display: "flex",
              fontSize: "76px",
              fontWeight: 600,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              maxWidth: "900px",
            }}
          >
            Find any file by describing it.
          </div>
          <div style={{ display: "flex", fontSize: "30px", color: "#8c97b6", maxWidth: "820px" }}>
            The open-source, AI-native file explorer for macOS, Windows &amp; Linux.
          </div>
        </div>

        {/* Footer line */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            fontSize: "24px",
            color: "#8c97b6",
            fontFamily: "monospace",
          }}
        >
          <span style={{ color: "#0295f6" }}>$</span>
          <span>open source · search by meaning · local-first</span>
        </div>
      </div>
    ),
    { ...size },
  );
}

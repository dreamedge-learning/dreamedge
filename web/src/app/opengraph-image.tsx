import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brand tokens, kept in sync with globals.css.
const ORANGE = "#F26A21";
const DARK_BLUE = "#16223B";
const GOLDEN = "#C9A84C";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: DARK_BLUE,
          padding: "80px",
          position: "relative",
        }}
      >
        {/* Orange accent rule, not an orange field — matches brand usage. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "12px",
            background: ORANGE,
            display: "flex",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "84px",
              height: "84px",
              borderRadius: "20px",
              background: ORANGE,
              color: "#FFFFFF",
              fontSize: "40px",
              fontWeight: 700,
            }}
          >
            DE
          </div>
          <div
            style={{
              display: "flex",
              color: "#FFFFFF",
              fontSize: "34px",
              fontWeight: 600,
              letterSpacing: "-0.5px",
            }}
          >
            {SITE_NAME}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: "44px",
            color: "#FFFFFF",
            fontSize: "68px",
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: "-2px",
            maxWidth: "900px",
          }}
        >
          Strong foundations for Classes 6&ndash;10
        </div>

        <div
          style={{
            display: "flex",
            marginTop: "28px",
            color: GOLDEN,
            fontSize: "32px",
            fontWeight: 500,
          }}
        >
          Concept-based learning &middot; Live classes &middot; Test series
        </div>

        <div
          style={{
            display: "flex",
            marginTop: "52px",
            color: "rgba(255,255,255,0.65)",
            fontSize: "26px",
          }}
        >
          Taught by IITian mentors &middot; CBSE &amp; State Board
        </div>
      </div>
    ),
    size
  );
}

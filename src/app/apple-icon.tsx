import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon: the gold meeple on felt, full bleed (iOS rounds the corners itself). */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#1e4a3b" }}>
        <svg width="132" height="132" viewBox="0 0 24 24">
          <path
            fill="#e3b23c"
            d="M12 2.5a3.2 3.2 0 0 1 3.2 3.2c0 1-.4 1.8-1 2.4 2.9.4 7.3 1.6 7.3 3.6 0 1.2-1.6 1.6-3.6 1.4l2.6 6.4c.3.8-.2 1.5-1 1.5h-4.2L12 15.6 9.7 21H5.5c-.8 0-1.3-.7-1-1.5l2.6-6.4c-2 .2-3.6-.2-3.6-1.4 0-2 4.4-3.2 7.3-3.6-.6-.6-1-1.4-1-2.4A3.2 3.2 0 0 1 12 2.5Z"
          />
        </svg>
      </div>
    ),
    size,
  );
}

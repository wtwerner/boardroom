import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/config";
import { loadSettings } from "@/lib/settings-store";

export const alt = "The group's site, with a row of meeples";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const MEEPLE =
  "M12 2c2.486 0 3.713 1.766 3.955 4.1l.01.124l.129.036c3.17.928 5.754 2.487 5.9 4.556L22 11c0 1.427-1.297 2.322-2.871 2.733l-.201.049l.026.03c.244.276.532.603.7.797l.057.066c.49.573.884 1.073 1.216 1.56C21.617 17.245 22 18.139 22 19a2 2 0 0 1-2 2h-5c-1.043 0-1.344-.453-2.394-2.553c-.29-.58-.448-.882-.593-1.118L12 17.307l-.013.022c-.129.21-.268.472-.5.935l-.093.183C10.344 20.547 10.043 21 9 21H4a2 2 0 0 1-2-2c0-.86.384-1.755 1.073-2.765a18 18 0 0 1 1.216-1.56c.152-.178.482-.553.757-.863l.025-.03l-.2-.049c-1.506-.393-2.758-1.23-2.864-2.55L2 11c0-2.16 2.643-3.785 5.906-4.74l.128-.036l.011-.124c.235-2.26 1.394-3.99 3.726-4.095z";

/**
 * Archivo as the site sets it: wide and heavy for the name, regular for the line under it. The
 * image renderer can't use the variable font next/font serves, so it takes Google's static cuts,
 * and falls back to its own font if they can't be fetched.
 */
async function archivo() {
  try {
    const css = await (await fetch("https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100,400;125,800")).text();
    const faces = [...css.matchAll(/font-weight: (\d+);[\s\S]*?url\((\S+?\.ttf)\)/g)];
    return await Promise.all(
      faces.map(async ([, weight, url]) => ({
        name: "Archivo",
        data: await (await fetch(url)).arrayBuffer(),
        weight: Number(weight) as 400 | 800,
        style: "normal" as const,
      })),
    );
  } catch (err) {
    console.error("Couldn't fetch Archivo for the link preview", err);
    return [];
  }
}

// The image is drawn per request, so the fonts are fetched once per server and kept
let fetched: Awaited<ReturnType<typeof archivo>> | undefined;

/** The preview a link to the site shows in Discord, Slack and the like: the sign-in page's meeples and name */
export default async function OpenGraphImage() {
  await loadSettings();
  const fonts = fetched ?? (await archivo());
  if (fonts.length) fetched = fonts;
  const meeples = ["#d33f49", "#2f6fb3", "#e3b23c", "#3e9a5b", "#7a52a3"];
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#1e4a3b",
          color: "#f1f5f2",
          fontFamily: fonts.length ? "Archivo" : undefined,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-end", gap: 14, marginBottom: 40 }}>
          {meeples.map((fill, i) => (
            <svg key={fill} width={i === 2 ? 120 : 96} height={i === 2 ? 120 : 96} viewBox="0 0 24 24" style={{ marginBottom: i === 2 ? 12 : 0 }}>
              <path fill={fill} d={MEEPLE} />
            </svg>
          ))}
        </div>
        {/* A longer name gets smaller, and wraps if it has to */}
        <div style={{ fontSize: SITE_NAME.length > 12 ? 72 : 104, fontWeight: 800, maxWidth: 1080, textAlign: "center", lineHeight: 1.05 }}>
          {SITE_NAME}
        </div>
        <div style={{ fontSize: 38, fontWeight: 400, marginTop: 20, opacity: 0.75 }}>What our group plays, loves, and should play next.</div>
      </div>
    ),
    { ...size, fonts },
  );
}

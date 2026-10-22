import { getStore } from "@netlify/blobs";

const store = getStore("wefindit-ratelimit");
const WINDOW = 60 * 1000;
const LIMITS = { search: 10, auth: 5, capture: 3 };

export async function checkRate(ip, action) {
  const key = `${action}:${ip}`;
  const now = Date.now();
  const data = (await store.get(key, { type: "json" })) || { count: 0, start: now };
  if (now - data.start > WINDOW) {
    data.count = 1;
    data.start = now;
  } else {
    data.count += 1;
  }
  await store.setJSON(key, data);
  const limit = LIMITS[action] || 10;
  return data.count <= limit;
}

export function getIP(req) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("client-ip") || "unknown";
}

import { getStore } from "@netlify/blobs";

const store = getStore("wefindit-users");

async function hash(pw) {
  const data = new TextEncoder().encode(pw + "wefindit-salt-v1");
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function validEmail(e) {
  return typeof e === "string" && e.length < 200 && e.includes("@") && e.includes(".");
}
function validRoute(r) {
  if (!r || typeof r !== "object") return false;
  const code = /^[A-Z]{3}$/;
  return code.test(r.from) && code.test(r.to) && /^\d{4}-\d{2}-\d{2}$/.test(r.date || "");
}

export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === "POST" && path.endsWith("/signup")) {
    const { email, password } = await req.json().catch(() => ({}));
    if (!validEmail(email) || !password || password.length < 6 || password.length > 100)
      return Response.json({ error: "Valid email and password (6+ chars) required" }, { status: 400 });
    const key = email.toLowerCase();
    if (await store.get(key, { type: "json" }))
      return Response.json({ error: "Account exists" }, { status: 409 });
    const user = { email: key, password: await hash(password), watched: [], created: new Date().toISOString() };
    await store.setJSON(key, user);
    return Response.json({ ok: true, email: user.email });
  }

  if (req.method === "POST" && path.endsWith("/login")) {
    const { email, password } = await req.json().catch(() => ({}));
    if (!validEmail(email) || !password) return Response.json({ error: "Invalid credentials" }, { status: 401 });
    const user = await store.get(email.toLowerCase(), { type: "json" });
    if (!user || user.password !== await hash(password))
      return Response.json({ error: "Invalid credentials" }, { status: 401 });
    return Response.json({ ok: true, email: user.email, watched: user.watched || [] });
  }

  if (req.method === "POST" && path.endsWith("/watch")) {
    const { email, password, route } = await req.json().catch(() => ({}));
    if (!validEmail(email) || !password || !validRoute(route))
      return Response.json({ error: "Invalid request" }, { status: 400 });
    const user = await store.get(email.toLowerCase(), { type: "json" });
    if (!user || user.password !== await hash(password))
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    user.watched = user.watched || [];
    if (user.watched.length >= 20)
      return Response.json({ error: "Max 20 watched routes" }, { status: 400 });
    if (!user.watched.some(w => w.from === route.from && w.to === route.to && w.date === route.date))
      user.watched.push({ from: route.from, to: route.to, date: route.date, cabin: route.cabin || "economy", added: new Date().toISOString() });
    await store.setJSON(email.toLowerCase(), user);
    return Response.json({ ok: true, watched: user.watched });
  }

  if (req.method === "POST" && path.endsWith("/unwatch")) {
    const { email, password, index } = await req.json().catch(() => ({}));
    if (!validEmail(email) || !password || typeof index !== "number")
      return Response.json({ error: "Invalid request" }, { status: 400 });
    const user = await store.get(email.toLowerCase(), { type: "json" });
    if (!user || user.password !== await hash(password))
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    user.watched = (user.watched || []).filter((_, i) => i !== index);
    await store.setJSON(email.toLowerCase(), user);
    return Response.json({ ok: true, watched: user.watched });
  }

  return Response.json({ error: "Not found" }, { status: 404 });
};

export const config = { path: "/api/auth/*" };

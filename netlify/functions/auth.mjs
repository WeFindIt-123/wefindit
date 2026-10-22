import { getStore } from "@netlify/blobs";

const store = getStore("wefindit-users");

export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === "POST" && path.endsWith("/signup")) {
    const { email, password } = await req.json().catch(() => ({}));
    if (!email || !password) return Response.json({ error: "Email and password required" }, { status: 400 });
    const existing = await store.get(email.toLowerCase(), { type: "json" });
    if (existing) return Response.json({ error: "Account exists" }, { status: 409 });
    const user = { email: email.toLowerCase(), password, watched: [], created: new Date().toISOString() };
    await store.setJSON(email.toLowerCase(), user);
    return Response.json({ ok: true, email: user.email });
  }

  if (req.method === "POST" && path.endsWith("/login")) {
    const { email, password } = await req.json().catch(() => ({}));
    const user = await store.get(email?.toLowerCase(), { type: "json" });
    if (!user || user.password !== password) return Response.json({ error: "Invalid credentials" }, { status: 401 });
    return Response.json({ ok: true, email: user.email, watched: user.watched || [] });
  }

  if (req.method === "POST" && path.endsWith("/watch")) {
    const { email, password, route } = await req.json().catch(() => ({}));
    const user = await store.get(email?.toLowerCase(), { type: "json" });
    if (!user || user.password !== password) return Response.json({ error: "Unauthorized" }, { status: 401 });
    user.watched = user.watched || [];
    if (!user.watched.some(w => w.from === route.from && w.to === route.to && w.date === route.date)) {
      user.watched.push({ ...route, added: new Date().toISOString() });
    }
    await store.setJSON(email.toLowerCase(), user);
    return Response.json({ ok: true, watched: user.watched });
  }

  if (req.method === "POST" && path.endsWith("/unwatch")) {
    const { email, password, index } = await req.json().catch(() => ({}));
    const user = await store.get(email?.toLowerCase(), { type: "json" });
    if (!user || user.password !== password) return Response.json({ error: "Unauthorized" }, { status: 401 });
    user.watched = (user.watched || []).filter((_, i) => i !== index);
    await store.setJSON(email.toLowerCase(), user);
    return Response.json({ ok: true, watched: user.watched });
  }

  return Response.json({ error: "Not found" }, { status: 404 });
};

export const config = { path: "/api/auth/*" };

import { getStore } from "@netlify/blobs";

export default async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const { email } = await req.json().catch(() => ({}));
  if (!email || !email.includes("@")) return Response.json({ error: "Valid email required" }, { status: 400 });

  const store = getStore("wefindit-leads");
  await store.setJSON(email.toLowerCase(), { email: email.toLowerCase(), added: new Date().toISOString() });

  const stats = getStore("wefindit-stats");
  const current = (await stats.get("leads", { type: "json" })) || { count: 0 };
  current.count += 1;
  await stats.setJSON("leads", current);

  return Response.json({ ok: true });
};

export const config = { path: "/api/capture" };

import { getStore } from "@netlify/blobs";

const store = getStore("wefindit-users");

export default async () => {
  const token = Netlify.env.get("DUFFEL_ACCESS_TOKEN");
  const resendKey = Netlify.env.get("RESEND_API_KEY");
  if (!token || !resendKey) return new Response("Missing env", { status: 200 });

  const { blobs } = await store.list();
  let sent = 0;

  for (const blob of blobs) {
    const user = await store.get(blob.key, { type: "json" });
    if (!user?.watched?.length) continue;

    for (const route of user.watched) {
      const price = await getCheapest(token, route);
      if (!price) continue;
      const prev = route.lastPrice;
      if (prev && price < prev * 0.95) {
        await sendEmail(resendKey, user.email, route, price, prev);
        sent++;
      }
      route.lastPrice = price;
    }
    await store.setJSON(blob.key, user);
  }

  return Response.json({ checked: blobs.length, alerts_sent: sent });
};

async function getCheapest(token, route) {
  try {
    const resp = await fetch("https://api.duffel.com/air/offer_requests", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Duffel-Version": "v2", "Content-Type": "application/json" },
      body: JSON.stringify({ data: { slices: [{ origin: route.from, destination: route.to, departure_date: route.date }], cabin_class: route.cabin || "economy", passengers: [{ type: "adult" }] } }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const offers = data.data?.offers || [];
    if (!offers.length) return null;
    return Math.min(...offers.map(o => Number(o.total_amount)));
  } catch { return null; }
}

async function sendEmail(key, to, route, newPrice, oldPrice) {
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "WeFindIt <alerts@wefindit.netlify.app>",
      to,
      subject: `Price drop: ${route.from} → ${route.to}`,
      html: `<p>Price dropped on ${route.from} → ${route.to} (${route.date}).</p><p>Was ${oldPrice}, now <strong>${newPrice}</strong>.</p><p><a href="https://wefindit.netlify.app">Check it on WeFindIt</a></p>`,
    }),
  });
}

export const config = { schedule: "@daily" };

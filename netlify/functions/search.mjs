// Duffel search - token from Netlify env
export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });
  }

  const body = await req.json().catch(() => ({}));
  const origin = (body.origin || "JFK").toUpperCase();
  const destination = (body.destination || "LHR").toUpperCase();
  const departure_date = body.departure_date || new Date(Date.now() + 14*86400000).toISOString().slice(0, 10);
  const token = Netlify.env.get("DUFFEL_ACCESS_TOKEN");

  if (!token) {
    return Response.json({
      source: "mock",
      origin,
      destination,
      offers: mockOffers(origin, destination, departure_date),
    });
  }

  try {
    const resp = await fetch("https://api.duffel.com/air/offer_requests", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Duffel-Version": "v2",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        data: {
          slices: [{ origin, destination, departure_date }],
          cabin_class: "economy",
          passengers: [{ type: "adult" }],
        },
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error("Duffel error", resp.status, err.slice(0, 300));
      return Response.json({
        source: "mock",
        error: "Duffel unavailable",
        origin,
        destination,
        offers: mockOffers(origin, destination, departure_date),
      });
    }

    const data = await resp.json();
    const offers = (data.data?.offers || []).slice(0, 5).map((o) => ({
      id: o.id,
      price: o.total_amount,
      currency: o.total_currency,
      airline: o.owner?.name || "Airline",
      stops: (o.slices?.[0]?.segments?.length || 1) - 1,
    }));

    return Response.json({ source: "duffel", origin, destination, offers });
  } catch (e) {
    console.error(e);
    return Response.json({
      source: "mock",
      origin,
      destination,
      offers: mockOffers(origin, destination, departure_date),
    });
  }
};

function mockOffers(origin, destination, date) {
  const base = 380 + Math.floor(Math.random() * 200);
  return [
    { id: "mock-1", price: String(base), currency: "USD", airline: "Mock Air", stops: 0 },
    { id: "mock-2", price: String(base + 60), currency: "USD", airline: "Demo Airlines", stops: 1 },
  ];
}

export const config = { path: "/api/search" };

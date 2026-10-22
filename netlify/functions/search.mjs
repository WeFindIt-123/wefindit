// Duffel flights + hotels with preference scoring
const GEO = {
  JFK:[40.6413,-73.7781], EWR:[40.6895,-74.1745], LGA:[40.7769,-73.8740],
  NYC:[40.7128,-74.0060], LAX:[33.9416,-118.4085], SFO:[37.6213,-122.3790],
  ORD:[41.9742,-87.9073], MIA:[25.7959,-80.2870], DFW:[32.8998,-97.0403],
  ATL:[33.6407,-84.4277], SEA:[47.4502,-122.3088], BOS:[42.3656,-71.0096],
  DEN:[39.8561,-104.6737], LAS:[36.0840,-115.1537], MCO:[28.4312,-81.3081],
  LHR:[51.4700,-0.4543], LGW:[51.1537,-0.1821], CDG:[49.0097,2.5479],
  AMS:[52.3105,4.7683], FRA:[50.0379,8.5622], MUC:[48.3538,11.7861],
  BCN:[41.2974,2.0833], MAD:[40.4983,-3.5676], FCO:[41.8003,12.2389],
  DXB:[25.2532,55.3657], SIN:[1.3644,103.9915], HKG:[22.3080,113.9185],
  NRT:[35.7720,140.3929], HND:[35.5494,139.7798], SYD:[-33.9399,151.1753],
  MEL:[-37.6690,144.8410], YYZ:[43.6777,-79.6248], YVR:[49.1947,-123.1792],
};

export default async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const body = await req.json().catch(() => ({}));
  const origin = (body.origin || "JFK").toUpperCase();
  const destination = (body.destination || "LHR").toUpperCase();
  const departure_date = body.departure_date || new Date(Date.now() + 14*86400000).toISOString().slice(0,10);
  const cabin_class = body.cabin_class || "economy";
  const nights = Number(body.nights) || 3;
  const prefs = body.preferences || {};
  const token = Netlify.env.get("DUFFEL_ACCESS_TOKEN");

  if (!token) {
    const flights = scoreAndRank(mockFlights(), prefs);
    return Response.json({ source: "mock", origin, destination, flights, hotels: mockHotels() });
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "Duffel-Version": "v2",
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const [rawFlights, hotels] = await Promise.all([
    searchFlights(headers, origin, destination, departure_date, cabin_class),
    searchHotels(headers, destination, departure_date, nights),
  ]);

  const flights = scoreAndRank(rawFlights, prefs);
  return Response.json({ source: "duffel", origin, destination, departure_date, cabin_class, flights, hotels });
};

function scoreAndRank(offers, prefs) {
  if (!offers.length) return offers;
  const prices = offers.map(o => Number(o.price)).filter(p => !isNaN(p));
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 1;

  return offers.map(o => {
    const p = Number(o.price);
    const priceScore = 1 - (p - minP) / range;
    const prefScore = preferenceFit(o, prefs);
    const convScore = o.stops === 0 ? 1 : o.stops === 1 ? 0.6 : 0.3;
    const flexScore = 0.5;
    const score = priceScore * 0.4 + prefScore * 0.3 + convScore * 0.2 + flexScore * 0.1;
    return { ...o, score: Math.round(score * 100) };
  }).sort((a, b) => b.score - a.score);
}

function preferenceFit(offer, prefs) {
  let s = 0.5;
  if (prefs.preferred_airline && offer.airline?.toLowerCase().includes(prefs.preferred_airline.toLowerCase())) s += 0.3;
  if (prefs.max_stops != null && offer.stops <= prefs.max_stops) s += 0.2;
  return Math.min(1, s);
}

async function searchFlights(headers, origin, destination, date, cabin) {
  try {
    const resp = await fetch("https://api.duffel.com/air/offer_requests", {
      method: "POST", headers,
      body: JSON.stringify({ data: { slices: [{ origin, destination, departure_date: date }], cabin_class: cabin, passengers: [{ type: "adult" }] } }),
    });
    if (!resp.ok) return mockFlights();
    const data = await resp.json();
    return (data.data?.offers || []).slice(0, 8).map(o => ({
      id: o.id, price: o.total_amount, currency: o.total_currency,
      airline: o.owner?.name || "Airline", stops: (o.slices?.[0]?.segments?.length || 1) - 1,
    }));
  } catch { return mockFlights(); }
}

async function searchHotels(headers, destination, checkIn, nights) {
  const coords = GEO[destination];
  if (!coords) return mockHotels();
  const checkOut = new Date(new Date(checkIn).getTime() + nights * 86400000).toISOString().slice(0,10);
  try {
    const resp = await fetch("https://api.duffel.com/stays/search", {
      method: "POST", headers,
      body: JSON.stringify({
        data: {
          check_in_date: checkIn, check_out_date: checkOut,
          guests: [{ type: "adult" }], rooms: 1,
          location: { radius: 10, geographic_coordinates: { latitude: coords[0], longitude: coords[1] } },
        },
      }),
    });
    if (!resp.ok) return mockHotels();
    const data = await resp.json();
    return (data.data?.results || []).slice(0, 4).map(r => ({
      id: r.id, name: r.accommodation?.name || "Hotel",
      price: r.cheapest_rate_total_amount || r.cheapest_rate_base_amount,
      currency: r.cheapest_rate_total_currency || "USD",
      rating: r.accommodation?.rating || null,
    }));
  } catch { return mockHotels(); }
}

function mockFlights() {
  const b = 380 + Math.floor(Math.random()*200);
  return [
    { id:"m1", price:String(b), currency:"USD", airline:"Mock Air", stops:0 },
    { id:"m2", price:String(b+40), currency:"USD", airline:"Demo", stops:1 },
    { id:"m3", price:String(b+90), currency:"USD", airline:"Budget", stops:0 },
  ];
}
function mockHotels() {
  return [{ id:"h1", name:"Demo Hotel", price:"120", currency:"USD", rating:4 }];
}

export const config = { path: "/api/search" };

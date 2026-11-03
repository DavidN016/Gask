"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownUp, ArrowRight, Bookmark, Check, ChevronDown, Clock3, Fuel, LocateFixed, MapPin, Navigation, Search, SlidersHorizontal, Sparkles, TrendingDown, X } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_GASK_API_URL || "http://127.0.0.1:5000";
// The radius filter narrows these results in the browser, so changing it doesn't bill another Places search.
const SEARCH_RADIUS_MILES = 5;
const FILL_UP_GALLONS = 15;
const fuels = ["Regular", "Midgrade", "Premium", "Diesel"] as const;
const brands: [RegExp, string, string][] = [
  [/arco/i, "#16469a", "ARCO"],
  [/costco/i, "#d73a36", "COSTCO"],
  [/shell/i, "#b89008", "SHELL"],
  [/chevron/i, "#1865ad", "CHEVRON"],
  [/\b76\b/, "#e96627", "76"],
];

type FuelType = typeof fuels[number];
type Quote = { price: number; currency: string; updated_at: string };
type Station = { id: string; name: string; address: string | null; lat: number; lng: number; distance_miles: number; prices: Record<string, Quote> };
type Place = { lat: number; lng: number; label: string };
type Status = "idle" | "loading" | "ready" | "error";

class ApiError extends Error {
  constructor(public status: number) { super(`API returned HTTP ${status}`); }
}

async function getJson<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const query = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]));
  const response = await fetch(`${API_URL}${path}?${query}`);
  if (!response.ok) throw new ApiError(response.status);
  return response.json();
}

function brand(name: string) {
  const match = brands.find(([pattern]) => pattern.test(name));
  return match ? { color: match[1], initials: match[2] } : { color: "#3c6548", initials: name.split(" ")[0].slice(0, 7).toUpperCase() };
}

function timeAgo(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [place, setPlace] = useState<Place | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [fuel, setFuel] = useState<FuelType>("Regular");
  const [radius, setRadius] = useState("5");
  const [sort, setSort] = useState("price");
  const [saved, setSaved] = useState<string[]>([]);
  const [tab, setTab] = useState("explore");
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [help, setHelp] = useState(false);
  const [locating, setLocating] = useState(false);
  const latestRequest = useRef(0);

  useEffect(() => {
    if (!help) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHelp(false);
      if (event.key === "Tab") {
        const buttons = document.querySelectorAll<HTMLButtonElement>(".modal button");
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKeyDown); previousFocus?.focus(); };
  }, [help]);

  useEffect(() => { try { const value = JSON.parse(localStorage.getItem("gask-saved") || "[]"); if (Array.isArray(value)) setSaved(value.filter((id): id is string => typeof id === "string")); } catch { /* Saved stations are optional. */ } }, []);
  const toggleSaved = (id: string) => setSaved(current => { const next = current.includes(id) ? current.filter(item => item !== id) : [...current, id]; try { localStorage.setItem("gask-saved", JSON.stringify(next)); } catch { /* Keep session state if storage is unavailable. */ } return next; });

  const quote = (s: Station): Quote | undefined => s.prices[fuel.toLowerCase()];
  const nearby = useMemo(() => stations.filter(s => s.distance_miles <= Number(radius)), [stations, radius]);
  const priced = useMemo(() => nearby.filter(s => s.prices[fuel.toLowerCase()]), [nearby, fuel]);
  const results = useMemo(() => {
    const price = (s: Station) => s.prices[fuel.toLowerCase()]?.price ?? Infinity;
    return nearby.filter(s => tab !== "saved" || saved.includes(s.id)).sort((a, b) => sort === "distance" ? a.distance_miles - b.distance_miles : price(a) - price(b) || a.distance_miles - b.distance_miles);
  }, [nearby, tab, saved, sort, fuel]);
  const cheapest = priced.reduce<Station | null>((best, s) => !best || s.prices[fuel.toLowerCase()].price < best.prices[fuel.toLowerCase()].price ? s : best, null);
  const lowest = cheapest ? cheapest.prices[fuel.toLowerCase()].price : 0;
  const average = priced.length ? priced.reduce((total, s) => total + s.prices[fuel.toLowerCase()].price, 0) / priced.length : 0;
  const active = results.find(s => s.id === selected) || results[0];
  const pins = useMemo(() => {
    if (!place) return {};
    const lngScale = Math.cos(place.lat * Math.PI / 180);
    const offsets = stations.map(s => ({ id: s.id, dx: (s.lng - place.lng) * lngScale, dy: s.lat - place.lat }));
    const extent = Math.max(0.001, ...offsets.flatMap(o => [Math.abs(o.dx), Math.abs(o.dy)]));
    return Object.fromEntries(offsets.map(o => [o.id, { x: 50 + o.dx / extent * 40, y: 52 - o.dy / extent * 36 }]));
  }, [stations, place]);

  const loadStations = async (next: Place, requestId: number) => {
    const body = await getJson<{ stations: Station[] }>("/api/stations/nearby", { lat: next.lat, lng: next.lng, radius_miles: SEARCH_RADIUS_MILES });
    if (requestId !== latestRequest.current) return;
    setPlace(next);
    setStations(body.stations);
    setSelected(null);
    setStatus("ready");
  };
  const fail = (error: unknown, requestId: number) => {
    if (requestId !== latestRequest.current) return;
    const notFound = error instanceof ApiError && error.status === 404;
    if (!notFound) console.error(error);
    setStatus("error");
    setMessage(notFound ? "We couldn’t find that location. Try a city, address, or ZIP code." : "We couldn’t load gas prices right now. Please try again.");
  };
  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim()) { setMessage("Enter a city, address, or ZIP code to search."); return; }
    const requestId = ++latestRequest.current;
    setStatus("loading");
    setMessage("");
    try {
      const match = await getJson<{ lat: number; lng: number; address: string }>("/api/geocode", { q: query.trim() });
      if (requestId !== latestRequest.current) return;
      await loadStations({ lat: match.lat, lng: match.lng, label: match.address }, requestId);
    } catch (error) { fail(error, requestId); }
  };
  const locate = () => {
    if (!navigator.geolocation) { setMessage("Location isn’t available in this browser. Enter a location instead."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(async pos => {
      setLocating(false);
      setQuery(`${pos.coords.latitude.toFixed(3)}, ${pos.coords.longitude.toFixed(3)}`);
      const requestId = ++latestRequest.current;
      setStatus("loading");
      setMessage("");
      try { await loadStations({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: "Your location" }, requestId); } catch (error) { fail(error, requestId); }
    }, () => { setLocating(false); setMessage("We couldn’t access your location. Enter a city or ZIP code instead."); }, { timeout: 10000 });
  };

  const showResults = status === "ready" || (tab === "saved" && stations.length > 0 && status !== "loading");
  const activeQuote = active && quote(active);

  return <>
    <header className="header"><div className="header-inner"><a className="brand" href="/" aria-label="Gask home"><span className="brand-icon"><Fuel size={23} strokeWidth={2.2} /></span>gask<span className="brand-dot">.</span></a><nav aria-label="Main navigation"><button className={tab === "explore" ? "nav-link active" : "nav-link"} onClick={() => setTab("explore")}>Find gas</button><button className={tab === "saved" ? "nav-link active" : "nav-link"} onClick={() => setTab("saved")}>Saved stations {saved.length > 0 && <span className="count">{saved.length}</span>}</button></nav><button className="help-button" onClick={() => setHelp(true)}>How it works <ArrowRight size={15} /></button></div></header>
    <main>
      <section className="hero"><div className="eyebrow"><span /> SMALL DETOURS. BIG SAVINGS.</div><h1>A better price.<br className="mobile-break" /> <span>Just around the corner.</span></h1><p>Find the cheapest gas near you and get back to what moves you.</p>
      <form className="search-bar" onSubmit={search}><div className="location-input"><MapPin size={21} /><label className="sr-only" htmlFor="location">City, address, or ZIP code</label><input id="location" value={query} onChange={e => setQuery(e.target.value)} placeholder="City, address, or ZIP code" /><button type="button" className="locate-button" onClick={locate} disabled={locating} aria-label="Use my current location" title="Use my current location"><LocateFixed size={20} className={locating ? "spin" : ""} /></button></div><div className="fuel-select"><Fuel size={19} /><label className="sr-only" htmlFor="fuel">Fuel type</label><select id="fuel" value={fuel} onChange={e => setFuel(e.target.value as FuelType)}>{fuels.map(type => <option key={type}>{type}</option>)}</select><ChevronDown size={15} /></div><button className="search-button" type="submit" disabled={status === "loading"}><Search size={18} /> {status === "loading" ? "Searching…" : "Find gas"}</button></form>
      <div className="search-note"><Check size={14} /> No sign-up. No extra miles. Just better prices.</div>
      </section>
      <div className="content">
        {message && <div className="notice" role="status">{message}<button onClick={() => setMessage("")} aria-label="Dismiss message"><X size={17}/></button></div>}
        {!showResults && <div className="empty" role="status"><MapPin size={30}/>{status === "loading" ? <h3>Finding stations near you…</h3> : <><h3>Where are you filling up?</h3><p>Search a city, address, or ZIP code, or use your current location, to see live prices nearby.</p></>}</div>}
        {showResults && <>
        {priced.length > 0 && <section className="stats" aria-label="Area price summary"><div className="stat"><div className="stat-icon green"><TrendingDown size={21} /></div><div><span>Lowest nearby</span><strong>${lowest.toFixed(2)}<small> / gal</small></strong></div><span className="stat-tag">Best price</span></div><div className="stat"><div className="stat-icon"><Fuel size={20} /></div><div><span>Area average</span><strong>${average.toFixed(2)}<small> / gal</small></strong></div></div><div className="stat"><div className="stat-icon"><Sparkles size={20} /></div><div><span>A little less at the pump</span><strong>${((average - lowest) * FILL_UP_GALLONS).toFixed(2)}<small> saved per fill-up*</small></strong></div></div></section>}
        <section className="results-section"><div className="results-heading"><div><h2>{tab === "saved" ? "Your saved stations" : "Gas stations near you"}</h2><p>{results.length} stations <span>·</span> {place?.label}</p></div><div className="filters"><label><SlidersHorizontal size={15} /><select aria-label="Search radius" value={radius} onChange={e => setRadius(e.target.value)}><option value="1">Within 1 mile</option><option value="3">Within 3 miles</option><option value="5">Within 5 miles</option></select><ChevronDown size={13} /></label><label><ArrowDownUp size={15} /><select aria-label="Sort stations" value={sort} onChange={e => setSort(e.target.value)}><option value="price">Lowest price</option><option value="distance">Nearest first</option></select><ChevronDown size={13} /></label></div></div>
        <div className="results-grid"><div className="station-list">{results.length === 0 ? (tab === "saved" ? <div className="empty"><Bookmark size={30}/><h3>No saved stations nearby</h3><p>Save a station using the bookmark icon, or increase your search distance.</p><button onClick={() => setTab("explore")}>Explore stations <ArrowRight size={16}/></button></div> : <div className="empty"><MapPin size={30}/><h3>No stations found</h3><p>Try a larger search distance or a different location.</p></div>) : results.map(station => { const logo = brand(station.name); const stationQuote = quote(station); const isBest = station.id === cheapest?.id; return <article key={station.id} className={`station-card ${isBest ? "best-station" : ""} ${active?.id === station.id ? "selected" : ""}`} onMouseEnter={() => setSelected(station.id)}><div className="station-top"><div className="station-logo" style={{ color: logo.color }}><Fuel size={23}/><span>{logo.initials}</span></div><div className="station-info"><div className="station-name"><button onClick={() => setSelected(station.id)}>{station.name}</button>{isBest && <span className="best-badge">Best price</span>}</div><p>{station.address}</p><div className="station-distance"><MapPin size={12}/>{station.distance_miles} mi away</div></div><div className="price">{stationQuote ? <><strong><span>$</span>{stationQuote.price.toFixed(2)}</strong><small>{fuel.toLowerCase()} / gal</small></> : <><strong>—</strong><small>no {fuel.toLowerCase()} price</small></>}</div><button className={`save-button ${saved.includes(station.id) ? "saved" : ""}`} onClick={() => toggleSaved(station.id)} aria-label={`${saved.includes(station.id) ? "Unsave" : "Save"} ${station.name}${station.address ? ` on ${station.address}` : ""}`} aria-pressed={saved.includes(station.id)}><Bookmark size={19} fill={saved.includes(station.id) ? "currentColor" : "none"}/></button></div><div className="station-bottom"><span><Clock3 size={12}/> {stationQuote ? `Updated ${timeAgo(stationQuote.updated_at)}` : "No recent price reported"}</span><a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(station.address || station.name)}&destination_place_id=${station.id}`} target="_blank" rel="noreferrer"><Navigation size={13}/> Directions <ArrowRight size={13}/></a></div></article>; })}</div>
        <aside className="map-column"><div className="map-panel"><div className="map-caption"><span><MapPin size={14}/> {place?.label}</span><span>Relative map</span></div><div className="map-art"><div className="you-marker" style={{ left: "50%", top: "52%", transform: "translate(-50%, -50%)" }} title="Search location"><span/></div>{results.map(s => { const pinQuote = quote(s); const pin = pins[s.id]; return pinQuote && pin ? <button className={`map-pin ${s.id === active?.id ? "pin-active" : ""}`} key={s.id} style={{ left: `${pin.x}%`, top: `${pin.y}%` }} onClick={() => setSelected(s.id)} aria-label={`Show ${s.name}, $${pinQuote.price.toFixed(2)} per gallon`}>${pinQuote.price.toFixed(2)}</button> : null; })}</div>{active && <div className="map-station"><div className="map-station-icon"><Fuel size={20}/></div><div><strong>{active.name}</strong><span>{active.address} · {active.distance_miles} mi away</span></div><b>{activeQuote ? `$${activeQuote.price.toFixed(2)}` : "—"}</b></div>}<div className="map-legend"><span><i/> Search location</span><span>Approximate positions · Not a street map</span></div></div><div className="tip"><div className="tip-icon"><TrendingDown size={20}/></div><div><h3>A small stop. A little more saved.</h3><p>A few cents a gallon add up. Compare prices before your next fill-up.</p></div></div><p className="fine-print">*Estimated savings on a {FILL_UP_GALLONS}-gallon fill-up, comparing the lowest nearby price with the area average, before the cost of driving there. Station and price data from Google; prices can lag behind the pump.</p></aside></div></section>
        </>}
      </div>
    </main><footer><a className="brand footer-brand" href="/">gask<span className="brand-dot">.</span></a><p>Less at the pump. More for the journey.</p><span>Made for the road ahead.</span></footer>
    {help && <div className="modal-backdrop" onClick={() => setHelp(false)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setHelp(false)} aria-label="Close how it works" autoFocus><X size={20}/></button><div className="stat-icon green"><Fuel size={24}/></div><h2 id="help-title">A cheaper fill-up in a few taps.</h2><ol><li><strong>Pick your location and fuel.</strong><p>Set your search radius to keep the trip short.</p></li><li><strong>Compare your options.</strong><p>Sort by price or distance, and save your favorites.</p></li><li><strong>Get on your way.</strong><p>Open directions in Google Maps.</p></li></ol><div className="modal-note">Prices come from Google and can lag behind the pump. Not every station reports a price, so check the time shown on each station.</div><button className="search-button" onClick={() => setHelp(false)}>Got it <Check size={17}/></button></section></div>}
  </>;
}

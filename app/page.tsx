"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownUp, ArrowRight, Bookmark, Check, ChevronDown, Clock3, Fuel, LocateFixed, MapPin, Navigation, Search, SlidersHorizontal, Sparkles, TrendingDown, X } from "lucide-react";

const stations = [
  { id: 1, name: "Arco", address: "1175 Fell St", area: "Western Addition", price: 4.29, distance: 0.8, minutes: 4, updated: 12, color: "#16469a", initials: "ARCO", amenities: ["Open 24 hours", "Debit & cash"], x: 38, y: 47 },
  { id: 2, name: "Costco Gasoline", address: "450 10th St", area: "SoMa", price: 4.35, distance: 1.4, minutes: 7, updated: 25, color: "#d73a36", initials: "COSTCO", amenities: ["Open until 9 PM", "Membership required"], x: 68, y: 65 },
  { id: 3, name: "Shell", address: "1601 Mission St", area: "Mission District", price: 4.59, distance: 1.1, minutes: 6, updated: 18, color: "#b89008", initials: "SHELL", amenities: ["Open 24 hours", "Convenience store"], x: 47, y: 77 },
  { id: 4, name: "Chevron", address: "1501 Van Ness Ave", area: "Nob Hill", price: 4.69, distance: 1.7, minutes: 8, updated: 32, color: "#1865ad", initials: "CHEVRON", amenities: ["Open 24 hours", "Car wash"], x: 73, y: 30 },
  { id: 5, name: "76", address: "1298 Valencia St", area: "Mission District", price: 4.75, distance: 2.3, minutes: 11, updated: 41, color: "#e96627", initials: "76", amenities: ["Open 24 hours", "Convenience store"], x: 27, y: 86 },
  { id: 6, name: "Shell", address: "2501 California St", area: "Pacific Heights", price: 4.89, distance: 3.2, minutes: 14, updated: 52, color: "#b89008", initials: "SHELL", amenities: ["Open 24 hours", "Convenience store"], x: 28, y: 23 },
];
type Station = typeof stations[number];
type FuelType = "Regular" | "Midgrade" | "Premium" | "Diesel";
const offsets: Record<FuelType, number> = { Regular: 0, Midgrade: 0.3, Premium: 0.5, Diesel: 0.65 };

export default function Home() {
  const [query, setQuery] = useState("San Francisco, CA");
  const [location, setLocation] = useState("San Francisco, CA");
  const [fuel, setFuel] = useState<FuelType>("Regular");
  const [radius, setRadius] = useState("5");
  const [sort, setSort] = useState("price");
  const [saved, setSaved] = useState<number[]>([]);
  const [tab, setTab] = useState("explore");
  const [selected, setSelected] = useState<number>(1);
  const [message, setMessage] = useState("");
  const [help, setHelp] = useState(false);
  const [locating, setLocating] = useState(false);

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

  useEffect(() => { try { const value = JSON.parse(localStorage.getItem("gask-saved") || "[]"); if (Array.isArray(value)) setSaved(value.filter((id): id is number => typeof id === "number")); } catch { /* Saved stations are optional. */ } }, []);
  const toggleSaved = (id: number) => setSaved(current => { const next = current.includes(id) ? current.filter(item => item !== id) : [...current, id]; try { localStorage.setItem("gask-saved", JSON.stringify(next)); } catch { /* Keep session state if storage is unavailable. */ } return next; });
  const results = useMemo(() => stations.filter(s => s.distance <= Number(radius) && (tab !== "saved" || saved.includes(s.id))).sort((a, b) => sort === "distance" ? a.distance - b.distance : a.price - b.price), [radius, tab, saved, sort]);
  const price = (s: Station) => (s.price + offsets[fuel]).toFixed(2);
  const active = results.find(s => s.id === selected) || results[0];
  const search = (event: React.FormEvent) => { event.preventDefault(); if (!query.trim()) { setMessage("Enter a city, address, or ZIP code to search."); return; } setLocation(query.trim()); setMessage(/san francisco|941\d{2}/i.test(query) ? "" : "This demo shows San Francisco sample stations. Live location search will be available when a data source is connected."); };
  const locate = () => { if (!navigator.geolocation) { setMessage("Location isn’t available in this browser. Enter a location instead."); return; } setLocating(true); navigator.geolocation.getCurrentPosition(pos => { const value = `${pos.coords.latitude.toFixed(3)}, ${pos.coords.longitude.toFixed(3)}`; setQuery(value); setLocation(value); setLocating(false); setMessage("Location found. This frontend demo still displays San Francisco sample stations."); }, () => { setLocating(false); setMessage("We couldn’t access your location. Enter a city or ZIP code instead."); }, { timeout: 10000 }); };

  return <>
    <header className="header"><div className="header-inner"><a className="brand" href="/" aria-label="Gask home"><span className="brand-icon"><Fuel size={23} strokeWidth={2.2} /></span>gask<span className="brand-dot">.</span></a><nav aria-label="Main navigation"><button className={tab === "explore" ? "nav-link active" : "nav-link"} onClick={() => setTab("explore")}>Find gas</button><button className={tab === "saved" ? "nav-link active" : "nav-link"} onClick={() => setTab("saved")}>Saved stations {saved.length > 0 && <span className="count">{saved.length}</span>}</button></nav><button className="help-button" onClick={() => setHelp(true)}>How it works <ArrowRight size={15} /></button></div></header>
    <main>
      <section className="hero"><div className="eyebrow"><span /> SMALL DETOURS. BIG SAVINGS.</div><h1>A better price.<br className="mobile-break" /> <span>Just around the corner.</span></h1><p>Find the cheapest gas near you and get back to what moves you.</p>
      <form className="search-bar" onSubmit={search}><div className="location-input"><MapPin size={21} /><label className="sr-only" htmlFor="location">City, address, or ZIP code</label><input id="location" value={query} onChange={e => setQuery(e.target.value)} placeholder="City, address, or ZIP code" /><button type="button" className="locate-button" onClick={locate} disabled={locating} aria-label="Use my current location" title="Use my current location"><LocateFixed size={20} className={locating ? "spin" : ""} /></button></div><div className="fuel-select"><Fuel size={19} /><label className="sr-only" htmlFor="fuel">Fuel type</label><select id="fuel" value={fuel} onChange={e => setFuel(e.target.value as FuelType)}>{Object.keys(offsets).map(type => <option key={type}>{type}</option>)}</select><ChevronDown size={15} /></div><button className="search-button" type="submit"><Search size={18} /> Find gas</button></form>
      <div className="search-note"><Check size={14} /> No sign-up. No extra miles. Just better prices.</div>
      </section>
      <div className="content">
        <div className="demo-note"><span><span className="demo-dot" /> Demo preview</span> Explore sample prices and stations in San Francisco.</div>
        {message && <div className="notice" role="status">{message}<button onClick={() => setMessage("")} aria-label="Dismiss message"><X size={17}/></button></div>}
        <section className="stats" aria-label="Area price summary"><div className="stat"><div className="stat-icon green"><TrendingDown size={21} /></div><div><span>Lowest nearby</span><strong>${(4.29 + offsets[fuel]).toFixed(2)}<small> / gal</small></strong></div><span className="stat-tag">Best price</span></div><div className="stat"><div className="stat-icon"><Fuel size={20} /></div><div><span>Area average</span><strong>${(4.59 + offsets[fuel]).toFixed(2)}<small> / gal</small></strong></div></div><div className="stat"><div className="stat-icon"><Sparkles size={20} /></div><div><span>A little less at the pump</span><strong>$4.50<small> saved per fill-up*</small></strong></div></div></section>
        <section className="results-section"><div className="results-heading"><div><h2>{tab === "saved" ? "Your saved stations" : "Gas stations near you"}</h2><p>{results.length} stations <span>·</span> {location}</p></div><div className="filters"><label><SlidersHorizontal size={15} /><select aria-label="Search radius" value={radius} onChange={e => setRadius(e.target.value)}><option value="1">Within 1 mile</option><option value="3">Within 3 miles</option><option value="5">Within 5 miles</option></select><ChevronDown size={13} /></label><label><ArrowDownUp size={15} /><select aria-label="Sort stations" value={sort} onChange={e => setSort(e.target.value)}><option value="price">Lowest price</option><option value="distance">Nearest first</option></select><ChevronDown size={13} /></label></div></div>
        <div className="results-grid"><div className="station-list">{results.length === 0 ? <div className="empty"><Bookmark size={30}/><h3>No saved stations nearby</h3><p>Save a station using the bookmark icon, or increase your search distance.</p><button onClick={() => setTab("explore")}>Explore stations <ArrowRight size={16}/></button></div> : results.map(station => <article key={station.id} className={`station-card ${station.id === 1 ? "best-station" : ""} ${active?.id === station.id ? "selected" : ""}`} onMouseEnter={() => setSelected(station.id)}><div className="station-top"><div className="station-logo" style={{ color: station.color }}><Fuel size={23}/><span>{station.initials}</span></div><div className="station-info"><div className="station-name"><button onClick={() => setSelected(station.id)}>{station.name}</button>{station.id === 1 && <span className="best-badge">Best price</span>}</div><p>{station.address} <span>· {station.area}</span></p><div className="station-distance"><MapPin size={12}/>{station.distance} mi<span>·</span>{station.minutes} min drive</div></div><div className="price"><strong><span>$</span>{price(station)}</strong><small>{fuel.toLowerCase()} / gal</small></div><button className={`save-button ${saved.includes(station.id) ? "saved" : ""}`} onClick={() => toggleSaved(station.id)} aria-label={`${saved.includes(station.id) ? "Unsave" : "Save"} ${station.name} on ${station.address}`} aria-pressed={saved.includes(station.id)}><Bookmark size={19} fill={saved.includes(station.id) ? "currentColor" : "none"}/></button></div><div className="amenities">{station.amenities.map((a, i) => <span key={a}>{i === 0 && <i/>}{a}</span>)}</div><div className="station-bottom"><span><Clock3 size={12}/> Updated {station.updated} min ago <span className="sample">· sample</span></span><a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(station.address + ", San Francisco, CA")}`} target="_blank" rel="noreferrer"><Navigation size={13}/> Directions <ArrowRight size={13}/></a></div></article>)}</div>
        <aside className="map-column"><div className="map-panel"><div className="map-caption"><span><MapPin size={14}/> San Francisco</span><span>Illustrative map</span></div><div className="map-art"><div className="park park-one">LAFAYETTE<br/>PARK</div><div className="park park-two">ALAMO<br/>SQUARE</div><div className="park park-three">PATRICIA’S<br/>GREEN</div><div className="map-road road-one"/><div className="map-road road-two"/><span className="map-label label-one">PACIFIC HEIGHTS</span><span className="map-label label-two">WESTERN ADDITION</span><span className="map-label label-three">HAYES VALLEY</span><span className="map-label label-four">SOMA</span><span className="street street-one">FRANKLIN ST</span><span className="street street-two">MARKET ST</span><div className="you-marker" title="Sample search location"><span/></div>{results.map(s => <button className={`map-pin ${s.id === active?.id ? "pin-active" : ""}`} key={s.id} style={{ left: `${s.x}%`, top: `${s.y}%` }} onClick={() => setSelected(s.id)} aria-label={`Show ${s.name}, $${price(s)} per gallon`}>${price(s)}</button>)}</div>{active && <div className="map-station"><div className="map-station-icon"><Fuel size={20}/></div><div><strong>{active.name}</strong><span>{active.address} · {active.distance} mi away</span></div><b>${price(active)}</b></div>}<div className="map-legend"><span><i/> Search location</span><span>Sample locations · Not to scale</span></div></div><div className="tip"><div className="tip-icon"><TrendingDown size={20}/></div><div><h3>A small stop. A little more saved.</h3><p>A few cents a gallon add up. Compare prices before your next fill-up.</p></div></div><p className="fine-print">*Estimated savings on a 15-gallon fill-up, comparing the lowest sample price with the sample area average. Prices are for demonstration only.</p></aside></div></section>
      </div>
    </main><footer><a className="brand footer-brand" href="/">gask<span className="brand-dot">.</span></a><p>Less at the pump. More for the journey.</p><span>Made for the road ahead.</span></footer>
    {help && <div className="modal-backdrop" onClick={() => setHelp(false)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setHelp(false)} aria-label="Close how it works" autoFocus><X size={20}/></button><div className="stat-icon green"><Fuel size={24}/></div><h2 id="help-title">A cheaper fill-up in a few taps.</h2><ol><li><strong>Pick your location and fuel.</strong><p>Set your search radius to keep the trip short.</p></li><li><strong>Compare your options.</strong><p>Sort by price or distance, and save your favorites.</p></li><li><strong>Get on your way.</strong><p>Open directions in Google Maps.</p></li></ol><div className="modal-note">This is a frontend demo. Prices, distances, opening hours, and map positions are illustrative, not live data.</div><button className="search-button" onClick={() => setHelp(false)}>Got it <Check size={17}/></button></section></div>}
  </>;
}

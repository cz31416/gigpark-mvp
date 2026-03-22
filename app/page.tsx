'use client';

import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import React, { useEffect, useMemo, useState } from "react";
import {
  MapPin,
  Search,
  SlidersHorizontal,
  Star,
  Wallet,
  MessageSquare,
  ShieldCheck,
  ArrowLeft,
  Plus,
  Filter,
  Clock,
  Car,
  Home,
  CreditCard,
  CalendarDays,
  X,
  Repeat2,
  ReceiptText,
  LogIn,
  LogOut,
} from "lucide-react";

// GigPark — single-file MVP prototype (React + Tailwind)
// - No backend; uses mock data
// - Flow: home, search (list/map), spot detail (availability + duration), checkout, bookings, chat, profile

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

const money = (n: number) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(n);

const days: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const DAY_TO_JS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

type DayKey = keyof typeof DAY_TO_JS;

type Availability = Record<DayKey, [string, string] | null>;

type Spot = {
  id: string;
  title: string;
  area: string;
  priceHour: number;
  priceDay: number;
  addressHint: string;
  photo: string | null;
  difficulty: "Easy" | "Medium" | "Hard";
  description: string;
  availability: Availability;
  host: {
    name: string;
    rating: number;
    reviews: number;
  };
  features: string[];
  lat: number;
  lng: number;
};

type Booking = {
  id: string;
  spot: Spot;
  startAt: Date | string;
  durationHours: number;
  subtotal: number;
  tax: number;
  total: number;
  status: "Confirmed" | "Cancelled";
  isPast?: boolean;
};

type CheckoutPayload = {
  spot: Spot;
  day: DayKey;
  durationHours: number;
  subtotal: number;
  tax: number;
  total: number;
  startAt: Date;
};

function nextOccurrence(dayKey: keyof typeof DAY_TO_JS, hhmm: string) {
  // returns Date for next occurrence of dayKey at hh:mm (local)
  const now = new Date();
  const targetDow = DAY_TO_JS[dayKey];
  const [hh, mm] = (hhmm || "09:00").split(":").map((x) => Number(x));

  const d = new Date(now);
  d.setSeconds(0);
  d.setMilliseconds(0);
  d.setHours(hh, mm, 0, 0);

  const todayDow = d.getDay();
  let delta = (targetDow - todayDow + 7) % 7;
  if (delta === 0 && d.getTime() <= now.getTime()) delta = 7;
  d.setDate(d.getDate() + delta);
  return d;
}

function fmtDateTime(d: Date | string) {
  if (!(d instanceof Date)) d = new Date(d);
  return d.toLocaleString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function hoursBetween(a: Date, b: Date) {
  const ms = b.getTime() - a.getTime();
  return ms / (1000 * 60 * 60);
}

function countdownLabel(startAt: Date) {
  const now = new Date();
  const h = hoursBetween(now, startAt);
  if (h <= 0) return "started";
  if (h < 1) return "<1hr";
  if (h < 2) return "<2hr";
  return "2hr+";
}

const TAX = { gst: 0.05, qst: 0.09975 };

const MOCK_MESSAGES = [
  { from: "alex", side: "them", text: "hi! what time are you arriving?" },
  { from: "you", side: "me", text: "around 9:15am. is the driveway entrance on the left?" },
  { from: "alex", side: "them", text: "yes—left side. i'll send exact pin after booking." },
];

function Badge({
  children,
  tone = "Neutral",
}: {
  children: React.ReactNode;
  tone?: "Neutral" | "Good" | "Warn" | "Bad" | "Info";
}) {
  const map = {
    Neutral: "bg-zinc-100 text-zinc-700",
    Good: "bg-emerald-50 text-emerald-700",
    Warn: "bg-amber-50 text-amber-700",
    Bad: "bg-rose-50 text-rose-700",
    Info: "bg-sky-50 text-sky-700",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        map[tone]
      )}
    >
      {children}
    </span>
  );
}

function DifficultyPill({ level }: { level: Spot["difficulty"] }) {
  const tone = level === "Easy" ? "Good" : level === "Medium" ? "Warn" : "Bad";
  return <Badge tone={tone}>{level}</Badge>;
}

type View = "home" | "search" | "detail" | "host" | "bookings" | "chat" | "profile" | "login";

function TopNav({
  view,
  setView,
  user,
  onLogout,
}: {
  view: View;
  setView: React.Dispatch<React.SetStateAction<View>>;
  user: User | null;
  onLogout: () => Promise<void> | void;
}) {
  const tabs: { id: View; label: string }[] = [
    { id: "home", label: "Home" },
    { id: "search", label: "Find Parking" },
    { id: "host", label: "List a Spot" },
    { id: "bookings", label: "Bookings" },
    { id: "chat", label: "Chat" },
    { id: "profile", label: "Profile" },
  ];

  return (
    <div className="sticky top-0 z-40 border-b border-zinc-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <button onClick={() => setView("home")} className="flex items-center gap-2">
          <img
            src="/20260122 - Logo.png"
            alt="GigPark"
            className="h-9 w-9 rounded-2xl object-cover"
          />
          <div className="leading-tight">
            <div className="text-sm font-semibold">GigPark</div>
            <div className="text-xs text-zinc-500">Peer-to-peer residential parking</div>
          </div>
        </button>

        <div className="hidden items-center gap-1 md:flex">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setView(t.id)}
              className={cx(
                "rounded-xl px-3 py-2 text-sm",
                view === t.id ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-100"
              )}
            >
              {t.label}
            </button>
          ))}

          {user ? (
            <button
              onClick={onLogout}
              className="ml-2 inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
            >
              <LogOut className="h-4 w-4" />
              log out
            </button>
          ) : (
            <button
              onClick={() => setView("login")}
              className="ml-2 inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800"
            >
              <LogIn className="h-4 w-4" />
              log in
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <button
            onClick={() => setView("search")}
            className={cx(
              "grid h-9 w-9 place-items-center rounded-xl",
              view === "search" ? "bg-zinc-900 text-white" : "bg-zinc-100"
            )}
            aria-label="Find"
          >
            <Search className="h-4 w-4" />
          </button>

          <button
            onClick={() => setView(user ? "host" : "login")}
            className={cx(
              "grid h-9 w-9 place-items-center rounded-xl",
              view === "host" ? "bg-zinc-900 text-white" : "bg-zinc-100"
            )}
            aria-label="Host"
          >
            <Plus className="h-4 w-4" />
          </button>

          <button
            onClick={() => setView("bookings")}
            className={cx(
              "grid h-9 w-9 place-items-center rounded-xl",
              view === "bookings" ? "bg-zinc-900 text-white" : "bg-zinc-100"
            )}
            aria-label="Bookings"
          >
            <CalendarDays className="h-4 w-4" />
          </button>

          {user ? (
            <button
              onClick={onLogout}
              className="grid h-9 w-9 place-items-center rounded-xl bg-zinc-100"
              aria-label="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={() => setView("login")}
              className={cx(
                "grid h-9 w-9 place-items-center rounded-xl",
                view === "login" ? "bg-zinc-900 text-white" : "bg-zinc-100"
              )}
              aria-label="Log in"
            >
              <LogIn className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Hero({
  onGetParking,
  onEarnMoney,
}: {
  onGetParking: () => void;
  onEarnMoney: () => void;
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="grid gap-8 md:grid-cols-2 items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700">
            <ShieldCheck className="h-4 w-4" />
            Owner-authorized • Neighborhood-first • Simple booking
          </div>
          <h1 className="mt-4 text-3xl md:text-5xl font-semibold tracking-tight text-zinc-900">
            Park near where you actually need to be.
          </h1>
          <p className="mt-3 text-zinc-600 leading-relaxed">
            GigPark helps residents rent out unused driveway and condo spots; so drivers can book reliable parking by the hour, day, or month.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={onGetParking}
              className="px-5 py-3 rounded-2xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800"
            >
              Get Parking
            </button>
            <button
              onClick={onEarnMoney}
              className="px-5 py-3 rounded-2xl bg-white border border-zinc-300 text-zinc-900 text-sm font-medium hover:bg-zinc-50"
            >
              Earn Money
            </button>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-zinc-200 p-3">
              <div className="text-xs text-zinc-500">Avg booking</div>
              <div className="mt-1 text-lg font-semibold">10–30 min</div>
            </div>
            <div className="rounded-2xl border border-zinc-200 p-3">
              <div className="text-xs text-zinc-500">Trust</div>
              <div className="mt-1 text-lg font-semibold">Ratings + Chat</div>
            </div>
            <div className="rounded-2xl border border-zinc-200 p-3">
              <div className="text-xs text-zinc-500">Payments</div>
              <div className="mt-1 text-lg font-semibold">In-App</div>
            </div>
          </div>
        </div>
        <div className="relative">
          <div className="rounded-3xl overflow-hidden border border-zinc-200 shadow-sm">
            <img
              src="https://images.unsplash.com/photo-1528920304568-6f1f8a4d52af?auto=format&fit=crop&w=1600&q=60"
              alt="street parking"
              className="h-[420px] w-full object-cover"
            />
          </div>
          <div className="absolute -bottom-5 left-6 right-6 rounded-3xl bg-white border border-zinc-200 shadow-sm p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">driveway spot — 2 min to HEC</div>
                <div className="mt-1 flex items-center gap-2 text-xs text-zinc-600">
                  <MapPin className="h-3.5 w-3.5" />
                  <span className="truncate">Côte-des-Neiges</span>
                  <span className="text-zinc-300">•</span>
                  <span className="truncate">{money(4)}/hr</span>
                </div>
              </div>
              <DifficultyPill level="Easy" />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-zinc-600">
                <Star className="h-4 w-4" />
                <span>4.8 (31)</span>
              </div>
              <button className="text-xs font-medium px-3 py-2 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800">
                book now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FiltersBar({
  q,
  setQ,
  area,
  setArea,
  priceMax,
  setPriceMax,
  viewMode,
  setViewMode,
}: {
  q: string;
  setQ: React.Dispatch<React.SetStateAction<string>>;
  area: string;
  setArea: React.Dispatch<React.SetStateAction<string>>;
  priceMax: number;
  setPriceMax: React.Dispatch<React.SetStateAction<number>>;
  viewMode: "list" | "map";
  setViewMode: React.Dispatch<React.SetStateAction<"list" | "map">>;
}) {
  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="flex-1 flex items-center gap-2 rounded-2xl bg-zinc-100 px-3 py-2">
          <Search className="h-4 w-4 text-zinc-600" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search: metro, campus, neighborhood"
            className="w-full bg-transparent outline-none text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2 rounded-2xl border border-zinc-200 px-3 py-2">
            <MapPin className="h-4 w-4 text-zinc-600" />
            <select value={area} onChange={(e) => setArea(e.target.value)} className="text-sm outline-none bg-transparent">
              <option value="">all areas</option>
              <option value="Côte-des-Neiges">Côte-des-Neiges</option>
              <option value="Outremont">Outremont</option>
              <option value="Plateau">Plateau</option>
              <option value="Downtown">Downtown</option>
            </select>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-zinc-200 px-3 py-2">
            <SlidersHorizontal className="h-4 w-4 text-zinc-600" />
            <span className="text-sm">max {money(priceMax)}/hr</span>
            <input
              type="range"
              min={1}
              max={100}
              value={priceMax}
              onChange={(e) => setPriceMax(Number(e.target.value))}
              className="w-28"
            />
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-zinc-200 px-3 py-2">
            <Filter className="h-4 w-4 text-zinc-600" />
            <button onClick={() => setViewMode(viewMode === "list" ? "map" : "list")} className="text-sm font-medium">
              {viewMode === "list" ? "switch to map" : "switch to list"}
            </button>
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
        <Badge tone="Info">filters: date • price • location</Badge>
        <Badge>no exact address until booking</Badge>
        <Badge tone="Good">owner-authorized spots only</Badge>
      </div>
    </div>
  );
}

function ListingCard({
  spot,
  onOpen,
}: {
  spot: Spot;
  onOpen: (spot: Spot) => void;
}) {
  return (
    <button
      onClick={() => onOpen(spot)}
      className="text-left rounded-3xl overflow-hidden border border-zinc-200 bg-white hover:shadow-sm transition"
    >
      <div className="h-44 w-full overflow-hidden">
        <img
          src={spot.photo || "/placeholder.png"}
          alt={spot.title}
          className="h-full w-full object-cover"
          onError={(e) => {
            e.currentTarget.src = "/placeholder.png";
          }}
        />
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{spot.title}</div>
            <div className="mt-1 flex items-center gap-2 text-xs text-zinc-600">
              <MapPin className="h-3.5 w-3.5" />
              <span className="truncate">{spot.area}</span>
              <span className="text-zinc-300">•</span>
              <span className="truncate">{money(spot.priceHour)}/hr</span>
            </div>
          </div>
          <DifficultyPill level={spot.difficulty} />
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-zinc-600">
            <Star className="h-4 w-4" />
            <span>
              {spot.host.rating.toFixed(1)} ({spot.host.reviews})
            </span>
          </div>
          <div className="text-xs font-medium text-zinc-900">{money(spot.priceDay)}/day</div>
        </div>
      </div>
    </button>
  );
}

function BubbleMap({
  spots,
  onOpen,
}: {
  spots: Spot[];
  onOpen: (spot: Spot) => void;
}) {
  // stylized “map” with bubbles (no external map API)
  const bounds = useMemo(() => {
    if (spots.length === 0) {
      return { minLat: 0, maxLat: 1, minLng: 0, maxLng: 1 };
    }

    const lats = spots.map((s) => s.lat);
    const lngs = spots.map((s) => s.lng);

    return {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs),
    };
  }, [spots]);

  const toXY = (lat: number, lng: number) => {
    const x = ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng || 1)) * 100;
    const y = (1 - (lat - bounds.minLat) / (bounds.maxLat - bounds.minLat || 1)) * 100;
    return { x, y };
  };

  return (
    <div className="rounded-3xl border border-zinc-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          <div className="text-sm font-semibold">map search</div>
        </div>
        <div className="text-xs text-zinc-600">bubble size = price • badge color = difficulty</div>
      </div>
      <div className="relative h-[420px] bg-gradient-to-br from-zinc-50 to-zinc-100">
        <div className="absolute inset-0 opacity-40">
          <div className="absolute left-0 right-0 top-24 h-1 bg-zinc-300 rotate-2" />
          <div className="absolute left-0 right-0 top-44 h-1 bg-zinc-300 -rotate-3" />
          <div className="absolute left-0 right-0 top-64 h-1 bg-zinc-300 rotate-1" />
          <div className="absolute top-0 bottom-0 left-1/4 w-1 bg-zinc-300 -rotate-2" />
          <div className="absolute top-0 bottom-0 left-2/3 w-1 bg-zinc-300 rotate-3" />
        </div>

        {spots.map((s) => {
          const { x, y } = toXY(s.lat, s.lng);
          const size = 26 + (s.priceHour - 2) * 6;
          const ring =
            s.difficulty === "Easy"
              ? "ring-emerald-300"
              : s.difficulty === "Medium"
              ? "ring-amber-300"
              : "ring-rose-300";
          return (
            <button
              key={s.id}
              onClick={() => onOpen(s)}
              className={cx(
                "absolute grid place-items-center rounded-full bg-white/90 text-xs font-semibold ring-2 shadow-sm hover:shadow transition",
                ring
              )}
              style={{
                left: `calc(${x}% - ${size / 2}px)`,
                top: `calc(${y}% - ${size / 2}px)`,
                width: size,
                height: size,
              }}
              title={s.title}
            >
              {money(s.priceHour)}
            </button>
          );
        })}

        <div className="absolute bottom-4 left-4 rounded-2xl bg-white border border-zinc-200 px-3 py-2 text-xs text-zinc-700 flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          <span>map filters: price • availability • car size</span>
        </div>
      </div>
    </div>
  );
}

function SpotDetail({
  spot,
  onBack,
  onCheckout,
}: {
  spot: Spot;
  onBack: () => void;
  onCheckout: (payload: CheckoutPayload) => void;
}) {
  const [day, setDay] = useState<DayKey>("mon");
  const [duration, setDuration] = useState("2h");

  const av = spot.availability?.[day];
  const durationHours = duration === "1h" ? 1 : duration === "2h" ? 2 : duration === "4h" ? 4 : duration === "8h" ? 8 : 24;
  const subtotal = spot.priceHour * durationHours;
  const tax = subtotal * (TAX.gst + TAX.qst);
  const total = subtotal + tax;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <button onClick={onBack} className="inline-flex items-center gap-2 text-sm text-zinc-700 hover:text-zinc-900">
        <ArrowLeft className="h-4 w-4" />
        Back to search
      </button>

      <div className="mt-4 grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl overflow-hidden border border-zinc-200 bg-white">
          <div className="h-64 w-full overflow-hidden">
            <img
              src={spot.photo || "/placeholder.png"}
              alt={spot.title}
              className="h-full w-full object-cover"
              onError={(e) => {
                e.currentTarget.src = "/placeholder.png";
              }}
            />
          </div>
          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xl font-semibold">{spot.title}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-600">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-4 w-4" /> {spot.area}
                  </span>
                  <span className="text-zinc-300">•</span>
                  <span className="truncate">{spot.addressHint}</span>
                </div>
              </div>
              <DifficultyPill level={spot.difficulty} />
            </div>

            <div className="mt-4 grid gap-2">
              <div className="text-sm text-zinc-700">{spot.description}</div>
              <div className="flex flex-wrap gap-2">
                {spot.features.map((f) => (
                  <Badge key={f}>{f}</Badge>
                ))}
              </div>
            </div>

            <div className="mt-5 rounded-2xl bg-zinc-50 border border-zinc-200 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Host</div>
                <div className="flex items-center gap-2 text-sm text-zinc-700">
                  <Star className="h-4 w-4" />
                  <span>
                    {spot.host.rating.toFixed(1)} ({spot.host.reviews})
                  </span>
                </div>
              </div>
              <div className="mt-2 text-sm text-zinc-600">{spot.host.name} • responds fast • exact address after booking</div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-5 h-fit">
          <div className="text-sm text-zinc-600">price</div>
          <div className="mt-1 text-2xl font-semibold">{money(spot.priceHour)}/hr</div>
          <div className="mt-1 text-sm text-zinc-600">{money(spot.priceDay)}/day</div>

          <div className="mt-4 grid gap-3">
            <div>
              <div className="text-xs text-zinc-500 mb-1">choose day</div>
              <div className="flex flex-wrap gap-2">
                {days.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDay(d)}
                    className={cx(
                      "px-3 py-2 rounded-xl text-sm",
                      day === d ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700"
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs text-zinc-500 mb-1">availability</div>
              <div className="flex items-center gap-2 text-sm text-zinc-700">
                <Clock className="h-4 w-4" />
                <span>{av ? `${av[0]}–${av[1]}` : "not available"}</span>
              </div>
            </div>

            <div>
              <div className="text-xs text-zinc-500 mb-1">duration</div>
              <div className="grid grid-cols-5 gap-2">
                {[
                  { k: "1h", v: 1 },
                  { k: "2h", v: 2 },
                  { k: "4h", v: 4 },
                  { k: "8h", v: 8 },
                  { k: "24h", v: 24 },
                ].map((x) => (
                  <button
                    key={x.k}
                    onClick={() => setDuration(`${x.k}`)}
                    className={cx(
                      "px-3 py-2 rounded-xl text-sm",
                      duration === x.k ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700"
                    )}
                  >
                    {x.k}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-zinc-50 border border-zinc-200 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-600">subtotal</span>
                <span className="font-semibold">{money(subtotal)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm">
                <span className="text-zinc-600">gst + qst</span>
                <span className="font-semibold">{money(tax)}</span>
              </div>
              <div className="mt-2 pt-2 border-t border-zinc-200 flex items-center justify-between text-sm">
                <span className="text-zinc-600">total</span>
                <span className="font-semibold">{money(total)}</span>
              </div>
              <div className="mt-2 text-xs text-zinc-500">final details confirmed in chat. payment required to confirm.</div>
            </div>

            <button
              disabled={!av}
              onClick={() => onCheckout({ spot, day, durationHours, subtotal, tax, total, startAt: nextOccurrence(day, av?.[0] || "09:00") })}
              className={cx(
                "w-full px-4 py-3 rounded-2xl text-sm font-medium",
                av ? "bg-zinc-900 text-white hover:bg-zinc-800" : "bg-zinc-200 text-zinc-500 cursor-not-allowed"
              )}
            >
              book & pay
            </button>
          </div>

          <div className="mt-4 text-xs text-zinc-600 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            address stays masked until booking
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckoutModal({
  open,
  onClose,
  payload,
  hasPaymentMethod,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  payload: CheckoutPayload | null;
  hasPaymentMethod: boolean;
  onConfirm: () => void;
}) {
  if (!open || !payload) return null;
  const { spot, day, durationHours, subtotal, tax, total, startAt } = payload;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white border border-zinc-200 shadow-xl overflow-hidden">
        <div className="p-5 border-b border-zinc-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            <div>
              <div className="text-sm font-semibold">checkout</div>
              <div className="text-xs text-zinc-500">pay to confirm booking</div>
            </div>
          </div>
          <button onClick={onClose} className="text-sm text-zinc-600 hover:text-zinc-900">
            close
          </button>
        </div>

        <div className="p-5 grid gap-4">
          <div className="rounded-2xl bg-zinc-50 border border-zinc-200 p-4">
            <div className="text-sm font-semibold">{spot.title}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-600">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-4 w-4" /> {spot.area}
              </span>
              <span className="text-zinc-300">•</span>
              <span>{day}</span>
              <span className="text-zinc-300">•</span>
              <span>{durationHours} hours</span>
            </div>
            <div className="mt-2 text-xs text-zinc-500">starts: {fmtDateTime(startAt)}</div>
          </div>

          <div className="grid gap-2">
            <div className="text-xs text-zinc-500">payment method</div>
            <div className="rounded-2xl border border-zinc-200 p-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <CreditCard className="h-4 w-4" />
                <span>{hasPaymentMethod ? "card ending •••• 1234" : "no payment method"}</span>
              </div>
              <button className="text-sm text-zinc-700 hover:text-zinc-900">change</button>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-600">subtotal</span>
              <span className="font-semibold">{money(subtotal)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="text-zinc-600">gst + qst</span>
              <span className="font-semibold">{money(tax)}</span>
            </div>
            <div className="mt-2 pt-2 border-t border-zinc-200 flex items-center justify-between text-sm">
              <span className="text-zinc-600">total</span>
              <span className="font-semibold">{money(total)}</span>
            </div>
            <div className="mt-2 text-xs text-zinc-500">funds are held until the booking window starts.</div>
          </div>

          <button
            onClick={onConfirm}
            disabled={!hasPaymentMethod}
            className={cx(
              "w-full px-4 py-3 rounded-2xl text-sm font-medium",
              hasPaymentMethod ? "bg-zinc-900 text-white hover:bg-zinc-800" : "bg-zinc-200 text-zinc-500 cursor-not-allowed"
            )}
          >
            confirm payment
          </button>

          {!hasPaymentMethod && (
            <div className="text-xs text-rose-600">add a payment method in profile to complete checkout.</div>
          )}

          <div className="text-xs text-zinc-600">by paying, you agree this is a private, owner-authorized parking space.</div>
        </div>
      </div>
    </div>
  );
}

function SearchPage({
  spots,
  onOpenSpot,
}: {
  spots: Spot[];
  onOpenSpot: (spot: Spot) => void;
}) {
  const [q, setQ] = useState("");
  const [area, setArea] = useState("");
  const [priceMax, setPriceMax] = useState(100);

  useEffect(() => {
    const highest = Math.max(100, ...spots.map((s) => Number(s.priceHour || 0)));
    setPriceMax(highest);
  }, [spots]);

  const [viewMode, setViewMode] = useState<"list" | "map">("list");

  const filtered = useMemo(() => {
    return spots.filter((s) => {
      const hitQ = !q || `${s.title} ${s.area} ${s.addressHint}`.toLowerCase().includes(q.toLowerCase());
      const hitArea = !area || s.area === area;
      const hitPrice = s.priceHour <= priceMax;
      return hitQ && hitArea && hitPrice;
    });
  }, [spots, q, area, priceMax]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">find parking</div>
          <div className="text-sm text-zinc-600">search, filter, and book in minutes</div>
        </div>
        <div className="hidden md:flex items-center gap-2 text-xs text-zinc-600">
          <Badge tone="Good">Get Parking</Badge>
          <Badge>earn money</Badge>
        </div>
      </div>

      <div className="mt-4">
        <FiltersBar
          q={q}
          setQ={setQ}
          area={area}
          setArea={setArea}
          priceMax={priceMax}
          setPriceMax={setPriceMax}
          viewMode={viewMode}
          setViewMode={setViewMode}
        />
      </div>

      <div className="mt-6">
        {viewMode === "map" ? (
          <BubbleMap spots={filtered} onOpen={(spot) => onOpenSpot(spot)} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filtered.map((s) => (
              <ListingCard key={s.id} spot={s} onOpen={onOpenSpot} />
            ))}
          </div>
        )}

        {filtered.length === 0 && (
          <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700">no results—try widening filters.</div>
        )}
      </div>
    </div>
  );
}

function HostPage({
  onCreated,
  user,
  onRequireLogin,
}: {
  onCreated: () => Promise<void> | void;
  user: User | null;
  onRequireLogin: () => void;
}) {
  const [errorMsg, setErrorMsg] = useState("");
  const [title, setTitle] = useState("");
  const [area, setArea] = useState("Côte-des-Neiges");
  const [priceHour, setPriceHour] = useState(4);
  const [priceDay, setPriceDay] = useState(20);
  const [addressHint, setAddressHint] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<Spot["difficulty"]>("Easy");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    return () => {
      if (photoPreview) {
        URL.revokeObjectURL(photoPreview);
      }
    };
  }, [photoPreview]);

  const publishListing = async () => {
    setErrorMsg("");
    setSubmitted(false);

    if (!user) {
      onRequireLogin();
      return;
    }

    const cleanTitle = title.trim();
    const cleanAddressHint = addressHint.trim();
    const hour = Number(priceHour);
    const day = Number(priceDay);

    if (photoFile && !photoFile.type.startsWith("image/")) {
      setErrorMsg("Please upload an image file.");
      return;
    }

    if (photoFile && photoFile.size > 5 * 1024 * 1024) {
      setErrorMsg("Image must be 5MB or smaller.");
      return;
    }

    if (!cleanTitle) {
      setErrorMsg("Please enter a title.");
      return;
    }

    if (!area.trim()) {
      setErrorMsg("Please select an area.");
      return;
    }

    if (!cleanAddressHint) {
      setErrorMsg("Please enter an address hint.");
      return;
    }

    if (!Number.isFinite(hour) || hour <= 0) {
      setErrorMsg("Price per hour must be greater than 0.");
      return;
    }

    if (!Number.isFinite(day) || day <= 0) {
      setErrorMsg("Price per day must be greater than 0.");
      return;
    }

    if (hour > 100) {
      setErrorMsg("Price per hour is too high. Please enter 100 CAD or less.");
      return;
    }

    if (day > 500) {
      setErrorMsg("Price per day is too high. Please enter 500 CAD or less.");
      return;
    }

    if (day < hour) {
      setErrorMsg("Price per day cannot be lower than price per hour.");
      return;
    }

    setSaving(true);

    const supabase = createClient();

    let photoUrl = null;

    if (photoFile) {
      const fileExt = photoFile.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("spot-photos")
        .upload(fileName, photoFile);

      if (uploadError) {
        console.error("Upload error:", uploadError);
        setErrorMsg("Failed to upload image.");
        setSaving(false);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from("spot-photos")
        .getPublicUrl(fileName);

      photoUrl = publicUrlData.publicUrl;
    }

    const { error } = await supabase.from("spots").insert({
      owner_id: user.id,
      title: cleanTitle,
      area,
      price_hour: hour,
      price_day: day,
      address_hint: cleanAddressHint,
      photo_url: photoUrl,
      difficulty,
    });

    setSaving(false);

    if (error) {
      console.error("Insert error:", error);
      setErrorMsg(error.message || "Failed to create listing.");
      return;
    }

    setSubmitted(true);
    setTitle("");
    setArea("Côte-des-Neiges");
    setPriceHour(4);
    setPriceDay(20);
    setAddressHint("");
    setPhotoFile(null);
    setPhotoPreview(null);
    setDifficulty("Easy");

    await onCreated();
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div>
        <div className="text-xl font-semibold">List a Spot</div>
        <div className="text-sm text-zinc-600">Earn money from your unused driveway or condo spot</div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="rounded-3xl border border-zinc-200 bg-white p-5">
          <div className="text-sm font-semibold">Create Listing</div>

          <div className="mt-4 grid gap-3">
            <label className="grid gap-1">
              <span className="text-xs text-zinc-500">Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="E.g., driveway spot near metro"
                className={`rounded-2xl border px-3 py-2 text-sm outline-none focus:ring-2 ${
                  errorMsg.toLowerCase().includes("title")
                    ? "border-red-300 focus:ring-red-100"
                    : "border-zinc-200 focus:ring-zinc-200"
                }`}
              />
            </label>

            <label className="grid gap-1">
              <span className="text-xs text-zinc-500">Area</span>
              <select
                value={area}
                onChange={(e) => setArea(e.target.value)}
                className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
              >
                <option value="Côte-des-Neiges">Côte-des-Neiges</option>
                <option value="Outremont">Outremont</option>
                <option value="Plateau">Plateau</option>
                <option value="Downtown">Downtown</option>
              </select>
            </label>

            <label className="grid gap-1">
              <span className="text-xs text-zinc-500">Price per hour (CAD)</span>
              <input
                type="number"
                min={1}
                value={priceHour}
                onChange={(e) => setPriceHour(Number(e.target.value))}
                className={`rounded-2xl border px-3 py-2 text-sm outline-none focus:ring-2 ${
                  errorMsg.toLowerCase().includes("hour")
                    ? "border-red-300 focus:ring-red-100"
                    : "border-zinc-200 focus:ring-zinc-200"
                }`}
              />
            </label>

            <label className="grid gap-1">
              <span className="text-xs text-zinc-500">Price per day (CAD)</span>
              <input
                type="number"
                min={1}
                value={priceDay}
                onChange={(e) => setPriceDay(Number(e.target.value))}
                className={`rounded-2xl border px-3 py-2 text-sm outline-none focus:ring-2 ${
                  errorMsg.toLowerCase().includes("day")
                    ? "border-red-300 focus:ring-red-100"
                    : "border-zinc-200 focus:ring-zinc-200"
                }`}
              />
            </label>

            <label className="grid gap-1">
              <span className="text-xs text-zinc-500">Address hint</span>
              <input
                value={addressHint}
                onChange={(e) => setAddressHint(e.target.value)}
                placeholder="E.g., near metro / behind church"
                className={`rounded-2xl border px-3 py-2 text-sm outline-none focus:ring-2 ${
                  errorMsg.toLowerCase().includes("address")
                    ? "border-red-300 focus:ring-red-100"
                    : "border-zinc-200 focus:ring-zinc-200"
                }`}
              />
            </label>

            <label className="grid gap-1">
              <span className="text-xs text-zinc-500">Photo (optional)</span>

              <input
                id="spot-photo-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setPhotoFile(file);

                  if (photoPreview) {
                    URL.revokeObjectURL(photoPreview);
                  }

                  if (file) {
                    setPhotoPreview(URL.createObjectURL(file));
                  } else {
                    setPhotoPreview(null);
                  }
                }}
              />

              <label
                htmlFor="spot-photo-upload"
                className="inline-flex w-fit cursor-pointer items-center rounded-2xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Choose Photo
              </label>

              {photoFile && (
                <div className="text-xs text-zinc-500">
                  selected: {photoFile.name}
                </div>
              )}

              {photoPreview && (
                <div className="mt-2 overflow-hidden rounded-2xl border border-zinc-200">
                  <img
                    src={photoPreview}
                    alt="preview"
                    className="h-40 w-full object-cover"
                  />
                </div>
              )}
            </label>

            <label className="grid gap-1">
              <span className="text-xs text-zinc-500">Difficulty</span>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as Spot["difficulty"])}
                className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
              >
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </label>

            <div className="rounded-2xl bg-zinc-50 border border-zinc-200 p-4 text-sm text-zinc-700">
              <div className="flex items-center gap-2 font-medium">
                <Home className="h-4 w-4" /> Owner-authorized only
              </div>
              <div className="mt-1 text-xs text-zinc-600">
                You control availability, rules, and who books. exact address stays hidden until a booking is confirmed.
              </div>
            </div>

            {!user && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                you need to log in before publishing a listing.
              </div>
            )}

            <button
              onClick={user ? publishListing : onRequireLogin}
              disabled={saving || (user !== null && !title.trim())}
              className="rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-300"
            >
              {saving ? "Publishing..." : user ? "Publish Listing" : "Log in to Publish"}
            </button>

            {errorMsg && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {errorMsg}
              </div>
            )}

            {submitted && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                Listing created successfully.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-5">
          <div className="text-sm font-semibold">What makes a high-performing listing</div>
          <div className="mt-4 grid gap-3 text-sm text-zinc-700">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-2xl bg-zinc-100 grid place-items-center">
                <Car className="h-4 w-4" />
              </div>
              <div>
                <div className="font-medium">Clear fit info</div>
                <div className="text-zinc-600 text-sm">Sedan vs SUV, max height, tight turns</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-2xl bg-zinc-100 grid place-items-center">
                <MapPin className="h-4 w-4" />
              </div>
              <div>
                <div className="font-medium">Simple directions</div>
                <div className="text-zinc-600 text-sm">Entry side, gate code flow, landmarks</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-2xl bg-zinc-100 grid place-items-center">
                <Star className="h-4 w-4" />
              </div>
              <div>
                <div className="font-medium">Ratings build trust</div>
                <div className="text-zinc-600 text-sm">Fast replies + reliable availability</div>
              </div>
            </div>
          </div>
          <div className="mt-6 rounded-2xl bg-zinc-50 border border-zinc-200 p-4 text-xs text-zinc-600">
            Tip: Start with a tight launch area (one neighborhood) to build liquidity faster.
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatPage({ onProposeDeal }: { onProposeDeal: (amount: number) => void }) {
  const [draft, setDraft] = useState("");
  const [msgs, setMsgs] = useState(MOCK_MESSAGES);

  const send = () => {
    const t = draft.trim();
    if (!t) return;
    setMsgs((m) => [...m, { from: "you", side: "me", text: t }]);
    setDraft("");
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="grid gap-6 md:grid-cols-[320px_1fr]">
        <div className="rounded-3xl border border-zinc-200 bg-white overflow-hidden">
          <div className="p-4 border-b border-zinc-200">
            <div className="text-sm font-semibold">messages</div>
            <div className="text-xs text-zinc-500">your conversations</div>
          </div>
          <div className="p-2">
            <button className="w-full text-left p-3 rounded-2xl bg-zinc-100">
              <div className="text-sm font-semibold">alex</div>
              <div className="text-xs text-zinc-600 truncate">hi! what time are you arriving?</div>
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white overflow-hidden">
          <div className="p-4 border-b border-zinc-200 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">alex</div>
              <div className="text-xs text-zinc-500">convo head • booking details</div>
            </div>
            <button
              onClick={() => onProposeDeal(30)}
              className="px-3 py-2 rounded-xl bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800"
            >
              propose deal for {money(30)}
            </button>
          </div>

          <div className="p-4 h-[360px] overflow-auto space-y-2">
            {msgs.map((m, idx) => (
              <div key={idx} className={cx("flex", m.side === "me" ? "justify-end" : "justify-start")}>
                <div
                  className={cx(
                    "max-w-[78%] rounded-2xl px-3 py-2 text-sm",
                    m.side === "me" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-800"
                  )}
                >
                  {m.text}
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 border-t border-zinc-200">
            <div className="flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="type a message"
                className="flex-1 rounded-2xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                onKeyDown={(e) => (e.key === "Enter" ? send() : null)}
              />
              <button onClick={send} className="px-4 py-2 rounded-2xl bg-zinc-900 text-white text-sm hover:bg-zinc-800">
                send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfilePage({
  hasPaymentMethod,
  setHasPaymentMethod,
  onGoBookings,
}: {
  hasPaymentMethod: boolean;
  setHasPaymentMethod: React.Dispatch<React.SetStateAction<boolean>>;
  onGoBookings: () => void;
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="grid gap-6 md:grid-cols-[1fr_360px]">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xl font-semibold">Your profile</div>
              <div className="text-sm text-zinc-600">ratings, activity, and credibility</div>
            </div>
            <div className="flex gap-2">
              <button className="px-3 py-2 rounded-xl bg-zinc-100 text-sm">edit</button>
              <button onClick={onGoBookings} className="px-3 py-2 rounded-xl bg-zinc-900 text-white text-sm">
                Bookings
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-zinc-200 p-4">
              <div className="text-sm font-semibold">stats</div>
              <div className="mt-3 grid gap-2 text-sm text-zinc-700">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-600">Parks completed</span>
                  <span className="font-semibold">12</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-600">Star rating</span>
                  <span className="font-semibold">4.7</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-600">On-time rate</span>
                  <span className="font-semibold">98%</span>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-200 p-4">
              <div className="text-sm font-semibold">payment</div>
              <div className="mt-3 rounded-2xl bg-zinc-50 border border-zinc-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-zinc-700 flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    <span>{hasPaymentMethod ? "card ending •••• 1234" : "no payment method"}</span>
                  </div>
                  <button
                    onClick={() => setHasPaymentMethod(true)}
                    className={cx(
                      "text-xs font-medium px-3 py-2 rounded-xl",
                      hasPaymentMethod ? "bg-zinc-100 text-zinc-700" : "bg-zinc-900 text-white"
                    )}
                  >
                    {hasPaymentMethod ? "update" : "add"}
                  </button>
                </div>
                <div className="mt-2 text-xs text-zinc-500">Required to confirm bookings</div>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-3xl border border-zinc-200 p-4">
            <div className="text-sm font-semibold">Reviews</div>
            <div className="mt-3 grid gap-3">
              <div className="rounded-2xl bg-zinc-50 border border-zinc-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Alex</div>
                  <div className="text-xs text-zinc-600 inline-flex items-center gap-1">
                    <Star className="h-4 w-4" /> 4/5
                  </div>
                </div>
                <div className="mt-2 text-sm text-zinc-700">Smooth booking and easy entry. Would use again.</div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-6 h-fit">
          <div className="text-sm font-semibold">Wallet</div>
          <div className="mt-3 rounded-2xl bg-zinc-50 border border-zinc-200 p-4">
            <div className="text-xs text-zinc-500">Available balance</div>
            <div className="mt-1 text-2xl font-semibold">{money(30)}</div>
            <div className="mt-2 text-xs text-zinc-600">Payouts and holds will appear here.</div>
          </div>
          <div className="mt-4 text-xs text-zinc-600">Future: host payouts, tax summaries, and withdrawal settings.</div>
        </div>
      </div>
    </div>
  );
}

function BookingCard({
  b,
  onCancel,
  onBookAgain,
  onChat,
  onReview,
}: {
  b: Booking;
  onCancel: (b: Booking) => void;
  onBookAgain: (spot: Spot) => void;
  onChat: (b: Booking) => void;
  onReview: (b: Booking) => void;
}) {
  const startAt = b.startAt instanceof Date ? b.startAt : new Date(b.startAt);
  const canCancel = b.status === "Confirmed" && hoursBetween(new Date(), startAt) >= 2;

  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{b.spot.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {b.spot.area}
            </span>
            <span className="text-zinc-300">•</span>
            <span>{fmtDateTime(startAt)}</span>
            <span className="text-zinc-300">•</span>
            <span>{b.durationHours}h</span>
            <span className="text-zinc-300">•</span>
            <span className="font-medium">{money(b.total)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={b.status === "Cancelled" ? "Bad" : b.isPast ? "Neutral" : "Info"}>
            {b.status === "Cancelled" ? "Cancelled" : b.isPast ? "Previous" : `Current • ${countdownLabel(startAt)}`}
          </Badge>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => onBookAgain(b.spot)}
          className="px-3 py-2 rounded-xl bg-zinc-100 text-zinc-800 text-xs font-medium hover:bg-zinc-200 inline-flex items-center gap-2"
        >
          <Repeat2 className="h-4 w-4" />
          book again
        </button>
        <button
          onClick={() => onChat(b)}
          className="px-3 py-2 rounded-xl bg-zinc-100 text-zinc-800 text-xs font-medium hover:bg-zinc-200 inline-flex items-center gap-2"
        >
          <MessageSquare className="h-4 w-4" />
          chat
        </button>

        <button
          onClick={() => onReview(b)}
          disabled={!b.isPast || b.status !== "Confirmed"}
          className={cx(
            "px-3 py-2 rounded-xl text-xs font-medium inline-flex items-center gap-2",
            b.isPast && b.status === "Confirmed"
              ? "bg-zinc-100 text-zinc-800 hover:bg-zinc-200"
              : "bg-zinc-100 text-zinc-400 cursor-not-allowed"
          )}
        >
          <Star className="h-4 w-4" />
          leave review
        </button>

        <button
          onClick={() => onCancel(b)}
          disabled={!canCancel}
          className={cx(
            "px-3 py-2 rounded-xl text-xs font-medium inline-flex items-center gap-2",
            canCancel ? "bg-rose-50 text-rose-700 hover:bg-rose-100" : "bg-zinc-100 text-zinc-400 cursor-not-allowed"
          )}
        >
          <X className="h-4 w-4" />
          cancel
        </button>

        <div className="ml-auto px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-xs text-zinc-700 inline-flex items-center gap-2">
          <ReceiptText className="h-4 w-4" />
          receipt
        </div>
      </div>

      {!canCancel && !b.isPast && b.status === "Confirmed" && (
        <div className="mt-3 text-xs text-zinc-500">cancellation allowed until 2 hours before start time.</div>
      )}
    </div>
  );
}

function BookingsPage({
  bookings,
  onCancel,
  onBookAgain,
  onChat,
  onReview,
}: {
  bookings: Booking[];
  onCancel: (b: Booking) => void;
  onBookAgain: (spot: Spot) => void;
  onChat: (b: Booking) => void;
  onReview: (b: Booking) => void;
}) {
  const now = new Date();
  const enriched = useMemo(() => {
    return bookings
      .map((b) => ({
        ...b,
        startAt: b.startAt instanceof Date ? b.startAt : new Date(b.startAt),
      }))
      .map((b) => ({
        ...b,
        isPast: b.startAt.getTime() < now.getTime(),
      }))
      .sort((a, b) => b.startAt.getTime() - a.startAt.getTime());
  }, [bookings]);

  const current = enriched.filter((b) => !b.isPast);
  const previous = enriched.filter((b) => b.isPast);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">bookings</div>
          <div className="text-sm text-zinc-600">current and previous (newest first)</div>
        </div>
      </div>

      <div className="mt-6 grid gap-8">
        <div>
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">current</div>
            <Badge tone="Info">cancel until 2h before</Badge>
          </div>
          <div className="mt-3 grid gap-3">
            {current.length === 0 ? (
              <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700">no current bookings.</div>
            ) : (
              current.map((b) => (
                <BookingCard
                  key={b.id}
                  b={b}
                  onCancel={onCancel}
                  onBookAgain={onBookAgain}
                  onChat={onChat}
                  onReview={onReview}
                />
              ))
            )}
          </div>
        </div>

        <div>
          <div className="text-sm font-semibold">previous</div>
          <div className="mt-3 grid gap-3">
            {previous.length === 0 ? (
              <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700">no previous bookings.</div>
            ) : (
              previous.map((b) => (
                <BookingCard
                  key={b.id}
                  b={b}
                  onCancel={onCancel}
                  onBookAgain={onBookAgain}
                  onChat={onChat}
                  onReview={onReview}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LoginPage({
  onSuccess,
}: {
  onSuccess: () => void;
}) {
  const supabase = createClient();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          setMessage(error.message);
          return;
        }

        onSuccess();
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) {
          setMessage(error.message);
          return;
        }

        setMessage("account created. you can now log in.");
        setMode("login");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="rounded-3xl border border-zinc-200 bg-white p-6">
        <div className="text-2xl font-semibold">
          {mode === "login" ? "log in" : "create account"}
        </div>
        <div className="mt-2 text-sm text-zinc-600">
          you need an account to publish a parking spot
        </div>

        <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
          <label className="grid gap-1">
            <span className="text-xs text-zinc-500">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs text-zinc-500">Password</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-300"
          >
            {loading
              ? "please wait..."
              : mode === "login"
              ? "log in"
              : "create account"}
          </button>
        </form>

        {message && (
          <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
            {message}
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            setMessage("");
            setMode(mode === "login" ? "signup" : "login");
          }}
          className="mt-4 text-sm text-zinc-600 underline"
        >
          {mode === "login"
            ? "need an account? sign up"
            : "already have an account? log in"}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [view, setView] = useState<View>("home");
  const [selected, setSelected] = useState<Spot | null>(null);
  const [hasPaymentMethod, setHasPaymentMethod] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutPayload, setCheckoutPayload] = useState<CheckoutPayload | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setView("home");
    setToast("Logged out");
    setTimeout(() => setToast(null), 2200);
  };

  const loadSpots = async () => {
    const supabase = createClient();

    const { data, error } = await supabase.from("spots").select("*");

    if (error) {
      console.error("Supabase error:", error);
      setToast("Failed to load spots");
      return;
    }

    console.log("DATA FROM SUPABASE:", data);

    setSpots(
      (data || []).map((s) => ({
        ...s,
        priceHour: Number(s.price_hour),
        priceDay: Number(s.price_day),
        addressHint: s.address_hint ?? "",
        difficulty: s.difficulty ?? "Easy",
        description: s.description ?? "",
        availability: s.availability ?? {
          mon: ["09:00", "17:00"],
          tue: ["09:00", "17:00"],
          wed: ["09:00", "17:00"],
          thu: ["09:00", "17:00"],
          fri: ["09:00", "17:00"],
          sat: ["10:00", "16:00"],
          sun: null,
        },
        host: { name: "Host", rating: 4.8, reviews: 0 },
        features: s.features ?? [],
        photo: s.photo_url ?? null,
        lat: Number(s.lat ?? 45.5),
        lng: Number(s.lng ?? -73.6),
      }))
    );
  };

  useEffect(() => {
    const supabase = createClient();

    const loadUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setUser(user ?? null);
      setAuthLoading(false);
    };

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const openSpot = (spot: Spot) => {
    setSelected(spot);
    setView("detail");
  };

  const startCheckout = (payload: CheckoutPayload) => {
    setCheckoutPayload(payload);
    setCheckoutOpen(true);
  };

  const confirmPayment = () => {
    const p = checkoutPayload;
    if (!p) return;

    const newBooking: Booking = {
      id: `bk-${Math.random().toString(36).slice(2, 10)}`,
      spot: p.spot,
      startAt: p.startAt,
      durationHours: p.durationHours,
      subtotal: p.subtotal,
      tax: p.tax,
      total: p.total,
      status: "Confirmed",
    };

    setBookings((prev) => [newBooking, ...prev]);
    setCheckoutOpen(false);
    setView("bookings");
    setToast(`Booking confirmed: ${money(p.total)}`);
    setTimeout(() => setToast(null), 2800);
  };

  const proposeDeal = (amount: number) => {
    const spot = spots[0];
    if (!spot) return;
    const subtotal = amount;
    const tax = subtotal * (TAX.gst + TAX.qst);
    const total = subtotal + tax;
    setCheckoutPayload({
      spot,
      day: "mon",
      durationHours: 1,
      subtotal,
      tax,
      total,
      startAt: nextOccurrence("mon", spot.availability?.mon?.[0] || "09:00"),
    });
    setCheckoutOpen(true);
  };

  const cancelBooking = (b: Booking) => {
    setBookings((prev) =>
      prev.map((x): Booking => (x.id === b.id ? { ...x, status: "Cancelled" } : x))
    );
    setToast("Booking cancelled");
    setTimeout(() => setToast(null), 2200);
  };

  const goChat = () => {
    setView("chat");
  };

  const leaveReview = () => {
    setToast("Review submitted (demo)");
    setTimeout(() => setToast(null), 2200);
  };

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <TopNav
        view={view === "detail" ? "search" : view}
        setView={(v) => {
          setSelected(null);
          setView(v);
        }}
        user={user}
        onLogout={handleLogout}
      />

      {view === "home" && (
        <>
          <Hero
            onGetParking={() => setView("search")}
            onEarnMoney={() => setView(user ? "host" : "login")}
          />
          <div className="mx-auto max-w-6xl px-4 pb-12">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl border border-zinc-200 p-5">
                <div className="flex items-center gap-2 font-semibold">
                  <Search className="h-4 w-4" /> Search
                </div>
                <div className="mt-2 text-sm text-zinc-600">filter by neighborhood, price, and availability.</div>
              </div>
              <div className="rounded-3xl border border-zinc-200 p-5">
                <div className="flex items-center gap-2 font-semibold">
                  <MessageSquare className="h-4 w-4" /> Chat
                </div>
                <div className="mt-2 text-sm text-zinc-600">confirm details with hosts before arrival.</div>
              </div>
              <div className="rounded-3xl border border-zinc-200 p-5">
                <div className="flex items-center gap-2 font-semibold">
                  <Wallet className="h-4 w-4" /> pay
                </div>
                <div className="mt-2 text-sm text-zinc-600">secure payment flow; address stays masked until booking.</div>
              </div>
            </div>

            <div className="mt-10 rounded-3xl border border-zinc-200 bg-zinc-50 p-6">
              <div className="text-sm font-semibold">launch note (demo)</div>
              <div className="mt-2 text-sm text-zinc-700 leading-relaxed">
                this prototype demonstrates core flows: entry point (get parking / earn money), search + filters, listing
                details, map browse, checkout, and bookings.
              </div>
            </div>
          </div>
        </>
      )}

      {view === "search" && <SearchPage spots={spots} onOpenSpot={openSpot} />}

      {view === "detail" && selected && (
        <SpotDetail spot={selected} onBack={() => setView("search")} onCheckout={startCheckout} />
      )}

      {view === "host" && (
        <HostPage
          onCreated={loadSpots}
          user={user}
          onRequireLogin={() => setView("login")}
        />
      )}

      {view === "chat" && <ChatPage onProposeDeal={proposeDeal} />}

      {view === "bookings" && (
        <BookingsPage
          bookings={bookings}
          onCancel={cancelBooking}
          onBookAgain={(spot) => openSpot(spot)}
          onChat={goChat}
          onReview={leaveReview}
        />
      )}

      {view === "profile" && (
        <ProfilePage
          hasPaymentMethod={hasPaymentMethod}
          setHasPaymentMethod={setHasPaymentMethod}
          onGoBookings={() => setView("bookings")}
        />
      )}

      {view === "login" && (
        <LoginPage
          onSuccess={() => {
            setView("host");
            setToast("Logged in");
            setTimeout(() => setToast(null), 2200);
          }}
        />
      )}

      <CheckoutModal
        open={checkoutOpen}
        payload={checkoutPayload}
        hasPaymentMethod={hasPaymentMethod}
        onClose={() => setCheckoutOpen(false)}
        onConfirm={confirmPayment}
      />

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <div className="rounded-2xl bg-zinc-900 text-white px-4 py-3 text-sm shadow-lg">{toast}</div>
        </div>
      )}

      <footer className="border-t border-zinc-200">
        <div className="mx-auto max-w-6xl px-4 py-8 text-xs text-zinc-600 flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
          <div>© 2026 GigPark • Prototype</div>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" /> Safety first
            </span>
            <span className="text-zinc-300">•</span>
            <span>No address reveal before booking</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

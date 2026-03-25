'use client';

import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import React, { useEffect, useMemo, useRef, useState } from "react";
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
  owner_id?: string;
  is_active?: boolean;
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
  { from: "Alex", side: "them", text: "Hi! What time are you arriving?" },
  { from: "You", side: "me", text: "Around 9:15 a.m. Is the driveway entrance on the left?" },
  { from: "Alex", side: "them", text: "Yes, on the left side. I will send the exact pin after booking." },
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

type View =
  | "home"
  | "search"
  | "detail"
  | "host"
  | "bookings"
  | "my-listings"
  | "chat"
  | "profile"
  | "login";

function TopNav({
  view,
  setView,
  user,
  onLogout,
  onRequireLoginFor,
  onOpenLogin,
}: {
  view: View;
  setView: (view: View) => void;
  user: User | null;
  onLogout: () => Promise<void> | void;
  onRequireLoginFor: (view: View) => void;
  onOpenLogin: () => void;
}) {
  const tabs: { id: View; label: string }[] = [
    { id: "home", label: "Home" },
    { id: "search", label: "Find parking" },
    { id: "host", label: "List a spot" },
    { id: "my-listings", label: "My listings" },
    { id: "bookings", label: "Bookings" },
    { id: "chat", label: "Chat" },
    { id: "profile", label: "Profile" },
  ];

  return (
    <div className="sticky top-0 z-40 border-b border-zinc-200 bg-white/80 backdrop-blur">
      <div className="flex w-full justify-center px-4 py-3">
        <div className="flex w-full max-w-6xl items-center justify-between">
          <button
            onClick={() => setView("home")}
            className="flex items-center gap-2 text-left"
          >
            <img
              src="/20260122 - Logo.png"
              alt="GigPark"
              className="h-9 w-9 rounded-2xl object-cover"
            />
            <div className="leading-tight text-left">
              <div className="text-sm font-semibold">GigPark</div>
              <div className="text-xs text-zinc-500">
                Peer-to-peer residential parking
              </div>
            </div>
          </button>

          <div className="hidden items-center gap-1 md:flex">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  if (t.id === "profile" && !user) {
                    onRequireLoginFor("profile");
                    return;
                  }

                  if (
                    (t.id === "bookings" ||
                      t.id === "chat" ||
                      t.id === "my-listings") &&
                    !user
                  ) {
                    onRequireLoginFor(t.id);
                    return;
                  }

                  setView(t.id);
                }}
                className={cx(
                  "rounded-xl px-3 py-2 text-sm",
                  view === t.id
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-700 hover:bg-zinc-100"
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
                Log out
              </button>
            ) : (
              <button
                onClick={onOpenLogin}
                className="ml-2 inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800"
              >
                <LogIn className="h-4 w-4" />
                Log in
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
              onClick={() => (user ? setView("host") : onRequireLoginFor("host"))}
              className={cx(
                "grid h-9 w-9 place-items-center rounded-xl",
                view === "host" ? "bg-zinc-900 text-white" : "bg-zinc-100"
              )}
              aria-label="Host"
            >
              <Plus className="h-4 w-4" />
            </button>

            <button
              onClick={() =>
                user ? setView("my-listings") : onRequireLoginFor("my-listings")
              }
              className={cx(
                "grid h-9 w-9 place-items-center rounded-xl",
                view === "my-listings" ? "bg-zinc-900 text-white" : "bg-zinc-100"
              )}
              aria-label="My listings"
            >
              <Home className="h-4 w-4" />
            </button>

            <button
              onClick={() =>
                user ? setView("bookings") : onRequireLoginFor("bookings")
              }
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
                onClick={onOpenLogin}
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
            GigPark helps residents rent out unused driveways and condo spots so drivers can book reliable parking by the hour, day, or month.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={onGetParking}
              className="px-5 py-3 rounded-2xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800"
            >
              Get parking
            </button>
            <button
              onClick={onEarnMoney}
              className="px-5 py-3 rounded-2xl bg-white border border-zinc-300 text-zinc-900 text-sm font-medium hover:bg-zinc-50"
            >
              Earn money
            </button>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-zinc-200 p-3">
              <div className="text-xs text-zinc-500">Average booking</div>
              <div className="mt-1 text-lg font-semibold">10-30 min</div>
            </div>
            <div className="rounded-2xl border border-zinc-200 p-3">
              <div className="text-xs text-zinc-500">Trust</div>
              <div className="mt-1 text-lg font-semibold">Ratings + Chat</div>
            </div>
            <div className="rounded-2xl border border-zinc-200 p-3">
              <div className="text-xs text-zinc-500">Payments</div>
              <div className="mt-1 text-lg font-semibold">In-app</div>
            </div>
          </div>
        </div>
        <div className="relative">
          <div className="rounded-3xl overflow-hidden border border-zinc-200 shadow-sm">
            <img
              src="https://images.unsplash.com/photo-1528920304568-6f1f8a4d52af?auto=format&fit=crop&w=1600&q=60"
              alt="Street parking"
              className="h-[420px] w-full object-cover"
            />
          </div>
          <div className="absolute -bottom-5 left-6 right-6 rounded-3xl bg-white border border-zinc-200 shadow-sm p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">Driveway Spot — 2 Min to HEC</div>
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
                Book now
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
              <option value="">All Areas</option>
              <option value="Côte-des-Neiges">Côte-des-Neiges</option>
              <option value="Outremont">Outremont</option>
              <option value="Plateau">Plateau</option>
              <option value="Downtown">Downtown</option>
            </select>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-zinc-200 px-3 py-2">
            <SlidersHorizontal className="h-4 w-4 text-zinc-600" />
            <span className="text-sm">Max {money(priceMax)}/hr</span>
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
              {viewMode === "list" ? "Switch to map" : "Switch to list"}
            </button>
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
        <Badge tone="Info">Filters: Date • Price • Location</Badge>
        <Badge>No exact address until booking</Badge>
        <Badge tone="Good">Owner-authorized spots only</Badge>
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
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          <div className="text-sm font-semibold">Map search</div>
        </div>
        <div className="text-xs text-zinc-600">
          Bubble size = price • Badge color = difficulty
        </div>
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
          <span>Map filters: price • availability • car size</span>
        </div>
      </div>
    </div>
  );
}

function SpotDetail({
  spot,
  user,
  onBack,
  onCheckout,
  onRequireLogin,
}: {
  spot: Spot;
  user: User | null;
  onBack: () => void;
  onCheckout: (payload: CheckoutPayload) => void;
  onRequireLogin: () => void;
}) {
  const [day, setDay] = useState<DayKey>("mon");
  const [duration, setDuration] = useState("2h");

  const av = spot.availability?.[day];
  const durationHours =
    duration === "1h" ? 1 :
    duration === "2h" ? 2 :
    duration === "4h" ? 4 :
    duration === "8h" ? 8 : 24;

  const subtotal = spot.priceHour * durationHours;
  const tax = subtotal * (TAX.gst + TAX.qst);
  const total = subtotal + tax;

  const handleBookNow = () => {
    if (!user) {
      onRequireLogin();
      return;
    }

    onCheckout({
      spot,
      day,
      durationHours,
      subtotal,
      tax,
      total,
      startAt: nextOccurrence(day, av?.[0] || "09:00"),
    });
  };

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
              <div className="mt-2 text-sm text-zinc-600">
                {spot.host.name} • Responds quickly • Exact address provided after booking
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-5 h-fit">
          <div className="text-sm text-zinc-600">Price</div>
          <div className="mt-1 text-2xl font-semibold">{money(spot.priceHour)}/hr</div>
          <div className="mt-1 text-sm text-zinc-600">{money(spot.priceDay)}/day</div>

          <div className="mt-4 grid gap-3">
            <div>
              <div className="text-xs text-zinc-500 mb-1">Choose day</div>
              <div className="flex flex-wrap gap-2">
                {days.map((d) => (
                  <button
                    key={d.charAt(0).toUpperCase() + d.slice(1)}
                    onClick={() => setDay(d)}
                    className={cx(
                      "px-3 py-2 rounded-xl text-sm",
                      day === d ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700"
                    )}
                  >
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs text-zinc-500 mb-1">Availability</div>
              <div className="flex items-center gap-2 text-sm text-zinc-700">
                <Clock className="h-4 w-4" />
                <span>{av ? `${av[0]}–${av[1]}` : "Not available"}</span>
              </div>
            </div>

            <div>
              <div className="text-xs text-zinc-500 mb-1">Duration</div>
              <div className="grid grid-cols-5 gap-2">
                {[
                  { k: "1h" },
                  { k: "2h" },
                  { k: "4h" },
                  { k: "8h" },
                  { k: "24h" },
                ].map((x) => (
                  <button
                    key={x.k}
                    onClick={() => setDuration(x.k)}
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
                <span className="text-zinc-600">Subtotal</span>
                <span className="font-semibold">{money(subtotal)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm">
                <span className="text-zinc-600">GST + QST</span>
                <span className="font-semibold">{money(tax)}</span>
              </div>
              <div className="mt-2 pt-2 border-t border-zinc-200 flex items-center justify-between text-sm">
                <span className="text-zinc-600">Total</span>
                <span className="font-semibold">{money(total)}</span>
              </div>
              <div className="mt-2 text-xs text-zinc-500">
                Final details are confirmed in chat. Payment is required to confirm the booking.
              </div>
            </div>

            <button
              disabled={!av}
              onClick={handleBookNow}
              className={cx(
                "w-full px-4 py-3 rounded-2xl text-sm font-medium",
                av ? "bg-zinc-900 text-white hover:bg-zinc-800" : "bg-zinc-200 text-zinc-500 cursor-not-allowed"
              )}
            >
              {user ? "Book and pay" : "Log in to book"}
            </button>
          </div>

          <div className="mt-4 text-xs text-zinc-600 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            The address stays masked until booking.
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
              <div className="text-sm font-semibold">Checkout</div>
              <div className="text-xs text-zinc-500">Pay to confirm booking</div>
            </div>
          </div>
          <button onClick={onClose} className="text-sm text-zinc-600 hover:text-zinc-900">
            Close
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
              <span>{day.charAt(0).toUpperCase() + day.slice(1)}</span>
              <span className="text-zinc-300">•</span>
              <span>{durationHours} hours</span>
            </div>
            <div className="mt-2 text-xs text-zinc-500">Starts: {fmtDateTime(startAt)}</div>
          </div>

          <div className="grid gap-2">
            <div className="text-xs text-zinc-500">Payment method</div>
            <div className="rounded-2xl border border-zinc-200 p-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <CreditCard className="h-4 w-4" />
                <span>{hasPaymentMethod ? "Card ending •••• 1234" : "No payment method"}</span>
              </div>
              <button className="text-sm text-zinc-700 hover:text-zinc-900">Change</button>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-600">Subtotal</span>
              <span className="font-semibold">{money(subtotal)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="text-zinc-600">GST + QST</span>
              <span className="font-semibold">{money(tax)}</span>
            </div>
            <div className="mt-2 pt-2 border-t border-zinc-200 flex items-center justify-between text-sm">
              <span className="text-zinc-600">Total</span>
              <span className="font-semibold">{money(total)}</span>
            </div>
            <div className="mt-2 text-xs text-zinc-500">Funds are held until the booking window starts.</div>
          </div>

          <button
            onClick={onConfirm}
            disabled={!hasPaymentMethod}
            className={cx(
              "w-full px-4 py-3 rounded-2xl text-sm font-medium",
              hasPaymentMethod ? "bg-zinc-900 text-white hover:bg-zinc-800" : "bg-zinc-200 text-zinc-500 cursor-not-allowed"
            )}
          >
            Confirm payment
          </button>

          {!hasPaymentMethod && (
            <div className="text-xs text-rose-600">Add a payment method in profile to complete checkout.</div>
          )}

          <div className="text-xs text-zinc-600">By paying, you agree that this is a private, owner-authorized parking space.</div>
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
          <div className="text-xl font-semibold">Find parking</div>
          <div className="text-sm text-zinc-600">Search, filter, and book in minutes</div>
        </div>
        <div className="hidden md:flex items-center gap-2 text-xs text-zinc-600">
          <Badge tone="Good">Get parking</Badge>
          <Badge>Earn money</Badge>
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
          <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700">
            No results. Try widening your filters.
          </div>
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
      if (photoPreview && photoPreview.startsWith("blob:")) {
        URL.revokeObjectURL(photoPreview);
      }
    };
  }, [photoPreview]);

  const publishListing = async () => {
    if (saving) return;

    setSaving(true);
    setErrorMsg("");
    setSubmitted(false);

    try {
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

      const supabase = createClient();

      const {
        data: { user: currentUser },
        error: getUserError,
      } = await supabase.auth.getUser();

      if (getUserError || !currentUser) {
        setErrorMsg("Your session was not found. Please log in again.");
        return;
      }

      let photoUrl: string | null = null;

      if (photoFile) {
        const fileExt = photoFile.name.split(".").pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("spot-photos")
          .upload(fileName, photoFile);

        if (uploadError) {
          console.error("Upload error:", uploadError);
          setErrorMsg("Failed to upload image.");
          return;
        }

        const { data: publicUrlData } = supabase.storage
          .from("spot-photos")
          .getPublicUrl(fileName);

        photoUrl = publicUrlData.publicUrl;
      }

      const payload = {
        owner_id: currentUser.id,
        is_active: true,
        title: cleanTitle,
        area,
        price_hour: hour,
        price_day: day,
        address_hint: cleanAddressHint,
        photo_url: photoUrl,
        difficulty,
        description: "",
      };

      const { error } = await supabase.from("spots").insert(payload);

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

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      await onCreated();
    } catch (err) {
      console.error("Publish listing unexpected error:", err);
      setErrorMsg("Something went wrong while creating the listing.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div>
        <div className="text-xl font-semibold">List a spot</div>
        <div className="text-sm text-zinc-600">Earn money from your unused driveway or condo spot</div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="rounded-3xl border border-zinc-200 bg-white p-5">
          <div className="text-sm font-semibold">Create listing</div>

          <div className="mt-4 grid gap-3">
            <label className="grid gap-1">
              <span className="text-xs text-zinc-500">Title</span>
              <input
                value={title}
                onChange={(e) => {
                  setSubmitted(false);
                  setErrorMsg("");
                  setTitle(e.target.value);
                }}
                placeholder="For example, driveway spot near metro"
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
                onChange={(e) => {
                  setSubmitted(false);
                  setErrorMsg("");
                  setArea(e.target.value);
                }}
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
                onChange={(e) => {
                  setSubmitted(false);
                  setErrorMsg("");
                  setPriceHour(Number(e.target.value));
                }}
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
                onChange={(e) => {
                  setSubmitted(false);
                  setErrorMsg("");
                  setPriceDay(Number(e.target.value));
                }}
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
                onChange={(e) => {
                  setSubmitted(false);
                  setErrorMsg("");
                  setAddressHint(e.target.value);
                }}
                placeholder="For example, near metro / behind church"
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
                ref={fileInputRef}
                id="spot-photo-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  setSubmitted(false);
                  setErrorMsg("");
                  const file = e.target.files?.[0] || null;
                  setPhotoFile(file);

                  if (photoPreview && photoPreview.startsWith("blob:")) {
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
                Choose photo
              </label>

              {photoFile && (
                <div className="text-xs text-zinc-500">
                  Selected: {photoFile.name}
                </div>
              )}

              {photoPreview && (
                <div className="mt-2 overflow-hidden rounded-2xl border border-zinc-200">
                  <img
                    src={photoPreview}
                    alt="Preview"
                    className="h-40 w-full object-cover"
                  />
                </div>
              )}
            </label>

            <label className="grid gap-1">
              <span className="text-xs text-zinc-500">Difficulty</span>
              <select
                value={difficulty}
                onChange={(e) => {
                  setSubmitted(false);
                  setErrorMsg("");
                  setDifficulty(e.target.value as Spot["difficulty"]);
                }}
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
                You control availability, rules, and who books. The exact address stays hidden until a booking is confirmed.
              </div>
            </div>

            {!user && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                You need to log in before publishing a listing.
              </div>
            )}

            <button
              onClick={user ? publishListing : onRequireLogin}
              disabled={
                saving ||
                (user !== null &&
                  (!title.trim() ||
                    !addressHint.trim() ||
                    !Number.isFinite(Number(priceHour)) ||
                    Number(priceHour) <= 0 ||
                    !Number.isFinite(Number(priceDay)) ||
                    Number(priceDay) <= 0))
              }
              className="rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-300"
            >
              {saving ? "Publishing..." : user ? "Publish listing" : "Log in to publish"}
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
    setMsgs((m) => [...m, { from: "You", side: "me", text: t }]);
    setDraft("");
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="grid gap-6 md:grid-cols-[320px_1fr]">
        <div className="rounded-3xl border border-zinc-200 bg-white overflow-hidden">
          <div className="p-4 border-b border-zinc-200">
            <div className="text-sm font-semibold">Messages</div>
            <div className="text-xs text-zinc-500">Your conversations</div>
          </div>
          <div className="p-2">
            <button className="w-full text-left p-3 rounded-2xl bg-zinc-100">
              <div className="text-sm font-semibold">Alex</div>
              <div className="text-xs text-zinc-600 truncate">Hi! What time are you arriving?</div>
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white overflow-hidden">
          <div className="p-4 border-b border-zinc-200 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Alex</div>
              <div className="text-xs text-zinc-500">Conversation thread • Booking details</div>
            </div>
            <button
              onClick={() => onProposeDeal(30)}
              className="px-3 py-2 rounded-xl bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800"
            >
              Propose deal for {money(30)}
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
                placeholder="Type a message"
                className="flex-1 rounded-2xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                onKeyDown={(e) => (e.key === "Enter" ? send() : null)}
              />
              <button onClick={send} className="px-4 py-2 rounded-2xl bg-zinc-900 text-white text-sm hover:bg-zinc-800">
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfilePage({
  user,
  hasPaymentMethod,
  setHasPaymentMethod,
  onGoBookings,
  onRequireLogin,
}: {
  user: User | null;
  hasPaymentMethod: boolean;
  setHasPaymentMethod: React.Dispatch<React.SetStateAction<boolean>>;
  onGoBookings: () => void;
  onRequireLogin: () => void;
}) {
  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-3xl border border-zinc-200 bg-white p-8 text-center">
          <div className="text-2xl font-semibold">Profile</div>
          <div className="mt-2 text-sm text-zinc-600">
            Log in to view your payment method, bookings, ratings, and wallet.
          </div>

          <button
            onClick={onRequireLogin}
            className="mt-6 rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Log in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="grid gap-6 md:grid-cols-[1fr_360px]">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xl font-semibold">Your profile</div>
              <div className="text-sm text-zinc-600">{user.email}</div>
            </div>
            <div className="flex gap-2">
              <button className="px-3 py-2 rounded-xl bg-zinc-100 text-sm">Edit</button>
              <button onClick={onGoBookings} className="px-3 py-2 rounded-xl bg-zinc-900 text-white text-sm">
                Bookings
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-zinc-200 p-4">
              <div className="text-sm font-semibold">Stats</div>
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
              <div className="text-sm font-semibold">Payment</div>
              <div className="mt-3 rounded-2xl bg-zinc-50 border border-zinc-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-zinc-700 flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    <span>{hasPaymentMethod ? "Card ending •••• 1234" : "No payment method"}</span>
                  </div>
                  <button
                    onClick={() => setHasPaymentMethod(true)}
                    className={cx(
                      "text-xs font-medium px-3 py-2 rounded-xl",
                      hasPaymentMethod ? "bg-zinc-100 text-zinc-700" : "bg-zinc-900 text-white"
                    )}
                  >
                    {hasPaymentMethod ? "Update" : "Add"}
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
          Book again
        </button>
        <button
          onClick={() => onChat(b)}
          className="px-3 py-2 rounded-xl bg-zinc-100 text-zinc-800 text-xs font-medium hover:bg-zinc-200 inline-flex items-center gap-2"
        >
          <MessageSquare className="h-4 w-4" />
          Chat
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
          Leave review
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
          Cancel
        </button>

        <div className="ml-auto px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-xs text-zinc-700 inline-flex items-center gap-2">
          <ReceiptText className="h-4 w-4" />
          Receipt
        </div>
      </div>

      {!canCancel && !b.isPast && b.status === "Confirmed" && (
        <div className="mt-3 text-xs text-zinc-500">Cancellation allowed until 2 hours before start time.</div>
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
          <div className="text-xl font-semibold">Bookings</div>
          <div className="text-sm text-zinc-600">Current and previous (newest first)</div>
        </div>
      </div>

      <div className="mt-6 grid gap-8">
        <div>
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Current</div>
            <Badge tone="Info">Cancel until 2h before</Badge>
          </div>
          <div className="mt-3 grid gap-3">
            {current.length === 0 ? (
              <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700">No current bookings.</div>
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
          <div className="text-sm font-semibold">Previous</div>
          <div className="mt-3 grid gap-3">
            {previous.length === 0 ? (
              <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700">No previous bookings.</div>
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

function MyListingsPage({
  listings,
  user,
  onRefresh,
  onToast,
}: {
  listings: Spot[];
  user: User | null;
  onRefresh: () => Promise<void> | void;
  onToast: (message: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [editingSpot, setEditingSpot] = useState<Spot | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editArea, setEditArea] = useState("Côte-des-Neiges");
  const [editPriceHour, setEditPriceHour] = useState(4);
  const [editPriceDay, setEditPriceDay] = useState(20);
  const [editAddressHint, setEditAddressHint] = useState("");
  const [editDifficulty, setEditDifficulty] = useState<Spot["difficulty"]>("Easy");
  const [editPhotoFile, setEditPhotoFile] = useState<File | null>(null);
  const [editPhotoPreview, setEditPhotoPreview] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editErrorMsg, setEditErrorMsg] = useState("");

  const openEditModal = (spot: Spot) => {
    if (editPhotoPreview && editPhotoPreview.startsWith("blob:")) {
      URL.revokeObjectURL(editPhotoPreview);
    }

    setEditingSpot(spot);
    setEditTitle(spot.title);
    setEditArea(spot.area);
    setEditPriceHour(Number(spot.priceHour));
    setEditPriceDay(Number(spot.priceDay));
    setEditAddressHint(spot.addressHint || "");
    setEditDifficulty(spot.difficulty);
    setEditPhotoFile(null);
    setEditPhotoPreview(spot.photo || null);
    setEditErrorMsg("");
    setEditSaving(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const closeEditModal = () => {
    if (editPhotoPreview && editPhotoPreview.startsWith("blob:")) {
      URL.revokeObjectURL(editPhotoPreview);
    }

    setEditingSpot(null);
    setEditTitle("");
    setEditArea("Côte-des-Neiges");
    setEditPriceHour(4);
    setEditPriceDay(20);
    setEditAddressHint("");
    setEditDifficulty("Easy");
    setEditPhotoFile(null);
    setEditPhotoPreview(null);
    setEditErrorMsg("");
    setEditSaving(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    return () => {
      if (editPhotoPreview && editPhotoPreview.startsWith("blob:")) {
        URL.revokeObjectURL(editPhotoPreview);
      }
    };
  }, [editPhotoPreview]);

  const toggleListingActive = async (spot: Spot) => {
    if (!user) return;

    setBusyId(spot.id);
    const supabase = createClient();

    const nextActive = spot.is_active === false ? true : false;

    const { error } = await supabase
      .from("spots")
      .update({ is_active: nextActive })
      .eq("id", spot.id)
      .eq("owner_id", user.id);

    setBusyId(null);

    if (error) {
      console.error("Toggle listing error:", error);
      onToast(error.message || "Failed to update listing status.");
      return;
    }

    await onRefresh();
    onToast(nextActive ? "Listing reactivated." : "Listing deactivated.");
  };

  const saveEditedListing = async () => {
    if (!user || !editingSpot || editSaving) return;

    setEditSaving(true);
    setEditErrorMsg("");

    try {
      const cleanTitle = editTitle.trim();
      const cleanAddressHint = editAddressHint.trim();
      const hour = Number(editPriceHour);
      const day = Number(editPriceDay);

      if (!cleanTitle) {
        setEditErrorMsg("Please enter a title.");
        return;
      }

      if (!cleanAddressHint) {
        setEditErrorMsg("Please enter an address hint.");
        return;
      }

      if (!Number.isFinite(hour) || hour <= 0) {
        setEditErrorMsg("Price per hour must be greater than 0.");
        return;
      }

      if (!Number.isFinite(day) || day <= 0) {
        setEditErrorMsg("Price per day must be greater than 0.");
        return;
      }

      if (hour > 100) {
        setEditErrorMsg("Price per hour is too high. Please enter 100 CAD or less.");
        return;
      }

      if (day > 500) {
        setEditErrorMsg("Price per day is too high. Please enter 500 CAD or less.");
        return;
      }

      if (day < hour) {
        setEditErrorMsg("Price per day cannot be lower than price per hour.");
        return;
      }

      if (editPhotoFile && !editPhotoFile.type.startsWith("image/")) {
        setEditErrorMsg("Please upload an image file.");
        return;
      }

      if (editPhotoFile && editPhotoFile.size > 5 * 1024 * 1024) {
        setEditErrorMsg("Image must be 5MB or smaller.");
        return;
      }

      const supabase = createClient();

      let photoUrl = editingSpot.photo || null;

      if (editPhotoFile) {
        const fileExt = editPhotoFile.name.split(".").pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("spot-photos")
          .upload(fileName, editPhotoFile);

        if (uploadError) {
          setEditErrorMsg("Failed to upload image.");
          return;
        }

        const { data: publicUrlData } = supabase.storage
          .from("spot-photos")
          .getPublicUrl(fileName);

        photoUrl = publicUrlData.publicUrl;
      }

      const { error } = await supabase
        .from("spots")
        .update({
          title: cleanTitle,
          area: editArea,
          price_hour: hour,
          price_day: day,
          address_hint: cleanAddressHint,
          difficulty: editDifficulty,
          photo_url: photoUrl,
        })
        .eq("id", editingSpot.id)
        .eq("owner_id", user.id);

      if (error) {
        setEditErrorMsg(error.message || "Failed to save listing.");
        return;
      }

      await onRefresh();
      closeEditModal();
      onToast("Listing updated.");
    } catch (err) {
      console.error("Save edited listing error:", err);
      setEditErrorMsg("Something went wrong while saving.");
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div>
        <div className="text-xl font-semibold">My listings</div>
        <div className="text-sm text-zinc-600">
          Manage your active and inactive parking listings
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {listings.length === 0 ? (
          <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700">
            You do not have any listings yet.
          </div>
        ) : (
          listings.map((spot) => (
            <div
              key={spot.id}
              className="rounded-3xl overflow-hidden border border-zinc-200 bg-white"
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
                    <div className="mt-1 text-xs text-zinc-600">
                      {spot.area} • {money(spot.priceHour)}/hr • {money(spot.priceDay)}/day
                    </div>
                  </div>
                  <DifficultyPill level={spot.difficulty} />
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <Badge tone={spot.is_active === false ? "Neutral" : "Good"}>
                    {spot.is_active === false ? "Inactive" : "Active"}
                  </Badge>
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => openEditModal(spot)}
                    className="rounded-xl bg-zinc-100 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-200"
                  >
                    Edit
                  </button>

                  <button
                    onClick={() => toggleListingActive(spot)}
                    disabled={busyId === spot.id}
                    className={
                      spot.is_active === false
                        ? "rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                        : "rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                    }
                  >
                    {busyId === spot.id
                      ? spot.is_active === false
                        ? "Reactivating..."
                        : "Deactivating..."
                      : spot.is_active === false
                      ? "Reactivate"
                      : "Deactivate"}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {editingSpot && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">Edit listing</div>
                <div className="text-sm text-zinc-600">
                  Update your posting and save changes
                </div>
              </div>
              <button
                onClick={closeEditModal}
                className="text-sm text-zinc-600 hover:text-zinc-900"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <label className="grid gap-1">
                <span className="text-xs text-zinc-500">Title</span>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-xs text-zinc-500">Area</span>
                <select
                  value={editArea}
                  onChange={(e) => setEditArea(e.target.value)}
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
                  value={editPriceHour}
                  onChange={(e) => setEditPriceHour(Number(e.target.value))}
                  className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-xs text-zinc-500">Price per day (CAD)</span>
                <input
                  type="number"
                  min={1}
                  value={editPriceDay}
                  onChange={(e) => setEditPriceDay(Number(e.target.value))}
                  className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-xs text-zinc-500">Address hint</span>
                <input
                  value={editAddressHint}
                  onChange={(e) => setEditAddressHint(e.target.value)}
                  className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-xs text-zinc-500">Difficulty</span>
                <select
                  value={editDifficulty}
                  onChange={(e) => setEditDifficulty(e.target.value as Spot["difficulty"])}
                  className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                >
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </label>

              <label className="grid gap-1">
                <span className="text-xs text-zinc-500">Photo (optional)</span>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  id="edit-spot-photo-upload"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setEditPhotoFile(file);

                    if (file) {
                      if (editPhotoPreview && editPhotoPreview.startsWith("blob:")) {
                        URL.revokeObjectURL(editPhotoPreview);
                      }
                      setEditPhotoPreview(URL.createObjectURL(file));
                    } else {
                      setEditPhotoPreview(editingSpot.photo || null);
                    }
                  }}
                />

                <label
                  htmlFor="edit-spot-photo-upload"
                  className="inline-flex w-fit cursor-pointer items-center rounded-2xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Choose photo
                </label>

                {editPhotoPreview && (
                  <div className="mt-2 overflow-hidden rounded-2xl border border-zinc-200">
                    <img
                      src={editPhotoPreview}
                      alt="Preview"
                      className="h-40 w-full object-cover"
                    />
                  </div>
                )}
              </label>

              {editErrorMsg && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {editErrorMsg}
                </div>
              )}

              <div className="mt-2 flex gap-2">
                <button
                  onClick={saveEditedListing}
                  disabled={editSaving}
                  className="rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-300"
                >
                  {editSaving ? "Saving..." : "Save changes"}
                </button>

                <button
                  onClick={closeEditModal}
                  disabled={editSaving}
                  className="rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LoginPage({
  onSuccess,
}: {
  onSuccess: () => void;
}) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const supabase = createClient();

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

        setMessage("Account created. You can now log in.");
        setMode("login");
        setPassword("");
      }
    } catch (err) {
      console.error("Auth error:", err);
      setMessage("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="rounded-3xl border border-zinc-200 bg-white p-6">
        <div className="text-2xl font-semibold">
          {mode === "login" ? "Log in" : "Create account"}
        </div>
        <div className="mt-2 text-sm text-zinc-600">
          You need an account to book parking, manage listings, and use GigPark.
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
              ? "Please wait..."
              : mode === "login"
              ? "Log in"
              : "Create account"}
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
            ? "Need an account? Sign up"
            : "Already have an account? Log in"}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [postLoginView, setPostLoginView] = useState<View>("host");
  const [user, setUser] = useState<User | null>(null);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [view, setView] = useState<View>("home");
  const [selected, setSelected] = useState<Spot | null>(null);
  const [hasPaymentMethod, setHasPaymentMethod] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutPayload, setCheckoutPayload] = useState<CheckoutPayload | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [myListings, setMyListings] = useState<Spot[]>([]);

  const requireLoginFor = (targetView: View) => {
    setPostLoginView(targetView);
    setView("login");
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setMyListings([]);
    setBookings([]);
    setHasPaymentMethod(false);
    setSelected(null);
    setCheckoutOpen(false);
    setCheckoutPayload(null);
    setView("home");
    setToast("Logged out");
    setTimeout(() => setToast(null), 2200);
  };

  type SpotRow = {
    id: string;
    owner_id?: string;
    is_active?: boolean;
    title: string;
    area: string;
    price_hour: number | string;
    price_day: number | string;
    address_hint?: string | null;
    photo_url?: string | null;
    difficulty?: Spot["difficulty"] | null;
    description?: string | null;
    availability?: Availability | null;
    features?: string[] | null;
    lat?: number | string | null;
    lng?: number | string | null;
  };

  const mapSpotRow = (s: SpotRow): Spot => ({
    ...s,
    owner_id: s.owner_id,
    is_active: s.is_active,
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
  });

  const loadSpots = async () => {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("spots")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase error:", error);
      setToast("Failed to load spots");
      setTimeout(() => setToast(null), 2200);
      return;
    }

    setSpots((data || []).map(mapSpotRow));
  };

  const loadMyListings = async (currentUser?: User | null) => {
    const activeUser = currentUser ?? user;
    if (!activeUser) {
      setMyListings([]);
      return;
    }

    const supabase = createClient();

    const { data, error } = await supabase
      .from("spots")
      .select("*")
      .eq("owner_id", activeUser.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load my listings:", error);
      setToast("Failed to load your listings");
      setTimeout(() => setToast(null), 2200);
      return;
    }

    setMyListings((data || []).map(mapSpotRow));
  };

  useEffect(() => {
  const supabase = createClient();

  const loadUser = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    setUser(user ?? null);
    await loadMyListings(user ?? null);
  };

  loadUser();
  loadSpots();

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    const nextUser = session?.user ?? null;
    setUser(nextUser);
    loadMyListings(nextUser);
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
    setCheckoutPayload(null);
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

  const goChat = (_b?: Booking) => {
    if (!user) {
      requireLoginFor("chat");
      return;
    }
    setView("chat");
  };

  const leaveReview = (_b?: Booking) => {
    setToast("Review submitted (demo)");
    setTimeout(() => setToast(null), 2200);
  };

  const openLogin = () => {
    setPostLoginView("home");
    setView("login");
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
        onRequireLoginFor={requireLoginFor}
        onOpenLogin={openLogin}
      />

      {view === "home" && (
        <>
          <Hero
            onGetParking={() => setView("search")}
            onEarnMoney={() => (user ? setView("host") : requireLoginFor("host"))}
          />
          <div className="mx-auto max-w-6xl px-4 pb-12">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl border border-zinc-200 p-5">
                <div className="flex items-center gap-2 font-semibold">
                  <Search className="h-4 w-4" /> Search
                </div>
                <div className="mt-2 text-sm text-zinc-600">Filter by neighborhood, price, and availability.</div>
              </div>
              <div className="rounded-3xl border border-zinc-200 p-5">
                <div className="flex items-center gap-2 font-semibold">
                  <MessageSquare className="h-4 w-4" /> Chat
                </div>
                <div className="mt-2 text-sm text-zinc-600">Confirm details with hosts before arrival.</div>
              </div>
              <div className="rounded-3xl border border-zinc-200 p-5">
                <div className="flex items-center gap-2 font-semibold">
                  <Wallet className="h-4 w-4" /> Pay
                </div>
                <div className="mt-2 text-sm text-zinc-600">
                  Secure payment flow. The address stays masked until booking.
                </div>
              </div>
            </div>

            <div className="mt-10 rounded-3xl border border-zinc-200 bg-zinc-50 p-6">
              <div className="text-sm font-semibold">Launch note (demo)</div>
              <div className="mt-2 text-sm text-zinc-700 leading-relaxed">
                This prototype demonstrates core flows: entry point (get parking / earn money), search + filters, listing
                details, map browse, checkout, and bookings.
              </div>
            </div>
          </div>
        </>
      )}

      {view === "search" && <SearchPage spots={spots} onOpenSpot={openSpot} />}

      {view === "detail" && selected && (
        <SpotDetail
          spot={selected}
          user={user}
          onBack={() => setView("search")}
          onCheckout={startCheckout}
          onRequireLogin={() => {
            setToast("Please log in to continue.");
            setTimeout(() => setToast(null), 2200);
            requireLoginFor("detail");
          }}
        />
      )}

      {view === "my-listings" && (
        <MyListingsPage
          listings={myListings}
          user={user}
          onRefresh={async () => {
            await loadSpots();
            await loadMyListings(user);
          }}
          onToast={(message) => {
            setToast(message);
            setTimeout(() => setToast(null), 2200);
          }}
        />
      )}

      {view === "host" && (
        <HostPage
          onCreated={async () => {
            await loadSpots();
            await loadMyListings(user);
          }}
          user={user}
          onRequireLogin={() => requireLoginFor("host")}
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
          user={user}
          hasPaymentMethod={hasPaymentMethod}
          setHasPaymentMethod={setHasPaymentMethod}
          onGoBookings={() => setView("bookings")}
          onRequireLogin={() => requireLoginFor("profile")}
        />
      )}

      {view === "login" && (
        <LoginPage
          onSuccess={() => {
            setCheckoutOpen(false);
            setCheckoutPayload(null);
            if (postLoginView !== "detail") {
              setSelected(null);
            }
            setView(postLoginView);
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
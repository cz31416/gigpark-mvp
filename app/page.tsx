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

function getDayKeyFromDate(date: string): DayKey {
  const jsDay = new Date(`${date}T12:00:00`).getDay();
  return (Object.keys(DAY_TO_JS) as DayKey[]).find((k) => DAY_TO_JS[k] === jsDay) ?? "mon";
}

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
  status: "confirmed" | "cancelled" | "completed";
  isPast?: boolean;
};

type CheckoutPayload = {
  spot: Spot;
  bookingDate: string;
  bookingStartTime: string;
  durationHours: number;
  subtotal: number;
  tax: number;
  total: number;
  startAt: Date;
};

type SpotTimeWindow = {
  id: string;
  spot_id: string;
  source_type: "specific" | "recurring";
  day_key: DayKey | null;
  specific_date: string | null;
  start_date: string;
  start_time: string;
  end_time: string;
  repeat_rule: "none" | "daily" | "weekly" | "monthly" | "yearly";
  created_at?: string;
};

type AvailabilityRuleRow = {
  date: string;
  start: string;
  end: string;
  repeat: "none" | "daily" | "weekly" | "monthly" | "yearly";
};

type ReviewRow = {
  id: string;
  booking_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
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

function generateTimeSlots(start = "06:00", end = "23:00", stepMinutes = 30) {
  const slots: string[] = [];

  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);

  const current = new Date();
  current.setHours(startHour, startMinute, 0, 0);

  const limit = new Date();
  limit.setHours(endHour, endMinute, 0, 0);

  while (current <= limit) {
    const hh = String(current.getHours()).padStart(2, "0");
    const mm = String(current.getMinutes()).padStart(2, "0");
    slots.push(`${hh}:${mm}`);
    current.setMinutes(current.getMinutes() + stepMinutes);
  }

  return slots;
}

function sameMonthDay(a: string, b: string) {
  const da = new Date(`${a}T12:00:00`);
  const db = new Date(`${b}T12:00:00`);
  return da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function sameDayOfMonth(a: string, b: string) {
  const da = new Date(`${a}T12:00:00`);
  const db = new Date(`${b}T12:00:00`);
  return da.getDate() === db.getDate();
}

function matchesRepeatRule(rule: SpotTimeWindow, selectedDate: string) {
  if (rule.source_type === "specific" || rule.repeat_rule === "none") {
    return (rule.specific_date ?? rule.start_date) === selectedDate;
  }

  if (selectedDate < rule.start_date) return false;

  if (rule.repeat_rule === "daily") {
    return true;
  }

  if (rule.repeat_rule === "weekly") {
    return rule.day_key === getDayKeyFromDate(selectedDate);
  }

  if (rule.repeat_rule === "monthly") {
    return sameDayOfMonth(selectedDate, rule.start_date);
  }

  if (rule.repeat_rule === "yearly") {
    return sameMonthDay(selectedDate, rule.start_date);
  }

  return false;
}

function combineDateAndTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`);
}

function hasTimeConflict(
  candidateStart: Date,
  candidateEnd: Date,
  existing: { start_at: string; end_at: string }[]
) {
  return existing.some((b) => {
    const existingStart = new Date(b.start_at);
    const existingEnd = new Date(b.end_at);
    return candidateStart < existingEnd && candidateEnd > existingStart;
  });
}

function isWithinWindow(
  bookingDate: string,
  startTime: string,
  durationHours: number,
  windowStart: string,
  windowEnd: string
) {
  const candidateStart = combineDateAndTime(bookingDate, startTime);
  const candidateEnd = new Date(
    candidateStart.getTime() + durationHours * 60 * 60 * 1000
  );
  const allowedStart = combineDateAndTime(bookingDate, windowStart);
  const allowedEnd = combineDateAndTime(bookingDate, windowEnd);

  return candidateStart >= allowedStart && candidateEnd <= allowedEnd;
}

function bookingMatchesAnyAvailabilityWindow(
  bookingDate: string,
  startTime: string,
  durationHours: number,
  windows: SpotTimeWindow[]
) {
  const matchingWindows = windows.filter((w) => matchesRepeatRule(w, bookingDate));

  return matchingWindows.some((w) =>
    isWithinWindow(
      bookingDate,
      startTime,
      durationHours,
      w.start_time,
      w.end_time
    )
  );
}

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
  const [bookingDate, setBookingDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [bookingStartTime, setBookingStartTime] = useState("09:00");
  const [duration, setDuration] = useState("2h");
  const [spotBookings, setSpotBookings] = useState<
    { id: string; start_at: string; end_at: string; status: string }[]
  >([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [timeWindows, setTimeWindows] = useState<SpotTimeWindow[]>([]);

  const matchingWindows = timeWindows.filter((w) =>
    matchesRepeatRule(w, bookingDate)
  );

  const activeRanges = matchingWindows.map(
    (w) => [w.start_time, w.end_time] as [string, string]
  );

  const hasAvailability = activeRanges.length > 0;

  const durationHours =
    duration === "1h" ? 1 :
    duration === "2h" ? 2 :
    duration === "4h" ? 4 :
    duration === "8h" ? 8 : 24;

  const timeSlots = useMemo(() => {
    if (activeRanges.length === 0) return [];

    const merged = activeRanges.flatMap(([start, end]) => {
      const raw = generateTimeSlots(start, end, 30);

      return raw.filter((time) => {
        const candidateStart = combineDateAndTime(bookingDate, time);
        const candidateEnd = new Date(
          candidateStart.getTime() + durationHours * 60 * 60 * 1000
        );
        const windowEnd = combineDateAndTime(bookingDate, end);

        return candidateEnd <= windowEnd;
      });
    });

    return Array.from(new Set(merged)).sort();
  }, [activeRanges, bookingDate, durationHours]);

  const subtotal = spot.priceHour * durationHours;
  const tax = subtotal * (TAX.gst + TAX.qst);
  const total = subtotal + tax;
  const isOwnSpot = !!user && !!spot.owner_id && user.id === spot.owner_id;
  const isSpotInactive = spot.is_active === false;

  useEffect(() => {
    if (timeSlots.length === 0) {
      setBookingStartTime("");
      return;
    }

    if (!timeSlots.includes(bookingStartTime)) {
      setBookingStartTime(timeSlots[0]);
    }
  }, [timeSlots, bookingStartTime]);

  useEffect(() => {
    const loadSpotBookings = async () => {
      setLoadingAvailability(true);
      const supabase = createClient();
      const { data: windowsData, error: windowsError } = await supabase
        .from("spot_time_windows")
        .select("*")
        .eq("spot_id", spot.id);

      if (windowsError) {
        console.error("Failed to load spot time windows:", windowsError);
        setTimeWindows([]);
      } else {
        setTimeWindows((windowsData || []) as SpotTimeWindow[]);
      }
      const startOfDay = new Date(`${bookingDate}T00:00:00`);
      const endOfDay = new Date(`${bookingDate}T23:59:59`);

      const { data, error } = await supabase
        .from("bookings")
        .select("id, start_at, end_at, status")
        .eq("spot_id", spot.id)
        .neq("status", "cancelled")
        .lt("start_at", endOfDay.toISOString())
        .gt("end_at", startOfDay.toISOString())
        .order("start_at", { ascending: true });

      if (error) {
        console.error("Failed to load spot bookings:", error);
        setSpotBookings([]);
      } else {
        setSpotBookings(data || []);
      }

      setLoadingAvailability(false);
    };

    loadSpotBookings();
  }, [spot.id, bookingDate]);

  const selectedStartAt =
    bookingStartTime ? combineDateAndTime(bookingDate, bookingStartTime) : null;

  const selectedEndAt = selectedStartAt
    ? new Date(selectedStartAt.getTime() + durationHours * 60 * 60 * 1000)
    : null;

  const selectedSlotOutsideAvailability =
    !bookingStartTime ||
    !bookingMatchesAnyAvailabilityWindow(
      bookingDate,
      bookingStartTime,
      durationHours,
      timeWindows
    );

  const selectedSlotUnavailable =
    !selectedStartAt ||
    !selectedEndAt ||
    selectedSlotOutsideAvailability ||
    hasTimeConflict(selectedStartAt, selectedEndAt, spotBookings);

  const handleBookNow = () => {
    if (!hasAvailability || !bookingStartTime || !selectedStartAt) {
      return;
    }

    if (!user) {
      onRequireLogin();
      return;
    }

    if (isOwnSpot || isSpotInactive || selectedSlotUnavailable) {
      return;
    }

    onCheckout({
      spot,
      bookingDate,
      bookingStartTime,
      durationHours,
      subtotal,
      tax,
      total,
      startAt: selectedStartAt,
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
              <div className="text-xs text-zinc-500 mb-1">Choose date</div>
              <input
                type="date"
                value={bookingDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setBookingDate(e.target.value)}
                className="w-full rounded-2xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
              />
            </div>

            <div>
              <div className="text-xs text-zinc-500 mb-1">Choose start time</div>

              {!hasAvailability ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  This spot is unavailable on the selected day.
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {timeSlots.map((time) => {
                    const candidateStart = combineDateAndTime(bookingDate, time);
                    const candidateEnd = new Date(
                      candidateStart.getTime() + durationHours * 60 * 60 * 1000
                    );
                    const unavailable = hasTimeConflict(
                      candidateStart,
                      candidateEnd,
                      spotBookings
                    );

                    return (
                      <button
                        key={time}
                        disabled={unavailable}
                        onClick={() => setBookingStartTime(time)}
                        className={cx(
                          "px-3 py-2 rounded-xl text-sm",
                          bookingStartTime === time && !unavailable
                            ? "bg-zinc-900 text-white"
                            : unavailable
                            ? "bg-zinc-100 text-zinc-400 cursor-not-allowed"
                            : "bg-zinc-100 text-zinc-700"
                        )}
                      >
                        {time}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <div className="text-xs text-zinc-500 mb-1">Duration</div>
              <div className="grid grid-cols-5 gap-2">
                {["1h", "2h", "4h", "8h", "24h"].map((x) => (
                  <button
                    key={x}
                    onClick={() => setDuration(x)}
                    className={cx(
                      "px-3 py-2 rounded-xl text-sm",
                      duration === x ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700"
                    )}
                  >
                    {x}
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
                {loadingAvailability
                  ? "Checking availability..."
                  : !hasAvailability
                  ? "This spot is unavailable on that day."
                  : selectedSlotOutsideAvailability
                  ? "That time is outside the listed availability."
                  : selectedSlotUnavailable
                  ? "That time is already booked."
                  : selectedStartAt
                  ? `Starts: ${fmtDateTime(selectedStartAt)}`
                  : "Choose a start time."}
              </div>
            </div>

            <button
              disabled={
                loadingAvailability ||
                selectedSlotUnavailable ||
                isOwnSpot ||
                isSpotInactive
              }
              onClick={handleBookNow}
              className={cx(
                "w-full px-4 py-3 rounded-2xl text-sm font-medium",
                !loadingAvailability &&
                  !selectedSlotUnavailable &&
                  !isOwnSpot &&
                  !isSpotInactive
                  ? "bg-zinc-900 text-white hover:bg-zinc-800"
                  : "bg-zinc-200 text-zinc-500 cursor-not-allowed"
              )}
            >
              {!user
                ? "Log in to book"
                : isOwnSpot
                ? "You cannot book your own listing"
                : isSpotInactive
                ? "This listing is inactive"
                : "Continue to confirm"}
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
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  payload: CheckoutPayload | null;
  onConfirm: () => void;
}) {
  if (!open || !payload) return null;
  const { spot, bookingDate, bookingStartTime, durationHours, subtotal, tax, total, startAt } = payload;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white border border-zinc-200 shadow-xl overflow-hidden">
        <div className="p-5 border-b border-zinc-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            <div>
              <div className="text-sm font-semibold">Confirm booking</div>
              <div className="text-xs text-zinc-500">Test mode — payment step bypassed</div>
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
              <span>{bookingDate}</span>
              <span className="text-zinc-300">•</span>
              <span>{bookingStartTime}</span>
              <span className="text-zinc-300">•</span>
              <span>{durationHours} hours</span>
            </div>
            <div className="mt-2 text-xs text-zinc-500">Starts: {fmtDateTime(startAt)}</div>
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
            <div className="mt-2 text-xs text-zinc-500">
              This booking will be saved in test mode without requiring a card.
            </div>
          </div>

          <button
            onClick={onConfirm}
            className="w-full px-4 py-3 rounded-2xl text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800"
          >
            Confirm booking
          </button>

          <div className="text-xs text-zinc-600">
            By confirming, you agree that this is a private, owner-authorized parking space.
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewModal({
  open,
  booking,
  onClose,
  onSubmitted,
}: {
  open: boolean;
  booking: Booking | null;
  onClose: () => void;
  onSubmitted: () => Promise<void> | void;
}) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (open) {
      setRating(5);
      setComment("");
      setSaving(false);
      setErrorMsg("");
    }
  }, [open, booking?.id]);

  if (!open || !booking) return null;

  const submitReview = async () => {
    setSaving(true);
    setErrorMsg("");

    try {
      const supabase = createClient();

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setErrorMsg("Please log in again.");
        return;
      }

      const { data: latestSpot, error: spotError } = await supabase
        .from("spots")
        .select("owner_id")
        .eq("id", booking.spot.id)
        .maybeSingle();

      if (spotError || !latestSpot?.owner_id) {
        setErrorMsg("Could not identify the host for this booking.");
        return;
      }

      const { error } = await supabase.from("reviews").insert({
        booking_id: booking.id,
        reviewer_id: user.id,
        reviewee_id: latestSpot.owner_id,
        rating,
        comment: comment.trim() || null,
      });

      if (error) {
        setErrorMsg(error.message || "Failed to submit review.");
        return;
      }

      await onSubmitted();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold">Leave a review</div>
            <div className="text-sm text-zinc-600">{booking.spot.title}</div>
          </div>
          <button
            onClick={onClose}
            className="text-sm text-zinc-600 hover:text-zinc-900"
          >
            Close
          </button>
        </div>

        <div className="mt-4 grid gap-4">
          <div>
            <div className="mb-2 text-xs text-zinc-500">Rating</div>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  onClick={() => setRating(value)}
                  className={cx(
                    "rounded-xl px-3 py-2 text-sm font-medium",
                    rating === value
                      ? "bg-zinc-900 text-white"
                      : "bg-zinc-100 text-zinc-700"
                  )}
                >
                  {value}★
                </button>
              ))}
            </div>
          </div>

          <label className="grid gap-1">
            <span className="text-xs text-zinc-500">Comment</span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              placeholder="Describe your experience"
              className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
            />
          </label>

          {errorMsg && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {errorMsg}
            </div>
          )}

          <button
            onClick={submitReview}
            disabled={saving}
            className="rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-300"
          >
            {saving ? "Submitting..." : "Submit review"}
          </button>
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

function AvailabilityRulesEditor({
  value,
  onChange,
}: {
  value: AvailabilityRuleRow[];
  onChange: (next: AvailabilityRuleRow[]) => void;
}) {
  const [date, setDate] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [repeat, setRepeat] = useState<AvailabilityRuleRow["repeat"]>("none");

  const addRow = () => {
    if (!date || !start || !end) return;
    if (start >= end) return;

    onChange([
      ...value,
      {
        date,
        start,
        end,
        repeat,
      },
    ]);

    setDate("");
    setStart("09:00");
    setEnd("17:00");
    setRepeat("none");
  };

  const removeRow = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  const repeatLabel = (r: AvailabilityRuleRow["repeat"]) => {
    switch (r) {
      case "none":
        return "Does not repeat";
      case "daily":
        return "Repeats daily";
      case "weekly":
        return "Repeats weekly";
      case "monthly":
        return "Repeats monthly";
      case "yearly":
        return "Repeats yearly";
      default:
        return r;
    }
  };

  return (
    <div className="grid gap-3">
      <label className="grid gap-1">
        <span className="text-xs text-zinc-500">Availability</span>
        <span className="text-xs text-zinc-500">
          Add a date, time range, and repeat rule.
        </span>
      </label>

      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="min-w-0">
            <span className="mb-1 block text-xs text-zinc-500">Date</span>
            <input
              type="date"
              value={date}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
            />
          </div>

          <div className="min-w-0">
            <span className="mb-1 block text-xs text-zinc-500">Start time</span>
            <input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
            />
          </div>

          <div className="min-w-0">
            <span className="mb-1 block text-xs text-zinc-500">End time</span>
            <input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
            />
          </div>

          <div className="min-w-0 md:col-span-3">
            <span className="mb-1 block text-xs text-zinc-500">Repeat rule</span>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={repeat}
                onChange={(e) =>
                  setRepeat(e.target.value as AvailabilityRuleRow["repeat"])
                }
                className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
              >
                <option value="none">One-time only</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>

              <button
                type="button"
                onClick={addRow}
                className="shrink-0 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      </div>

      {value.length === 0 ? (
        <div className="text-xs text-zinc-500">No availability rules added yet.</div>
      ) : (
        <div className="grid gap-2">
          {value.map((row, idx) => (
            <div
              key={`${row.date}-${row.start}-${row.end}-${row.repeat}-${idx}`}
              className="flex flex-col gap-2 rounded-2xl border border-zinc-200 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 break-words">
                <span className="font-medium">{row.date}</span>
                {" • "}
                {row.start} to {row.end}
                {" • "}
                <span className="text-zinc-600">{repeatLabel(row.repeat)}</span>
              </div>
              <button
                type="button"
                onClick={() => removeRow(idx)}
                className="rounded-lg bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
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
  const [availabilityRules, setAvailabilityRules] = useState<AvailabilityRuleRow[]>([]);
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

      if (availabilityRules.length === 0) {
        setErrorMsg("Please add at least one availability rule.");
        return;
      }

      const { data: insertedSpot, error } = await supabase
        .from("spots")
        .insert(payload)
        .select("id")
        .single();

      if (error || !insertedSpot) {
        console.error("Insert error:", error);
        setErrorMsg(error?.message || "Failed to create listing.");
        return;
      }

      const spotId = insertedSpot.id;

      const timeWindowRows = availabilityRules.map((row) => {
        const isOneTime = row.repeat === "none";

        return {
          spot_id: spotId,
          source_type: isOneTime ? "specific" : "recurring",
          specific_date: isOneTime ? row.date : null,
          start_date: row.date,
          day_key: isOneTime ? null : getDayKeyFromDate(row.date),
          start_time: row.start,
          end_time: row.end,
          repeat_rule: row.repeat,
        };
      });

      if (timeWindowRows.length > 0) {
        const { error: windowError } = await supabase
          .from("spot_time_windows")
          .insert(timeWindowRows);

        if (windowError) {
          console.error("spot_time_windows insert error:", windowError);
          setErrorMsg(windowError.message || "Listing created, but availability failed to save.");
          return;
        }
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
      setAvailabilityRules([]);

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
            <AvailabilityRulesEditor
              value={availabilityRules}
              onChange={(next) => {
                setSubmitted(false);
                setErrorMsg("");
                setAvailabilityRules(next);
              }}
            />
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

function ChatPage({
  user,
  bookings,
  onOpenBooking,
  onRequireLogin,
}: {
  user: User | null;
  bookings: Booking[];
  onOpenBooking: (b: Booking) => void;
  onRequireLogin: () => void;
}) {
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [messagesByBooking, setMessagesByBooking] = useState<
    Record<string, { id: string; sender_id: string; text: string; created_at: string }[]>
  >({});
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [chatError, setChatError] = useState("");
  const [dealAmount, setDealAmount] = useState("");
  const [showDealBox, setShowDealBox] = useState(false);

  useEffect(() => {
    if (bookings.length === 0) {
      setSelectedBookingId(null);
      return;
    }

    setSelectedBookingId((prev) => {
      if (prev && bookings.some((b) => b.id === prev)) return prev;
      return bookings[0].id;
    });
  }, [bookings]);

  useEffect(() => {
    setShowDealBox(false);
    setDealAmount("");
    setChatError("");
    setDraft("");
  }, [selectedBookingId]);

  useEffect(() => {
    if (!user || bookings.length === 0) return;

    const supabase = createClient();

    const loadMessages = async () => {
      setLoadingMessages(true);

      const bookingIds = bookings.map((b) => b.id);

      const { data, error } = await supabase
        .from("messages")
        .select("id, booking_id, sender_id, text, created_at")
        .in("booking_id", bookingIds)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Failed to load messages:", error);
        setLoadingMessages(false);
        return;
      }

      const grouped: Record<
        string,
        { id: string; sender_id: string; text: string; created_at: string }[]
      > = {};

      for (const row of data || []) {
        if (!grouped[row.booking_id]) grouped[row.booking_id] = [];
        grouped[row.booking_id].push({
          id: row.id,
          sender_id: row.sender_id,
          text: row.text,
          created_at: row.created_at,
        });
      }

      setMessagesByBooking(grouped);
      setLoadingMessages(false);
    };

    loadMessages();

    const channel = supabase
      .channel(`messages-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        async () => {
          await loadMessages();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, bookings]);

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-3xl border border-zinc-200 bg-white p-8 text-center">
          <div className="text-2xl font-semibold">Chat</div>
          <div className="mt-2 text-sm text-zinc-600">
            Log in to message hosts about your bookings.
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

  if (bookings.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="rounded-3xl border border-zinc-200 bg-white p-8 text-center">
          <div className="text-2xl font-semibold">No conversations yet</div>
          <div className="mt-2 text-sm text-zinc-600">
            Conversations appear after you make a booking.
          </div>
        </div>
      </div>
    );
  }

  const selectedBooking = bookings.find((b) => b.id === selectedBookingId) ?? bookings[0];
  const messages = messagesByBooking[selectedBooking.id] ?? [];
  const hostName = selectedBooking.spot.host.name || "Host";

  const sendDealProposal = async () => {
    const amount = Number(dealAmount);

    if (!user || !Number.isFinite(amount) || amount <= 0) {
      setChatError("Enter a valid proposed hourly price.");
      return;
    }

    setChatError("");

    const text = `Deal proposal: ${money(amount)}/hr`;
    const supabase = createClient();

    const optimisticId = `temp-deal-${Date.now()}`;
    const optimisticMessage = {
      id: optimisticId,
      sender_id: user.id,
      text,
      created_at: new Date().toISOString(),
    };

    setMessagesByBooking((prev) => ({
      ...prev,
      [selectedBooking.id]: [...(prev[selectedBooking.id] ?? []), optimisticMessage],
    }));

    setDealAmount("");
    setShowDealBox(false);

    const { data, error } = await supabase
      .from("messages")
      .insert({
        booking_id: selectedBooking.id,
        sender_id: user.id,
        text,
      })
      .select("id, booking_id, sender_id, text, created_at")
      .single();

    if (error) {
      setMessagesByBooking((prev) => ({
        ...prev,
        [selectedBooking.id]: (prev[selectedBooking.id] ?? []).filter(
          (m) => m.id !== optimisticId
        ),
      }));
      setChatError(error.message || "Failed to send the deal proposal.");
      return;
    }

    setMessagesByBooking((prev) => ({
      ...prev,
      [selectedBooking.id]: (prev[selectedBooking.id] ?? [])
        .filter((m) => m.id !== optimisticId)
        .concat({
          id: data.id,
          sender_id: data.sender_id,
          text: data.text,
          created_at: data.created_at,
        }),
    }));
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || !user) return;

    setChatError("");

    const supabase = createClient();

    const optimisticId = `temp-${Date.now()}`;
    const optimisticMessage = {
      id: optimisticId,
      sender_id: user.id,
      text,
      created_at: new Date().toISOString(),
    };

    setMessagesByBooking((prev) => ({
      ...prev,
      [selectedBooking.id]: [...(prev[selectedBooking.id] ?? []), optimisticMessage],
    }));

    setDraft("");

    const { data, error } = await supabase
      .from("messages")
      .insert({
        booking_id: selectedBooking.id,
        sender_id: user.id,
        text,
      })
      .select("id, booking_id, sender_id, text, created_at")
      .single();

    if (error) {
      console.error("Send message error:", error);

      setMessagesByBooking((prev) => ({
        ...prev,
        [selectedBooking.id]: (prev[selectedBooking.id] ?? []).filter(
          (m) => m.id !== optimisticId
        ),
      }));

      setDraft(text);
      setChatError(error.message || "Failed to send message.");
      return;
    }

    setMessagesByBooking((prev) => ({
      ...prev,
      [selectedBooking.id]: (prev[selectedBooking.id] ?? [])
        .filter((m) => m.id !== optimisticId)
        .concat({
          id: data.id,
          sender_id: data.sender_id,
          text: data.text,
          created_at: data.created_at,
        }),
    }));
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="grid gap-6 md:grid-cols-[320px_1fr]">
        <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 p-4">
            <div className="text-sm font-semibold">Messages</div>
            <div className="text-xs text-zinc-500">Conversations from your bookings</div>
          </div>

          <div className="p-2">
            {bookings.map((b) => {
              const isActive = b.id === selectedBooking.id;
              const preview =
                messagesByBooking[b.id]?.[messagesByBooking[b.id].length - 1]?.text ??
                "Open conversation";
              const startAt = b.startAt instanceof Date ? b.startAt : new Date(b.startAt);

              return (
                <button
                  key={b.id}
                  onClick={() => setSelectedBookingId(b.id)}
                  className={cx(
                    "mb-2 w-full rounded-2xl p-3 text-left",
                    isActive ? "bg-zinc-100" : "hover:bg-zinc-50"
                  )}
                >
                  <div className="text-sm font-semibold truncate">{b.spot.title}</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {fmtDateTime(startAt)}
                  </div>
                  <div className="mt-1 truncate text-xs text-zinc-600">{preview}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white">
          <div className="flex items-center justify-between border-b border-zinc-200 p-4">
            <div>
              <div className="text-sm font-semibold">{hostName}</div>
              <div className="text-xs text-zinc-500">
                {selectedBooking.spot.title} • {selectedBooking.spot.area}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => onOpenBooking(selectedBooking)}
                className="rounded-xl bg-zinc-100 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-200"
              >
                View booking
              </button>
              <button
                onClick={() => {
                  setChatError("");
                  setShowDealBox((prev) => !prev);
                  setDealAmount(String(selectedBooking.spot.priceHour));
                }}
                className="rounded-xl bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800"
              >
                Propose deal
              </button>
            </div>
          </div>

          <div className="border-b border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600">
            Booking status: <span className="font-medium capitalize">{selectedBooking.status}</span>
          </div>
          
          {showDealBox && (
            <div className="border-b border-zinc-200 bg-white p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="number"
                  min={1}
                  step="0.5"
                  value={dealAmount}
                  onChange={(e) => setDealAmount(e.target.value)}
                  placeholder="Proposed hourly price"
                  className="flex-1 rounded-2xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                />
                <button
                  onClick={sendDealProposal}
                  className="rounded-2xl bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800"
                >
                  Send proposal
                </button>
              </div>
              <div className="mt-2 text-xs text-zinc-500">
                This sends a price proposal in the chat for this booking.
              </div>
            </div>
          )}

          <div className="h-[360px] space-y-2 overflow-auto p-4">
            {loadingMessages ? (
              <div className="text-sm text-zinc-500">Loading messages...</div>
            ) : messages.length === 0 ? (
              <div className="text-sm text-zinc-500">No messages yet.</div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={cx("flex", m.sender_id === user.id ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cx(
                      "max-w-[78%] rounded-2xl px-3 py-2 text-sm",
                      m.sender_id === user.id
                        ? "bg-zinc-900 text-white"
                        : "bg-zinc-100 text-zinc-800"
                    )}
                  >
                    {m.text}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-zinc-200 p-4">
            {chatError && (
              <div className="mb-3 text-sm text-rose-600">
                {chatError}
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => (e.key === "Enter" ? send() : null)}
                placeholder="Type a message"
                className="flex-1 rounded-2xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
              />
              <button
                onClick={send}
                className="rounded-2xl bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800"
              >
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
  profile,
  profileLoading,
  profileSaving,
  onSaveProfile,
  hasPaymentMethod,
  setHasPaymentMethod,
  bookings,
  myListings,
  onGoBookings,
  onRequireLogin,
}: {
  user: User | null;
  profile: { full_name: string; email: string; phone: string };
  profileLoading: boolean;
  profileSaving: boolean;
  onSaveProfile: (next: { full_name: string; phone: string }) => Promise<void>;
  hasPaymentMethod: boolean;
  setHasPaymentMethod: React.Dispatch<React.SetStateAction<boolean>>;
  bookings: Booking[];
  myListings: Spot[];
  onGoBookings: () => void;
  onRequireLogin: () => void;
}) {
  const [fullName, setFullName] = useState(profile.full_name);
  const [phone, setPhone] = useState(profile.phone);

  useEffect(() => {
    setFullName(profile.full_name);
    setPhone(profile.phone);
  }, [profile.full_name, profile.phone]);

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-3xl border border-zinc-200 bg-white p-8 text-center">
          <div className="text-2xl font-semibold">Profile</div>
          <div className="mt-2 text-sm text-zinc-600">
            Log in to view and manage your profile.
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

  const activeBookings = bookings.filter((b) => b.status === "confirmed").length;
  const completedBookings = bookings.filter((b) => b.status === "completed").length;
  const cancelledBookings = bookings.filter((b) => b.status === "cancelled").length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="grid gap-6 md:grid-cols-[1fr_360px]">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xl font-semibold">Your profile</div>
              <div className="text-sm text-zinc-600">{user.email}</div>
            </div>
            <button
              onClick={onGoBookings}
              className="rounded-xl bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800"
            >
              Bookings
            </button>
          </div>

          <div className="mt-6 rounded-3xl border border-zinc-200 p-4">
            <div className="text-sm font-semibold">Personal details</div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-xs text-zinc-500">Full name</span>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                  className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-xs text-zinc-500">Phone</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Your phone number"
                  className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                />
              </label>

              <label className="grid gap-1 md:col-span-2">
                <span className="text-xs text-zinc-500">Email</span>
                <input
                  value={profile.email || user.email || ""}
                  disabled
                  className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500 outline-none"
                />
              </label>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={() => onSaveProfile({ full_name: fullName.trim(), phone: phone.trim() })}
                disabled={profileLoading || profileSaving}
                className="rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-300"
              >
                {profileSaving ? "Saving..." : "Save profile"}
              </button>

              {profileLoading && (
                <div className="text-xs text-zinc-500">Loading profile...</div>
              )}
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-zinc-200 p-4">
              <div className="text-sm font-semibold">Account stats</div>
              <div className="mt-3 grid gap-2 text-sm text-zinc-700">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-600">Active bookings</span>
                  <span className="font-semibold">{activeBookings}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-600">Completed bookings</span>
                  <span className="font-semibold">{completedBookings}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-600">Cancelled bookings</span>
                  <span className="font-semibold">{cancelledBookings}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-600">Listings created</span>
                  <span className="font-semibold">{myListings.length}</span>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-200 p-4">
              <div className="text-sm font-semibold">Payment</div>
              <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-zinc-700">
                    <CreditCard className="h-4 w-4" />
                    <span>{hasPaymentMethod ? "Card ending •••• 1234" : "No payment method"}</span>
                  </div>
                  <button
                    onClick={() => setHasPaymentMethod(true)}
                    className={cx(
                      "rounded-xl px-3 py-2 text-xs font-medium",
                      hasPaymentMethod ? "bg-zinc-100 text-zinc-700" : "bg-zinc-900 text-white"
                    )}
                  >
                    {hasPaymentMethod ? "Update" : "Add"}
                  </button>
                </div>
                <div className="mt-2 text-xs text-zinc-500">
                  MVP note: payment method is still demo-only.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="h-fit rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-sm font-semibold">Wallet</div>
          <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-xs text-zinc-500">Available balance</div>
            <div className="mt-1 text-2xl font-semibold">{money(0)}</div>
            <div className="mt-2 text-xs text-zinc-600">
              Host payouts are not connected yet.
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-zinc-200 p-4">
            <div className="text-sm font-semibold">Account readiness</div>
            <div className="mt-3 grid gap-2 text-sm text-zinc-700">
              <div className="flex items-center justify-between">
                <span>Name added</span>
                <span className="font-medium">{fullName.trim() ? "Yes" : "No"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Phone added</span>
                <span className="font-medium">{phone.trim() ? "Yes" : "No"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Payment method</span>
                <span className="font-medium">{hasPaymentMethod ? "Yes" : "No"}</span>
              </div>
            </div>
          </div>
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
  const canCancel = b.status === "confirmed" && hoursBetween(new Date(), startAt) >= 2;

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
          <Badge tone={b.status === "cancelled" ? "Bad" : b.isPast ? "Neutral" : "Info"}>
            {b.status === "cancelled" ? "Cancelled" : b.isPast ? "Previous" : `Current • ${countdownLabel(startAt)}`}
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
          disabled={!b.isPast || (b.status !== "confirmed" && b.status !== "completed")}
          className={cx(
            "px-3 py-2 rounded-xl text-xs font-medium inline-flex items-center gap-2",
            b.isPast && (b.status === "confirmed" || b.status === "completed")
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

      {!canCancel && !b.isPast && b.status === "confirmed" && (
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
  hostBookings,
  onRefresh,
  onToast,
}: {
  listings: Spot[];
  user: User | null;
  hostBookings: (Booking & { renterName?: string; renterEmail?: string })[];
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
  const [editAvailabilityRules, setEditAvailabilityRules] = useState<AvailabilityRuleRow[]>([]);
  const [editPhotoFile, setEditPhotoFile] = useState<File | null>(null);
  const [editPhotoPreview, setEditPhotoPreview] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editErrorMsg, setEditErrorMsg] = useState("");

  const openEditModal = async (spot: Spot) => {
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

    const supabase = createClient();
    const { data: windowsData, error } = await supabase
      .from("spot_time_windows")
      .select("*")
      .eq("spot_id", spot.id);

    if (error) {
      console.error("Failed to load spot time windows for edit:", error);
      setEditAvailabilityRules([]);
    } else {
      const windows = (windowsData || []) as SpotTimeWindow[];
      setEditAvailabilityRules(
        windows.map((w) => ({
          date: w.source_type === "specific"
            ? (w.specific_date ?? "")
            : (w.start_date ?? ""),
          start: w.start_time,
          end: w.end_time,
          repeat: w.source_type === "specific"
            ? "none"
            : ((w.repeat_rule ?? "weekly") as AvailabilityRuleRow["repeat"]),
        }))
      );
    }

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
    setEditAvailabilityRules([]);
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

      if (editAvailabilityRules.length === 0) {
        setEditErrorMsg("Please add at least one availability rule.");
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

      const { error: deleteWindowsError } = await supabase
        .from("spot_time_windows")
        .delete()
        .eq("spot_id", editingSpot.id);

      if (deleteWindowsError) {
        setEditErrorMsg(deleteWindowsError.message || "Listing saved, but old availability could not be cleared.");
        return;
      }

      const replacementRows = editAvailabilityRules.map((row) => {
        const isOneTime = row.repeat === "none";

        return {
          spot_id: editingSpot.id,
          source_type: isOneTime ? "specific" : "recurring",
          specific_date: isOneTime ? row.date : null,
          start_date: row.date,
          day_key: isOneTime ? null : getDayKeyFromDate(row.date),
          start_time: row.start,
          end_time: row.end,
          repeat_rule: row.repeat,
        };
      });

      if (replacementRows.length > 0) {
        const { error: insertWindowsError } = await supabase
          .from("spot_time_windows")
          .insert(replacementRows);

        if (insertWindowsError) {
          setEditErrorMsg(insertWindowsError.message || "Listing saved, but availability failed to save.");
          return;
        }
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

                  <div className="mt-10">
                    <div className="text-lg font-semibold">Incoming bookings</div>
                    <div className="mt-1 text-sm text-zinc-600">
                      Bookings made on your listings
                    </div>

                    <div className="mt-4 grid gap-3">
                      {hostBookings.length === 0 ? (
                        <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700">
                          No incoming bookings yet.
                        </div>
                      ) : (
                        hostBookings.map((b) => {
                          const startAt =
                            b.startAt instanceof Date ? b.startAt : new Date(b.startAt);

                          return (
                            <div
                              key={b.id}
                              className="rounded-3xl border border-zinc-200 bg-white p-5"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold truncate">
                                    {b.spot.title}
                                  </div>
                                  <div className="mt-1 text-xs text-zinc-600">
                                    {b.spot.area} • {fmtDateTime(startAt)} • {b.durationHours}h
                                  </div>
                                  <div className="mt-2 text-xs text-zinc-600">
                                    Renter: {b.renterName || "Unknown"}
                                    {b.renterEmail ? ` • ${b.renterEmail}` : ""}
                                  </div>
                                </div>

                                <Badge
                                  tone={
                                    b.status === "cancelled"
                                      ? "Bad"
                                      : b.status === "completed"
                                      ? "Neutral"
                                      : "Good"
                                  }
                                >
                                  {b.status === "cancelled"
                                    ? "Cancelled"
                                    : b.status === "completed"
                                    ? "Completed"
                                    : "Confirmed"}
                                </Badge>
                              </div>

                              <div className="mt-3 text-sm text-zinc-700">
                                Total: <span className="font-semibold">{money(b.total)}</span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
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

              <AvailabilityRulesEditor
                value={editAvailabilityRules}
                onChange={setEditAvailabilityRules}
              />

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
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
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
          return;
        }

        if (mode === "signup") {
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
          return;
        }

        const redirectTo =
          typeof window !== "undefined"
            ? `${window.location.origin}/reset-password`
            : undefined;

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo,
        });

        if (error) {
          setMessage(error.message);
          return;
        }

        setMessage("Password reset email sent. Please check your inbox.");
        setMode("login");
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
          {mode === "login"
            ? "Log in"
            : mode === "signup"
            ? "Create account"
            : "Reset password"}
        </div>
        <div className="mt-2 text-sm text-zinc-600">
          {mode === "reset"
            ? "Enter your email and we will send you a password reset link."
            : "You need an account to book parking, manage listings, and use GigPark."}
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

          {mode !== "reset" && (
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
          )}

          <button
            type="submit"
            disabled={loading}
            className="rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-300"
          >
            {loading
              ? "Please wait..."
              : mode === "login"
              ? "Log in"
              : mode === "signup"
              ? "Create account"
              : "Send reset link"}
          </button>
        </form>

        {message && (
          <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
            {message}
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2">
          {mode === "login" && (
            <>
              <button
                type="button"
                onClick={() => {
                  setMessage("");
                  setMode("signup");
                }}
                className="text-left text-sm text-zinc-600 underline"
              >
                Need an account? Sign up
              </button>

              <button
                type="button"
                onClick={() => {
                  setMessage("");
                  setPassword("");
                  setMode("reset");
                }}
                className="text-left text-sm text-zinc-600 underline"
              >
                Forgot password?
              </button>
            </>
          )}

          {mode === "signup" && (
            <button
              type="button"
              onClick={() => {
                setMessage("");
                setMode("login");
              }}
              className="text-left text-sm text-zinc-600 underline"
            >
              Already have an account? Log in
            </button>
          )}

          {mode === "reset" && (
            <button
              type="button"
              onClick={() => {
                setMessage("");
                setMode("login");
              }}
              className="text-left text-sm text-zinc-600 underline"
            >
              Back to log in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewBooking, setReviewBooking] = useState<Booking | null>(null);
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
  const [hostBookings, setHostBookings] = useState<
    (Booking & { renterName?: string; renterEmail?: string })[]
  >([]);
  const [profile, setProfile] = useState({
    full_name: "",
    email: "",
    phone: "",
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
    const chatBookings = useMemo(() => {
      const byId = new Map<string, Booking>();

      for (const b of bookings) {
        byId.set(b.id, b);
      }

      for (const b of hostBookings) {
        if (!byId.has(b.id)) {
          byId.set(b.id, b);
        }
      }

      return Array.from(byId.values()).sort((a, b) => {
        const aTime = new Date(a.startAt instanceof Date ? a.startAt : a.startAt).getTime();
        const bTime = new Date(b.startAt instanceof Date ? b.startAt : b.startAt).getTime();
        return bTime - aTime;
      });
    }, [bookings, hostBookings]);

  const requireLoginFor = (targetView: View) => {
    setPostLoginView(targetView);
    setView("login");
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setBookings([]);
    setMyListings([]);
    setHostBookings([]);
    setProfile({
      full_name: "",
      email: "",
      phone: "",
    });
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
    features?: string[] | null;
    lat?: number | string | null;
    lng?: number | string | null;
  };

  type BookingRow = {
    id: string;
    renter_id: string;
    spot_id: string;
    start_at: string;
    end_at: string;
    subtotal: number | string;
    tax: number | string;
    total: number | string;
    status: "confirmed" | "cancelled" | "completed" | string;
    created_at?: string;
    spots?: SpotRow | SpotRow[] | null;
  };

  type HostBookingRow = {
    id: string;
    renter_id: string;
    spot_id: string;
    start_at: string;
    end_at: string;
    subtotal: number | string;
    tax: number | string;
    total: number | string;
    status: "confirmed" | "cancelled" | "completed" | string;
    created_at?: string;
    spots?: SpotRow | SpotRow[] | null;
    profiles?: ProfileRow | ProfileRow[] | null;
  };

  type ProfileRow = {
    id: string;
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    created_at?: string | null;
  };

  const mapSpotRow = (s: SpotRow): Spot => ({
    id: s.id,
    owner_id: s.owner_id,
    is_active: s.is_active,
    title: s.title,
    area: s.area,
    priceHour: Number(s.price_hour),
    priceDay: Number(s.price_day),
    addressHint: s.address_hint ?? "",
    photo: s.photo_url ?? null,
    difficulty: s.difficulty ?? "Easy",
    description: s.description ?? "",
    host: { name: "Host", rating: 4.8, reviews: 0 },
    features: s.features ?? [],
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

    const rows = (data || []) as SpotRow[];
    setSpots(rows.map(mapSpotRow));
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

    const rows = (data || []) as SpotRow[];
    setMyListings(rows.map(mapSpotRow));
  };

  const loadBookings = async (currentUser?: User | null) => {
    const activeUser = currentUser ?? user;

    if (!activeUser) {
      setBookings([]);
      return;
    }

    const supabase = createClient();

    const { data, error } = await supabase
      .from("bookings")
      .select(`
        id,
        renter_id,
        spot_id,
        start_at,
        end_at,
        subtotal,
        tax,
        total,
        status,
        created_at,
        spots (*)
      `)
      .eq("renter_id", activeUser.id)
      .order("start_at", { ascending: false });

    if (error) {
      console.error("Failed to load bookings:", error);
      setToast("Failed to load bookings");
      setTimeout(() => setToast(null), 2200);
      return;
    }

    const rows = (data || []) as BookingRow[];

    const mapped = rows
      .map((row): Booking | null => {
        const relatedSpot = Array.isArray(row.spots) ? row.spots[0] : row.spots;

        if (!relatedSpot) return null;

        return {
          id: row.id,
          spot: mapSpotRow(relatedSpot),
          startAt: row.start_at,
          durationHours: Math.max(
            1,
            Math.round(
              (new Date(row.end_at).getTime() - new Date(row.start_at).getTime()) /
                (1000 * 60 * 60)
            )
          ),
          subtotal: Number(row.subtotal),
          tax: Number(row.tax),
          total: Number(row.total),
          status:
            row.status === "cancelled"
              ? "cancelled"
              : row.status === "completed"
              ? "completed"
              : "confirmed",
        };
      })
      .filter((row): row is Booking => row !== null);

    setBookings(mapped);
  };

  const loadHostBookings = async (currentUser?: User | null) => {
    const activeUser = currentUser ?? user;

    if (!activeUser) {
      setHostBookings([]);
      return;
    }

    const supabase = createClient();

    const { data, error } = await supabase
      .from("bookings")
      .select(`
        id,
        renter_id,
        spot_id,
        start_at,
        end_at,
        subtotal,
        tax,
        total,
        status,
        created_at,
        spots (*)
      `)
      .order("start_at", { ascending: false });

    if (error) {
      console.error("Failed to load host bookings:", error);
      setToast("Failed to load host bookings");
      setTimeout(() => setToast(null), 2200);
      return;
    }

    const rows = (data || []) as BookingRow[];

    const hostRows = rows.filter((row) => {
      const relatedSpot = Array.isArray(row.spots) ? row.spots[0] : row.spots;
      return !!relatedSpot && relatedSpot.owner_id === activeUser.id;
    });

    const renterIds = Array.from(
      new Set(hostRows.map((row) => row.renter_id).filter(Boolean))
    );

    let profilesMap = new Map<string, ProfileRow>();

    if (renterIds.length > 0) {
      const { data: profileRows, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .in("id", renterIds);

      if (profilesError) {
        console.error("Failed to load renter profiles:", profilesError);
      } else {
        profilesMap = new Map(
          ((profileRows || []) as ProfileRow[]).map((p) => [p.id, p])
        );
      }
    }

    const mapped = hostRows
      .map((row): (Booking & { renterName?: string; renterEmail?: string }) | null => {
        const relatedSpot = Array.isArray(row.spots) ? row.spots[0] : row.spots;
        if (!relatedSpot) return null;

        const renterProfile = profilesMap.get(row.renter_id);

        return {
          id: row.id,
          spot: mapSpotRow(relatedSpot),
          startAt: row.start_at,
          durationHours: Math.max(
            1,
            Math.round(
              (new Date(row.end_at).getTime() - new Date(row.start_at).getTime()) /
                (1000 * 60 * 60)
            )
          ),
          subtotal: Number(row.subtotal),
          tax: Number(row.tax),
          total: Number(row.total),
          status:
            row.status === "cancelled"
              ? "cancelled"
              : row.status === "completed"
              ? "completed"
              : "confirmed",
          renterName: renterProfile?.full_name ?? "",
          renterEmail: renterProfile?.email ?? "",
        };
      })
      .filter(
        (row): row is Booking & { renterName?: string; renterEmail?: string } =>
          row !== null
      );

    setHostBookings(mapped);
  };

  const loadProfile = async (currentUser?: User | null) => {
    const activeUser = currentUser ?? user;

    if (!activeUser) {
      setProfile({
        full_name: "",
        email: "",
        phone: "",
      });
      return;
    }

    setProfileLoading(true);

    try {
      const supabase = createClient();

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", activeUser.id)
        .maybeSingle();

      if (error) {
        console.error("Failed to load profile:", error);
        setToast("Failed to load profile");
        setTimeout(() => setToast(null), 2200);
        return;
      }

      const row = (data as ProfileRow | null) ?? null;

      setProfile({
        full_name: row?.full_name ?? "",
        email: row?.email ?? activeUser.email ?? "",
        phone: row?.phone ?? "",
      });
    } finally {
      setProfileLoading(false);
    }
  };

  const saveProfile = async (next: { full_name: string; phone: string }) => {
    if (!user) return;

    setProfileSaving(true);

    try {
      const supabase = createClient();

      const payload = {
        id: user.id,
        full_name: next.full_name,
        email: user.email ?? "",
        phone: next.phone,
      };

      const { error } = await supabase
        .from("profiles")
        .upsert(payload, { onConflict: "id" });

      if (error) {
        console.error("Failed to save profile:", error);
        setToast(error.message || "Failed to save profile");
        setTimeout(() => setToast(null), 2200);
        return;
      }

      setProfile((prev) => ({
        ...prev,
        full_name: next.full_name,
        email: user.email ?? prev.email,
        phone: next.phone,
      }));

      setToast("Profile saved");
      setTimeout(() => setToast(null), 2200);
    } finally {
      setProfileSaving(false);
    }
  };

  useEffect(() => {
  const supabase = createClient();

  const loadUser = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    setUser(user ?? null);
    await loadMyListings(user ?? null);
    await loadBookings(user ?? null);
    await loadHostBookings(user ?? null);
    await loadProfile(user ?? null);
  };

  loadUser();
  loadSpots();

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    const nextUser = session?.user ?? null;
    setUser(nextUser);
    loadMyListings(nextUser);
    loadBookings(nextUser);
    loadHostBookings(nextUser);
    loadProfile(nextUser);
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

  const confirmPayment = async () => {
    const p = checkoutPayload;
    if (!p || !user) return;

    const supabase = createClient();

    const endAt = new Date(
      new Date(p.startAt).getTime() + p.durationHours * 60 * 60 * 1000
    );

    const { data: latestSpot, error: latestSpotError } = await supabase
      .from("spots")
      .select("id, owner_id, is_active")
      .eq("id", p.spot.id)
      .maybeSingle();

    if (latestSpotError || !latestSpot) {
      console.error("Spot reload error:", latestSpotError);
      setToast("Could not verify listing");
      setTimeout(() => setToast(null), 2200);
      return;
    }

    if (latestSpot.is_active === false) {
      setCheckoutOpen(false);
      setCheckoutPayload(null);
      setToast("This listing is no longer active");
      setTimeout(() => setToast(null), 2200);
      return;
    }

    if (latestSpot.owner_id === user.id) {
      setCheckoutOpen(false);
      setCheckoutPayload(null);
      setToast("You cannot book your own listing");
      setTimeout(() => setToast(null), 2200);
      return;
    }

    const { data: windows, error: windowsError } = await supabase
      .from("spot_time_windows")
      .select("*")
      .eq("spot_id", p.spot.id);

    if (windowsError) {
      console.error("Availability reload error:", windowsError);
      setToast("Could not verify availability");
      setTimeout(() => setToast(null), 2200);
      return;
    }

    const safeWindows = (windows || []) as SpotTimeWindow[];

    const stillAvailableByRule = bookingMatchesAnyAvailabilityWindow(
      p.bookingDate,
      p.bookingStartTime,
      p.durationHours,
      safeWindows
    );

    if (!stillAvailableByRule) {
      setCheckoutOpen(false);
      setCheckoutPayload(null);
      setToast("That time is no longer within the listing availability");
      setTimeout(() => setToast(null), 2200);
      return;
    }

    const { data: conflicts, error: conflictError } = await supabase
      .from("bookings")
      .select("id, start_at, end_at, status")
      .eq("spot_id", p.spot.id)
      .neq("status", "cancelled")
      .lt("start_at", endAt.toISOString())
      .gt("end_at", new Date(p.startAt).toISOString());

    if (conflictError) {
      console.error("Conflict check error:", conflictError);
      setToast("Could not verify availability");
      setTimeout(() => setToast(null), 2200);
      return;
    }

    if (conflicts && conflicts.length > 0) {
      setCheckoutOpen(false);
      setCheckoutPayload(null);
      setToast("This spot is already booked for that time");
      setTimeout(() => setToast(null), 2200);
      return;
    }

    const { data: insertedBooking, error } = await supabase
      .from("bookings")
      .insert({
        renter_id: user.id,
        spot_id: p.spot.id,
        start_at: new Date(p.startAt).toISOString(),
        end_at: endAt.toISOString(),
        subtotal: p.subtotal,
        tax: p.tax,
        total: p.total,
        status: "confirmed",
      })
      .select("id")
      .single();

    if (error || !insertedBooking) {
      console.error("Booking insert error:", error);
      setToast(error?.message || "Failed to confirm booking");
      setTimeout(() => setToast(null), 2200);
      return;
    }

    const { error: messageError } = await supabase.from("messages").insert({
      booking_id: insertedBooking.id,
      sender_id: user.id,
      text: "Hi! I just booked this spot.",
    });

    if (messageError) {
      console.error("Initial message insert error:", messageError);
    }

    await loadBookings(user);
    await loadHostBookings(user);
    await loadSpots();
    await loadMyListings(user);

    setCheckoutOpen(false);
    setCheckoutPayload(null);
    setView("bookings");
    setToast(`Booking confirmed: ${money(p.total)}`);
    setTimeout(() => setToast(null), 2800);
  };

  const cancelBooking = async (b: Booking) => {
    if (!user) return;

    const supabase = createClient();

    const { error } = await supabase
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", b.id)
      .eq("renter_id", user.id);

    if (error) {
      console.error("Cancel booking error:", error);
      setToast(error.message || "Failed to cancel booking");
      setTimeout(() => setToast(null), 2200);
      return;
    }

    await loadBookings(user);
    await loadHostBookings(user);
    await loadSpots();
    await loadMyListings(user);
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

  const leaveReview = (b?: Booking) => {
    if (!user) {
      requireLoginFor("bookings");
      return;
    }

    if (!b) return;

    setReviewBooking(b);
    setReviewOpen(true);
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

          if (user && v === "my-listings") {
            loadMyListings(user);
            loadHostBookings(user);
          }

          if (user && v === "chat") {
            loadBookings(user);
            loadHostBookings(user);
          }

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
          hostBookings={hostBookings}
          onRefresh={async () => {
            await loadSpots();
            await loadMyListings(user);
            await loadHostBookings(user);
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
            await loadHostBookings(user);
          }}
          user={user}
          onRequireLogin={() => requireLoginFor("host")}
        />
      )}

      {view === "chat" && (
        <ChatPage
          user={user}
          bookings={chatBookings}
          onOpenBooking={(b) => {
            setToast(`Opening booking: ${b.spot.title}`);
            setTimeout(() => setToast(null), 1800);
            setView("bookings");
          }}
          onRequireLogin={() => requireLoginFor("chat")}
        />
      )}

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
          profile={profile}
          profileLoading={profileLoading}
          profileSaving={profileSaving}
          onSaveProfile={saveProfile}
          hasPaymentMethod={hasPaymentMethod}
          setHasPaymentMethod={setHasPaymentMethod}
          bookings={bookings}
          myListings={myListings}
          onGoBookings={() => setView("bookings")}
          onRequireLogin={() => requireLoginFor("profile")}
        />
      )}

      {view === "login" && (
        <LoginPage
          onSuccess={() => {
            if (postLoginView !== "detail") {
              setSelected(null);
              setCheckoutOpen(false);
              setCheckoutPayload(null);
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
        onClose={() => {
          setCheckoutOpen(false);
          setCheckoutPayload(null);
        }}
        onConfirm={confirmPayment}
      />

      <ReviewModal
        open={reviewOpen}
        booking={reviewBooking}
        onClose={() => {
          setReviewOpen(false);
          setReviewBooking(null);
        }}
        onSubmitted={async () => {
          setToast("Review submitted");
          setTimeout(() => setToast(null), 2200);
        }}
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
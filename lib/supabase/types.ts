export type Spot = {
  id: string;
  owner_id: string;
  title: string;
  area: string;
  address_hint: string | null;
  photo_url: string | null;
  price_hour: number;
  price_day: number;
  difficulty: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
};

export type BookingStatus = "confirmed" | "cancelled" | "completed";

export type Booking = {
  id: string;
  renter_id: string;
  spot_id: string;
  start_at: string;
  end_at: string;
  subtotal: number;
  tax: number;
  total: number;
  status: BookingStatus;
  created_at: string;
  spot?: Spot;
};

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
};
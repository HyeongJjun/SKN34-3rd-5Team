export type Page<T> = { count: number; next: string | null; previous: string | null; results: T[] };
export type BaseballStadium = {
  id: number; stadium_code: string; stadium_name_ko: string; address: string;
  longitude: string; latitude: string; geocode_source: string; collected_at: string;
  facility_manager: string | null; game_operator: string | null;
  phone_general: string | null; phone_facility: string | null; phone_ticket: string | null;
  home_teams: { id: number; team_id: number; code: string; name: string; season: number }[];
};

export type SeatZone = { id: number; zone_name_ko: string; level: string | null; side: string | null; seat_type: string | null; group_size: number | null; accessible: boolean | null };
export type TicketPrice = { id: number; seat_zone_code: string; seat_zone_name: string; price_tier: string | null; day_type: string | null; customer_type: string | null; group_size: number | null; price_krw: number; valid_from: string | null; valid_to: string | null; discount_condition: string | null };
export type TicketPolicy = { id: number; policy_type: string; subtype: string; open_at: string | null; max_tickets: number | null; booking_channel: string; channel_condition: string; collected_at: string };
export type SeatMapAsset = { id: number; asset_no: number; asset_url: string; asset_role: string | null };
export type SeatMap = { id: number; map_title: string; page_url: string; assets: SeatMapAsset[] };
export type SeatView = { id: number; view_characteristic: string; roof_coverage: string | null; evidence_scope: string | null };
export type FoodStore = { id: number; store_facility: string; location_qty: number | null; locations: { id: number; floor: string | null; zone_location: string | null }[]; menus: { id: number; menu_category_official: string }[] };
export type Transport = { id: number; mode: string; title: string; details: string | null; parking_spaces: number | null; reservation_required: boolean | null };
export type Facility = { id: number; facility_type: string; floor: string | null; side: string | null; nearby_section: string | null; gate: string | null; gender: string | null; indoor_outdoor: string | null; location_detail: string | null };
export type StadiumContent = { id: number; content_type: string; name: string; floor: string | null; location: string | null; official_description: string | null; operating_condition: string | null };

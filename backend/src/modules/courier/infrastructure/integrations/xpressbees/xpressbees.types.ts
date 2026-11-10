export interface XpressbeesEnvelope<T> {
  status?: boolean;
  message?: string;
  data?: T;
}

export interface XpressbeesService {
  id?: string | number;
  name?: string;
  freight_charges?: number;
  cod_charges?: number;
  total_charges?: number;
}

export interface XpressbeesBooking {
  awb_number?: string;
  courier_id?: string | number;
  courier_name?: string;
  label?: string;
  shipment_id?: string | number;
}

export interface XpressbeesTracking {
  status?: string;
  history?: { status_code?: string; location?: string; event_time?: string; message?: string }[];
}

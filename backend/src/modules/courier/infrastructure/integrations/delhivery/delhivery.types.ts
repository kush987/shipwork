export interface DelhiveryPincodeResponse {
  delivery_codes?: { postal_code?: { pin?: number | string; pre_paid?: string; cod?: string; pickup?: string; is_oda?: string } }[];
}

export interface DelhiveryCharge {
  total_amount?: number;
  gross_amount?: number;
  charge_COD?: number;
}

export interface DelhiveryCreateResponse {
  success?: boolean;
  rmk?: string;
  packages?: { status?: string; waybill?: string; refnum?: string; remarks?: string[] | string }[];
}

export interface DelhiveryScan {
  ScanDetail?: { Scan?: string; ScanDateTime?: string; ScannedLocation?: string; Instructions?: string; StatusCode?: string };
}

export interface DelhiveryTrackResponse {
  Error?: string;
  ShipmentData?: {
    Shipment?: {
      AWB?: string;
      ReferenceNo?: string;
      Status?: { Status?: string; StatusDateTime?: string; StatusLocation?: string; Instructions?: string };
      Scans?: DelhiveryScan[];
    };
  }[];
}

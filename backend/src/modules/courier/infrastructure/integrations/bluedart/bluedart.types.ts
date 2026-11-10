export interface BluedartStatus {
  StatusCode?: string;
  StatusInformation?: string;
}

export interface BluedartPincodeResult {
  GetServicesforPincodeResult?: { IsError?: boolean; ErrorMessage?: string; eTailCODAirInbound?: string; eTailPrePaidAirInbound?: string; PincodeDescription?: string };
}

export interface BluedartWaybillResult {
  GenerateWayBillResult?: { AWBNo?: string; IsError?: boolean; Status?: BluedartStatus[] };
}

export interface BluedartCancelResult {
  CancelWaybillResult?: { IsError?: boolean; Status?: BluedartStatus[] };
}

export interface BluedartScanDetail {
  Scan?: string;
  ScanDate?: string;
  ScanTime?: string;
  ScannedLocation?: string;
}

export interface BluedartTrackResult {
  ShipmentData?: {
    Error?: string;
    Shipment?: { WaybillNo?: string; Status?: string; Scans?: { ScanDetail?: BluedartScanDetail | BluedartScanDetail[] } | { ScanDetail?: BluedartScanDetail }[] }[];
  };
}

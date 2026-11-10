export interface EkartToken {
  access_token?: string;
  expires_in?: number;
}

export interface EkartServiceability {
  status?: boolean;
  remark?: string;
  details?: { cod?: boolean; prepaid?: boolean };
}

export interface EkartCreated {
  status?: boolean;
  remark?: string;
  tracking_id?: string;
  barcodes?: { wbn?: string };
}

export interface EkartTrack {
  track?: { status?: string; details?: { status?: string; ctime?: number | string; location?: string; desc?: string }[] };
}

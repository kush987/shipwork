#!/usr/bin/env bash
# A complete run through the courier aggregator API: a seller signs up, adds a pickup warehouse and
# a returns (RTO) warehouse, checks rates and creates a shipment from one returning to the other;
# an admin recharges the wallet; the seller books; the courier
# reports scans up to delivery (the COD is credited to the wallet); anyone tracks it.
#
# Each request is printed with its response. Ids and tokens are carried from one call to the next.
# It creates real records (a seller, a shipment…) in the workspace you point it at.
#
#   BASE         the workspace's API     (default: the Logistics workspace on this machine)
#   ADMIN_EMAIL / ADMIN_PASSWORD         an app user with the role "admin"
#   COURIER_KEY  the courier partners' API key; without it the courier scans are skipped
set -euo pipefail

BASE=${BASE:-http://localhost:3000/api/run/logistics-530a0c}
ADMIN_EMAIL=${ADMIN_EMAIL:-admin@example.com}
ADMIN_PASSWORD=${ADMIN_PASSWORD:-admin-password-1}
COURIER_KEY=${COURIER_KEY:-}
STAMP=$(date +%s)

# call METHOD PATH [BODY] [AUTH-HEADER] → prints the request and response, keeps the response in $RESPONSE
call() {
  local method=$1 path=$2 body=${3:-} auth=${4:-}
  echo
  echo "▶ $method $BASE$path"
  [ -n "$body" ] && echo "$body"
  local args=(-s -X "$method" "$BASE$path" -H 'content-type: application/json' -w '\n%{http_code}')
  [ -n "$auth" ] && args+=(-H "$auth")
  [ -n "$body" ] && args+=(-d "$body")
  local out
  out=$(curl "${args[@]}")
  RESPONSE=$(printf '%s' "$out" | sed '$d')
  echo "◀ $(printf '%s' "$out" | tail -n1)"
  printf '%s' "$RESPONSE" | python3 -m json.tool 2>/dev/null || printf '%s\n' "$RESPONSE"
}
# field PATH → reads a value from the last response, e.g. field warehouse.id
field() { printf '%s' "$RESPONSE" | python3 -c 'import sys, json
value = json.load(sys.stdin)
for key in sys.argv[1].split("."):
    value = value[int(key)] if isinstance(value, list) else value[key]
print(value)' "$1"; }

SELLER_EMAIL="asha-$STAMP@example.com"

echo "═══ 1. Seller signs up (public)"
call POST /auth/signup "{
  \"name\": \"Asha Traders\",
  \"email\": \"$SELLER_EMAIL\",
  \"password\": \"asha-pass-123\"
}"
SELLER_TOKEN=$(field token)
SELLER_ID=$(field id)
SELLER="authorization: Bearer $SELLER_TOKEN"

echo "═══ 2. Seller adds warehouses: one parcels are picked up from, one undelivered parcels return to (RTO)"
call POST /warehouses '{
  "name": "Okhla warehouse",
  "contactName": "Ravi Kumar",
  "phone": "9811111111",
  "line1": "Plot 4, Okhla Industrial Area Phase 2",
  "city": "New Delhi",
  "state": "Delhi",
  "pincode": "110020"
}' "$SELLER"
PICKUP_WAREHOUSE_ID=$(field warehouse.id)
call POST /warehouses '{
  "name": "Gurugram returns centre",
  "contactName": "Sunil Yadav",
  "phone": "9822222222",
  "line1": "Khasra 112, Sector 37",
  "line2": "Behind Hero Honda Chowk",
  "city": "Gurugram",
  "state": "Haryana",
  "pincode": "122001"
}' "$SELLER"
RTO_WAREHOUSE_ID=$(field warehouse.id)
call GET /warehouses '' "$SELLER"

echo "═══ 3. Seller compares courier rates"
call POST /rates '{
  "pickupPincode": "110020",
  "deliveryPincode": "560001",
  "weightKg": 2,
  "paymentMode": "COD",
  "codAmount": 100
}' "$SELLER"

echo "═══ 4. Seller creates a shipment (no orderId: one is made)"
call POST /shipments "{
  \"paymentMode\": \"COD\",
  \"codAmount\": 100,
  \"orderValue\": 100,
  \"weightKg\": 2,
  \"dimensions\": { \"lengthCm\": 30, \"breadthCm\": 20, \"heightCm\": 15 },
  \"customer\": { \"name\": \"Meera Iyer\", \"phone\": \"9845012345\" },
  \"deliveryAddress\": {
    \"line1\": \"12 MG Road\",
    \"line2\": \"Near Trinity Metro\",
    \"city\": \"Bengaluru\",
    \"state\": \"Karnataka\",
    \"pincode\": \"560001\"
  },
  \"pickupWarehouseId\": \"$PICKUP_WAREHOUSE_ID\",
  \"rtoWarehouseId\": \"$RTO_WAREHOUSE_ID\",
  \"items\": [{ \"name\": \"Cotton kurta\", \"sku\": \"KU-101\", \"qty\": 2, \"price\": 50 }]
}" "$SELLER"
SHIPMENT_ID=$(field shipmentId)

echo "═══ 5. Admin logs in and recharges the seller's wallet"
call POST /auth/login "{ \"email\": \"$ADMIN_EMAIL\", \"password\": \"$ADMIN_PASSWORD\" }"
ADMIN="authorization: Bearer $(field token)"
call POST /admin/wallet/recharge "{
  \"email\": \"$SELLER_EMAIL\",
  \"amount\": 1000,
  \"reference\": \"pay-$STAMP\"
}" "$ADMIN"

echo "═══ 6. Seller books the shipment (cheapest courier; or send {\"courier\": \"bluedart\"})"
call POST "/shipments/$SHIPMENT_ID/book" '{}' "$SELLER"
AWB=$(field awb)

echo "═══ 7. Seller looks at the shipment, their list and their wallet"
call GET "/shipments/$SHIPMENT_ID" '' "$SELLER"
call GET '/shipments?page=1&pageSize=10' '' "$SELLER"
call GET /wallet '' "$SELLER"

if [ -n "$COURIER_KEY" ]; then
  echo "═══ 8. The courier reports scans (API key)"
  COURIER="x-api-key: $COURIER_KEY"
  call POST /courier/status-updates "{ \"awb\": \"$AWB\", \"status\": \"picked_up\", \"location\": \"New Delhi\" }" "$COURIER"
  call POST /courier/status-updates "{ \"awb\": \"$AWB\", \"status\": \"in_transit\", \"location\": \"Nagpur hub\" }" "$COURIER"
  call POST /courier/status-updates "{ \"awb\": \"$AWB\", \"status\": \"out_for_delivery\", \"location\": \"Bengaluru\" }" "$COURIER"
  call POST /courier/status-updates "{ \"awb\": \"$AWB\", \"status\": \"delivered\", \"location\": \"Bengaluru\", \"note\": \"Handed to Meera\" }" "$COURIER"
  sleep 2 # the COD credit runs in the background
  call GET /wallet '' "$SELLER"
else
  echo "═══ 8. Courier scans skipped: set COURIER_KEY to the courier partners' API key"
fi

echo "═══ 9. Anyone tracks it (public)"
call GET "/track/$AWB"

echo "═══ 10. Seller's reports"
call GET '/reports/shipments?days=30' '' "$SELLER"
call GET '/reports/wallet?days=30' '' "$SELLER"

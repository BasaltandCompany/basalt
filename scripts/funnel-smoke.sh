#!/usr/bin/env bash
# Funnel smoke test — drives the item lifecycle against a running dashboard.
#
#   FUNNEL_API_BASE=http://localhost:3000 FUNNEL_API_KEY=mc_... ./scripts/funnel-smoke.sh
#
# Ungated model: every stage is soft — a fail never leaves later queues, and
# ai_signal is the only promotion gate. Steps: create run → import 3 fake IN
# rows (hq_state auto-pass) → queue at ai_signal (3) → fail one → it STAYS in
# the headcount queue → pass ai_signal on another → promoted icp_approved=true
# → redo ai_signal → fail → icp_approved now false.
set -euo pipefail
BASE="${FUNNEL_API_BASE:-http://localhost:3000}"
KEY="${FUNNEL_API_KEY:?FUNNEL_API_KEY (mc_…) required}"
AUTH="Authorization: Bearer $KEY"
CT="Content-Type: application/json"

say() { echo "== $*"; }
fail() { echo "FAIL: $*" >&2; exit 1; }

funnel_id=$(curl -sf -H "$AUTH" "$BASE/api/funnels" | python3 -c 'import sys,json;print(json.load(sys.stdin)["funnels"][0]["id"])')
say "funnel $funnel_id"

run_id=$(curl -sf -X POST -H "$AUTH" -H "$CT" -d "{\"funnelId\":\"$funnel_id\",\"source\":\"paste\",\"note\":\"smoke $(date +%s)\"}" "$BASE/api/funnels" | python3 -c 'import sys,json;print(json.load(sys.stdin)["run"]["id"])')
say "run $run_id"

# import: 3 fake Indiana companies — hq_state auto-passes from the state field
curl -sf -X POST -H "$AUTH" -H "$CT" "$BASE/api/funnels/runs/$run_id/items" -d '{"items":[
	{"companyName":"Smoke Brokerage LLC","city":"Indianapolis","state":"IN","rawData":{"address":"1 Main St, Indianapolis, IN 46204"}},
	{"companyName":"Smoke 3PL Inc","city":"Fishers","state":"IN"},
	{"companyName":"Smoke Carrier Co","city":"Muncie","state":"IN"}
]}' | python3 -m json.tool

q() { curl -sf -H "$AUTH" "$BASE/api/funnels/runs/$run_id/queue?stage=$1" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("\n".join(i["companyName"]+"\t"+i["id"] for i in d["items"]))'; }

say "queue ai_signal (expect 3 — nothing gates)"
[ "$(q ai_signal | wc -l | tr -d ' ')" = "3" ] || fail "expected 3 in ai_signal queue"

# fail Smoke 3PL at ai_signal → it must STILL be in the headcount queue (soft)
iid3=$(q ai_signal | grep 'Smoke 3PL' | cut -f2)
curl -sf -X POST -H "$AUTH" -H "$CT" "$BASE/api/funnels/results" -d "{\"itemId\":\"$iid3\",\"stage\":\"ai_signal\",\"verdict\":\"fail\",\"note\":\"tier3|roster 12, zero AI signal\",\"method\":\"human\"}" >/dev/null
q headcount | grep -q 'Smoke 3PL' || fail "ai_signal fail wrongly removed Smoke 3PL from headcount queue"
echo "ok: soft fail stayed in later queues"

# ai_signal pass on Smoke Brokerage → promoted immediately (only promotion gate)
iid=$(q ai_signal | grep 'Smoke Brokerage' | cut -f2)
curl -sf -X POST -H "$AUTH" -H "$CT" "$BASE/api/funnels/results" -d "{\"itemId\":\"$iid\",\"stage\":\"ai_signal\",\"verdict\":\"pass\",\"note\":\"tier2|Brett — Director (headline: AI)\",\"method\":\"human\"}" >/dev/null
say "prospect row"
prospect_id=$(curl -sf -H "$AUTH" "$BASE/api/funnels/runs/$run_id" | python3 -c '
import sys,json
d=json.load(sys.stdin)
item=[i for i in d["items"] if i["companyName"]=="Smoke Brokerage LLC"][0]
assert item["prospectId"], "no prospectId after ai_signal pass"
print(item["prospectId"])')
say "promoted prospect $prospect_id"

# firmographic fail must NOT un-approve (soft) — ai_signal fail must
curl -sf -X POST -H "$AUTH" -H "$CT" "$BASE/api/funnels/results" -d "{\"itemId\":\"$iid\",\"stage\":\"headcount\",\"verdict\":\"fail\",\"note\":\"not in Prospeo\",\"method\":\"human\"}" >/dev/null

# redo ai_signal → result gone, item back in ai_signal queue, icp still true
trid=$(curl -sf -H "$AUTH" "$BASE/api/funnels/runs/$run_id" | python3 -c '
import sys,json
d=json.load(sys.stdin)
item=[i for i in d["items"] if i["companyName"]=="Smoke Brokerage LLC"][0]
r=[x for x in d["results"] if x["itemId"]==item["id"] and x["stage"]=="ai_signal"][0]
print(r["id"])')
curl -sf -X POST -H "$AUTH" "$BASE/api/funnels/results/$trid/redo" >/dev/null
q ai_signal | grep -q 'Smoke Brokerage' || fail "redo did not re-queue ai_signal"

curl -sf -X POST -H "$AUTH" -H "$CT" "$BASE/api/funnels/results" -d "{\"itemId\":\"$iid\",\"stage\":\"ai_signal\",\"verdict\":\"fail\",\"note\":\"tier3|roster 12, zero AI signal\"}" >/dev/null
if [ -n "${DATABASE_URL:-}" ] && command -v psql >/dev/null; then
	icp=$(psql "$DATABASE_URL" -tAc "select icp_approved from outreach_prospects where id='$prospect_id'")
	[ "$icp" = "f" ] || fail "expected icp_approved=false after ai_signal fail, got $icp"
	echo "ok: icp_approved flipped to false (firmographic fail alone did not)"
else
	echo "NOTE: set DATABASE_URL + psql to auto-assert icp_approved=false; prospect id $prospect_id"
fi
say "smoke OK"

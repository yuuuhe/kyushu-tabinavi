"""出発前に1回だけ動かすデータ準備スクリプト。

  python scripts/prepare_data.py

やること:
  1. data/spots.json にタグ（絶景・紅葉・雨OK・夜・車なしOK）、needs_check、最寄り主要都市 hub を追加
  2. data/hubs.json（主要都市・駅）を書き出す
  3. data/transit.json（電車・バスの目安。docs/02 の3章を元に手入力）を書き出す
  4. OSRM 公開デモサーバで全地点の車の所要時間を一括計算 → data/car_matrix.json
  5. Open-Meteo Historical で主要都市の 11/14〜24 の平年値（過去10年平均）→ data/normals.json
"""
import json
import math
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
UA = {"User-Agent": "kyushu-trip-planner/1.0 (personal trip app)"}


def get_json(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def dist_km(a, b):
    r = 6371
    p1, p2 = math.radians(a["lat"]), math.radians(b["lat"])
    dp = p2 - p1
    dl = math.radians(b["lng"] - a["lng"])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


# ---------- 主要都市 ----------
HUBS = [
    {"id": "fukuoka-airport", "name": "福岡空港", "pref": "福岡", "lat": 33.5859, "lng": 130.4507},
    {"id": "hakata", "name": "博多駅", "pref": "福岡", "lat": 33.5902, "lng": 130.4207},
    {"id": "kokura", "name": "小倉駅", "pref": "福岡", "lat": 33.8868, "lng": 130.8826},
    {"id": "saga", "name": "佐賀駅", "pref": "佐賀", "lat": 33.2643, "lng": 130.2973},
    {"id": "takeo", "name": "武雄温泉駅", "pref": "佐賀", "lat": 33.1950, "lng": 130.0197},
    {"id": "nagasaki", "name": "長崎駅", "pref": "長崎", "lat": 32.7525, "lng": 129.8700},
    {"id": "sasebo", "name": "佐世保駅", "pref": "長崎", "lat": 33.1665, "lng": 129.7240},
    {"id": "kumamoto", "name": "熊本駅", "pref": "熊本", "lat": 32.7899, "lng": 130.6886},
    {"id": "aso", "name": "阿蘇駅", "pref": "熊本", "lat": 32.9484, "lng": 131.1210},
    {"id": "takachiho", "name": "高千穂バスセンター", "pref": "宮崎", "lat": 32.7114, "lng": 131.3077},
    {"id": "oita", "name": "大分駅", "pref": "大分", "lat": 33.2333, "lng": 131.6066},
    {"id": "beppu", "name": "別府駅", "pref": "大分", "lat": 33.2794, "lng": 131.5003},
    {"id": "yufuin", "name": "由布院駅", "pref": "大分", "lat": 33.2655, "lng": 131.3555},
    {"id": "miyazaki", "name": "宮崎駅", "pref": "宮崎", "lat": 31.9156, "lng": 131.4320},
    {"id": "kagoshima", "name": "鹿児島中央駅", "pref": "鹿児島", "lat": 31.5838, "lng": 130.5413},
]

# ---------- 電車・バスの目安（分。min〜max）----------
# realistic=False は「公共交通は現実的でない」区間。note は注意書き。
T = lambda a, b, lo, hi, how, note="", realistic=True: {
    "a": a, "b": b, "min": lo, "max": hi, "how": how, "note": note, "realistic": realistic}
TRANSIT = [
    T("fukuoka-airport", "hakata", 5, 10, "福岡市地下鉄空港線"),
    T("hakata", "kokura", 15, 20, "山陽新幹線", "JR九州のパスは対象外になりやすい（要確認）。在来線特急なら約45〜60分"),
    T("hakata", "saga", 35, 40, "特急かもめ・みどり"),
    T("saga", "takeo", 25, 30, "特急"),
    T("hakata", "takeo", 60, 65, "特急リレーかもめ"),
    T("takeo", "nagasaki", 25, 30, "西九州新幹線"),
    T("hakata", "nagasaki", 80, 90, "特急リレーかもめ＋西九州新幹線（武雄温泉乗換）"),
    T("hakata", "sasebo", 105, 115, "特急みどり"),
    T("sasebo", "nagasaki", 90, 110, "快速シーサイドライナー", "本数・時間は要確認"),
    T("hakata", "kumamoto", 35, 50, "九州新幹線"),
    T("hakata", "kagoshima", 80, 100, "九州新幹線"),
    T("kumamoto", "kagoshima", 45, 50, "九州新幹線"),
    T("hakata", "beppu", 110, 120, "特急ソニック"),
    T("hakata", "oita", 120, 130, "特急ソニック"),
    T("kokura", "beppu", 65, 75, "特急ソニック"),
    T("kokura", "oita", 75, 85, "特急ソニック"),
    T("beppu", "oita", 10, 15, "JR日豊本線"),
    T("hakata", "yufuin", 130, 140, "特急ゆふいんの森／高速バス", "ゆふいんの森は全席指定・要予約"),
    T("oita", "yufuin", 50, 60, "JR久大本線"),
    T("yufuin", "beppu", 50, 60, "路線バス"),
    T("hakata", "miyazaki", 180, 200, "九州新幹線→新八代で高速バス「B&Sみやざき」", "高速バス直行は約4時間半"),
    T("kumamoto", "aso", 70, 100, "JR豊肥本線", "本数少なめ"),
    T("kumamoto", "takachiho", 180, 190, "特急バス「たかちほ号」", "要予約・1日数本"),
    T("aso", "takachiho", 0, 0, "", "バスの本数がごく少ない。車が現実的（約1時間10分）", False),
    T("kumamoto", "nagasaki", 120, 130, "新幹線＋特急（新鳥栖・武雄温泉経由）", "島原経由フェリーもあり"),
    T("kumamoto", "beppu", 180, 190, "特急「九州横断特急」（阿蘇経由）", "1日数本"),
    T("aso", "beppu", 110, 130, "特急「九州横断特急」", "1日数本・時間は要確認"),
    T("aso", "yufuin", 0, 0, "", "直通の公共交通は限られる。車が現実的（約1時間30分、やまなみハイウェイ）", False),
    T("oita", "miyazaki", 190, 200, "特急にちりん"),
    T("miyazaki", "takachiho", 150, 180, "特急で延岡→バス", "延岡からのバスは本数少"),
    T("miyazaki", "kagoshima", 130, 160, "特急きりしま／高速バス"),
]

# ---------- タグ ----------
SCENIC_EXTRA = {"kum-08", "oit-05", "kag-08", "kag-09", "nag-09", "miy-03", "fuk-07", "sag-03"}
RAIN_OK = {"fuk-02", "nag-02", "nag-04", "nag-05", "nag-06", "kum-02", "kum-07", "oit-02",
           "sag-02", "sag-04", "kag-04", "kag-05", "kag-06", "miy-08", "nag-08"}
NIGHT = {"fuk-03", "fuk-04", "nag-03", "nag-08", "miy-02", "miy-08", "kag-03", "kag-04", "sag-01"}


def prepare_spots(spots):
    for s in spots:
        tags = []
        if s["category"] == "絶景" or s["id"] in SCENIC_EXTRA:
            tags.append("絶景")
        if "紅葉" in s.get("november_highlight", ""):
            tags.append("紅葉")
        if s["id"] in RAIN_OK:
            tags.append("雨OK")
        if s["id"] in NIGHT:
            tags.append("夜")
        if s.get("transit_friendly"):
            tags.append("車なしOK")
        s["tags"] = tags
        text = s.get("november_highlight", "") + s.get("description", "")
        s["needs_check"] = "要確認" in text
        s["hub"] = min(HUBS[1:], key=lambda h: dist_km(s, h))["id"]  # 空港は除く
    return spots


def car_matrix(points):
    coords = ";".join(f"{p['lng']:.5f},{p['lat']:.5f}" for p in points)
    url = f"https://router.project-osrm.org/table/v1/driving/{coords}?annotations=duration,distance"
    d = get_json(url)
    if d.get("code") != "Ok":
        raise RuntimeError(d)
    ids = [p["id"] for p in points]
    minutes = [[None if v is None else round(v / 60) for v in row] for row in d["durations"]]
    km = [[None if v is None else round(v / 1000, 1) for v in row] for row in d["distances"]]
    return {"source": "OSRM demo server (router.project-osrm.org), © OpenStreetMap contributors",
            "generated": time.strftime("%Y-%m-%d"), "note": "渋滞なしの目安",
            "ids": ids, "minutes": minutes, "km": km}


def normals():
    lats = ",".join(str(h["lat"]) for h in HUBS)
    lngs = ",".join(str(h["lng"]) for h in HUBS)
    acc = {h["id"]: {} for h in HUBS}
    years = range(2016, 2026)
    for y in years:
        url = ("https://archive-api.open-meteo.com/v1/archive?"
               f"latitude={lats}&longitude={lngs}&start_date={y}-11-14&end_date={y}-11-24"
               "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Asia%2FTokyo")
        res = get_json(url)
        if isinstance(res, dict):
            res = [res]
        for h, r in zip(HUBS, res):
            dd = r["daily"]
            for i, t in enumerate(dd["time"]):
                md = t[5:]
                a = acc[h["id"]].setdefault(md, {"tmax": [], "tmin": [], "pr": []})
                if dd["temperature_2m_max"][i] is not None:
                    a["tmax"].append(dd["temperature_2m_max"][i])
                    a["tmin"].append(dd["temperature_2m_min"][i])
                    a["pr"].append(dd["precipitation_sum"][i] or 0)
        time.sleep(1)
    out = {}
    for hid, days in acc.items():
        out[hid] = {}
        for md, a in sorted(days.items()):
            n = len(a["tmax"]) or 1
            out[hid][md] = {
                "tmax": round(sum(a["tmax"]) / n, 1),
                "tmin": round(sum(a["tmin"]) / n, 1),
                "rain_pct": round(100 * sum(1 for p in a["pr"] if p >= 1) / n),
            }
    return {"source": "Open-Meteo Historical Weather API", "years": f"{years.start}-{years.stop - 1}",
            "note": "rain_pct = 日降水量1mm以上だった年の割合", "hubs": out}


def main():
    spots = json.loads((DATA / "spots.json").read_text(encoding="utf-8"))
    spots = prepare_spots(spots)
    (DATA / "spots.json").write_text(
        "[\n" + ",\n".join("  " + json.dumps(s, ensure_ascii=False) for s in spots) + "\n]\n",
        encoding="utf-8")
    (DATA / "hubs.json").write_text(json.dumps(HUBS, ensure_ascii=False, indent=1), encoding="utf-8")
    (DATA / "transit.json").write_text(json.dumps({
        "note": "代表的な所要時間の目安（乗換待ちを含まない）。本数・最新ダイヤは乗換案内で要確認",
        "source": "docs/02_kyushu_research.md 3章＋手入力", "edges": TRANSIT},
        ensure_ascii=False, indent=1), encoding="utf-8")
    print("spots/hubs/transit OK")

    points = [{"id": h["id"], "lat": h["lat"], "lng": h["lng"]} for h in HUBS] + \
             [{"id": s["id"], "lat": s["lat"], "lng": s["lng"]} for s in spots]
    cm = car_matrix(points)
    (DATA / "car_matrix.json").write_text(json.dumps(cm, ensure_ascii=False, separators=(",", ":")),
                                          encoding="utf-8")
    print("car_matrix OK", len(cm["ids"]))
    time.sleep(1)
    (DATA / "normals.json").write_text(json.dumps(normals(), ensure_ascii=False, indent=1),
                                       encoding="utf-8")
    print("normals OK")


if __name__ == "__main__":
    main()

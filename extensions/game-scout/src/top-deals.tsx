import { useEffect, useState } from "react";
import {
  List,
  ActionPanel,
  Action,
  Icon,
  Color,
  Cache,
  getPreferenceValues,
} from "@raycast/api";

interface Preferences {
  minDiscount?: string;
  maxPrice?: string;
}

const STORES: { [key: string]: { name: string; color: Color } } = {
  "1": { name: "Steam", color: Color.Blue },
  "2": { name: "GamersGate", color: Color.SecondaryText },
  "3": { name: "Green Man Gaming", color: Color.Green },
  "4": { name: "Amazon", color: Color.Orange },
  "5": { name: "GameStop", color: Color.Red },
  "6": { name: "Direct2Drive", color: Color.SecondaryText },
  "7": { name: "GOG", color: Color.Purple },
  "8": { name: "Origin", color: Color.Orange },
  "9": { name: "Get Games", color: Color.SecondaryText },
  "10": { name: "ShinyLoot", color: Color.SecondaryText },
  "11": { name: "Humble Store", color: Color.Red },
  "12": { name: "Desura", color: Color.SecondaryText },
  "13": { name: "Uplay", color: Color.Blue },
  "14": { name: "IndieGameStand", color: Color.SecondaryText },
  "15": { name: "Fanatical", color: Color.Orange },
  "16": { name: "Gamesrocket", color: Color.SecondaryText },
  "17": { name: "Games Republic", color: Color.SecondaryText },
  "18": { name: "SilaGames", color: Color.SecondaryText },
  "19": { name: "Playfield", color: Color.SecondaryText },
  "20": { name: "ImperialGames", color: Color.SecondaryText },
  "21": { name: "WinGameStore", color: Color.SecondaryText },
  "22": { name: "FunStockDigital", color: Color.SecondaryText },
  "23": { name: "GameBillet", color: Color.SecondaryText },
  "24": { name: "Voidu", color: Color.Orange },
  "25": { name: "Epic Games Store", color: Color.PrimaryText },
  "26": { name: "Razer Game Store", color: Color.Green },
  "27": { name: "Gamesplanet", color: Color.SecondaryText },
  "28": { name: "Gamesload", color: Color.SecondaryText },
  "29": { name: "2Game", color: Color.SecondaryText },
  "30": { name: "IndieGala", color: Color.Red },
  "31": { name: "Blizzard Shop", color: Color.Blue },
  "32": { name: "AllYouPlay", color: Color.SecondaryText },
  "33": { name: "DLgamer", color: Color.SecondaryText },
  "34": { name: "Noctre", color: Color.SecondaryText },
  "35": { name: "DreamGame", color: Color.SecondaryText },
};

interface Deal {
  title: string;
  metacriticLink: string;
  dealID: string;
  storeID: string;
  salePrice: string;
  normalPrice: string;
  savings: string;
  dealRating: string;
  thumb: string;
  steamRatingPercent: string;
}

const cache = new Cache();
const CACHE_KEY = "cheapshark_top_deals";
const CACHE_TTL = 6 * 60 * 60 * 1000;

export default function Command() {
  const preferences = getPreferenceValues<Preferences>();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reviewFilter, setReviewFilter] = useState<string>("all");

  const fetchDeals = async () => {
    setIsLoading(true);

    const cachedData = cache.get(CACHE_KEY);
    if (cachedData) {
      const { timestamp, data } = JSON.parse(cachedData);
      if (Date.now() - timestamp < CACHE_TTL) {
        setDeals(data);
        setIsLoading(false);
        return;
      }
    }

    try {
      const upperLimit = maxPrice === 999 ? 999 : maxPrice;
      const response = await fetch(
        `https://www.cheapshark.com/api/1.0/deals?upperPrice=${upperLimit}&pageSize=60&onSale=1`,
      );
      const data = (await response.json()) as Deal[];

      data.sort((a, b) => {
        const rA = parseFloat(a.dealRating);
        const rB = parseFloat(b.dealRating);
        if (rB !== rA) return rB - rA;

        const sA = parseFloat(a.savings);
        const sB = parseFloat(b.savings);
        if (sB !== sA) return sB - sA;

        const nA = parseFloat(a.normalPrice);
        const nB = parseFloat(b.normalPrice);
        if (nB !== nA) return nB - nA;

        const nameA = STORES[a.storeID]?.name || "Z";
        const nameB = STORES[b.storeID]?.name || "Z";
        return nameA.localeCompare(nameB);
      });

      setDeals(data);
      cache.set(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data }));
    } catch (error) {
      console.error(error);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchDeals();
  }, []);

  const minDiscount = parseInt(preferences.minDiscount || "0");
  const maxPrice = parseFloat(preferences.maxPrice || "999");

  const filteredDeals = deals.filter((deal) => {
    const savings = parseFloat(deal.savings);
    const price = parseFloat(deal.salePrice);
    const steamRating = parseInt(deal.steamRatingPercent || "0");

    if (savings < minDiscount) return false;
    if (price > maxPrice) return false;
    if (reviewFilter === "positive" && steamRating < 70) return false;

    return true;
  });

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Filter deals..."
      searchBarAccessory={
        <List.Dropdown
          tooltip="Review Filter"
          value={reviewFilter}
          onChange={setReviewFilter}
        >
          <List.Dropdown.Item title="All Deals" value="all" icon={Icon.List} />
          <List.Dropdown.Item
            title="Positive Reviews (Steam Only)"
            value="positive"
            icon={Icon.Trophy}
          />
        </List.Dropdown>
      }
    >
      {filteredDeals.map((deal) => {
        const store = STORES[deal.storeID] || {
          name: "Unknown",
          color: Color.SecondaryText,
        };
        const discount = Math.round(parseFloat(deal.savings));

        return (
          <List.Item
            key={deal.dealID}
            title={deal.title}
            subtitle={store.name}
            icon={{ source: deal.thumb, fallback: Icon.GameController }}
            accessories={[
              { text: `$${deal.normalPrice} → $${deal.salePrice}` },
              { tag: { value: `-${discount}%`, color: Color.Green } },
              {
                icon: { source: Icon.Star, tintColor: Color.Yellow },
                text: deal.dealRating,
              },
            ]}
            actions={
              <ActionPanel>
                <Action.OpenInBrowser
                  title="View Deal"
                  url={`https://www.cheapshark.com/redirect?dealID=${deal.dealID}`}
                />
                {deal.metacriticLink && (
                  <Action.OpenInBrowser
                    title="View Metacritic"
                    url={`https://www.metacritic.com${deal.metacriticLink}`}
                    shortcut={{
                      Windows: { modifiers: ["ctrl"], key: "m" },
                      macOS: { modifiers: ["cmd"], key: "m" },
                    }}
                    icon={Icon.BarChart}
                  />
                )}
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}

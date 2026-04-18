import { useEffect, useState } from "react";
import {
  List,
  ActionPanel,
  Action,
  Icon,
  Color,
  Detail,
  LocalStorage,
  getPreferenceValues,
  Cache,
  openExtensionPreferences,
} from "@raycast/api";

interface Preferences {
  itadApiKey: string;
  country: string;
}

const preferences = getPreferenceValues<Preferences>();
const API_KEY = (preferences.itadApiKey || "").trim();
const COUNTRY = preferences.country;

const cache = new Cache();
const CACHE_KEY = `itad_saved_prices_${COUNTRY}`;
const CACHE_TTL = 12 * 60 * 60 * 1000;

export default function SavedGames() {
  const isApiKeyValid = API_KEY.length > 0;
  const isCountryValid = COUNTRY.length === 2;

  if (!isApiKeyValid || !isCountryValid) {
    return (
      <List>
        <List.EmptyView
          icon={!isApiKeyValid ? Icon.Key : Icon.Globe}
          title={!isApiKeyValid ? "API Key Required" : "Region Setup Required"}
          description={
            !isApiKeyValid
              ? "Please enter your IsThereAnyDeal API Key in preferences, then reopen the extension."
              : "Please select a valid store region in preferences, then reopen the extension."
          }
          actions={
            <ActionPanel>
              <Action
                title="Open Preferences"
                icon={Icon.Gear}
                onAction={openExtensionPreferences}
                shortcut={{
                  Windows: { modifiers: ["ctrl"], key: "p" },
                  macOS: { modifiers: ["cmd"], key: "p" },
                }}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  const [savedGames, setSavedGames] = useState<
    { id: string; title: string; slug: string; type?: string }[]
  >([]);
  const [prices, setPrices] = useState<any>({});
  const [bundleCounts, setBundleCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    LocalStorage.getItem<string>("saved_itad_games").then((stored) => {
      if (stored) setSavedGames(JSON.parse(stored));
      else setIsLoading(false);
    });
  }, []);

  const fetchPrices = async (forceRefresh = false) => {
    if (savedGames.length === 0) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const gameIds = savedGames.map((g) => g.id);
    const cachedString = cache.get(CACHE_KEY);

    if (cachedString && !forceRefresh) {
      const parsed = JSON.parse(cachedString);
      const cacheAge = Date.now() - parsed.timestamp;
      const hasAllIds = gameIds.every((id) => parsed.data[id] !== undefined);

      if (cacheAge < CACHE_TTL && hasAllIds) {
        setPrices(parsed.data);
        setBundleCounts(parsed.bundles || {});
        setIsLoading(false);
        return;
      }
    }

    try {
      const [priceRes, overviewRes] = await Promise.all([
        fetch(
          `https://api.isthereanydeal.com/games/prices/v2?key=${API_KEY}&country=${COUNTRY}&nondeals=true`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(gameIds),
          },
        ),
        fetch(
          `https://api.isthereanydeal.com/games/overview/v2?key=${API_KEY}&country=${COUNTRY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(gameIds),
          },
        ),
      ]);

      const [priceJson, overviewJson] = await Promise.all([
        priceRes.json(),
        overviewRes.json(),
      ]);

      const priceMap: any = {};
      (Array.isArray(priceJson) ? priceJson : Object.values(priceJson)).forEach(
        (item: any) => {
          priceMap[item.id] = item.deals?.[0] || null;
        },
      );

      const bundleMap: Record<string, number> = {};
      gameIds.forEach((id) => {
        bundleMap[id] = 0;
      });

      const now = new Date();
      const activeBundles = (overviewJson.bundles || []).filter((b: any) =>
        b.expiry ? new Date(b.expiry) > now : true,
      );

      activeBundles.forEach((bundle: any) => {
        bundle.tiers?.forEach((tier: any) => {
          tier.games?.forEach((game: any) => {
            if (game.id in bundleMap) {
              bundleMap[game.id]++;
            }
          });
        });
      });

      cache.set(
        CACHE_KEY,
        JSON.stringify({
          timestamp: Date.now(),
          data: priceMap,
          bundles: bundleMap,
        }),
      );
      setPrices(priceMap);
      setBundleCounts(bundleMap);
    } catch (error) {
      console.error("Failed to fetch saved prices", error);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchPrices();
  }, [savedGames]);

  const removeGame = async (id: string) => {
    const newList = savedGames.filter((g) => g.id !== id);
    setSavedGames(newList);
    await LocalStorage.setItem("saved_itad_games", JSON.stringify(newList));
  };

  const clearAll = async () => {
    setSavedGames([]);
    await LocalStorage.removeItem("saved_itad_games");
    cache.remove(CACHE_KEY);
  };

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search in your saved games..."
    >
      {savedGames.length === 0 && !isLoading && (
        <List.EmptyView
          title="No Saved Games"
          description="Use the 'Search Games' command to find and save games here."
          icon={Icon.Star}
        />
      )}

      {savedGames.map((game) => {
        const deal = prices[game.id];

        const currentAmount = deal?.price?.amount;
        const regularAmount = deal?.regular?.amount;
        const currency = deal?.price?.currency || "USD";
        const cutPercent = deal?.cut || 0;

        let priceDisplay = "No Deal";
        if (currentAmount !== undefined) {
          if (cutPercent > 0 && regularAmount !== undefined) {
            priceDisplay = `${regularAmount} → ${currentAmount} ${currency}`;
          } else {
            priceDisplay = `${currentAmount} ${currency}`;
          }
        }

        const itemAccessories = [];
        if (cutPercent > 0) {
          itemAccessories.push({
            tag: { value: `-${cutPercent}%`, color: Color.Green },
          });
        }
        if ((bundleCounts[game.id] ?? 0) > 0) {
          itemAccessories.push({
            tag: { value: "IN BUNDLE", color: Color.Purple },
          });
        }

        return (
          <List.Item
            key={game.id}
            title={game.title}
            icon={Icon.StarCircle}
            subtitle=""
            accessories={[{ text: priceDisplay }, ...itemAccessories]}
            actions={
              <ActionPanel>
                <ActionPanel.Section>
                  <Action.Push
                    title="View Game Details"
                    target={
                      <GameDetail
                        gameId={game.id}
                        gameTitle={game.title}
                        gameSlug={game.slug}
                        gameType={game.type || "OTHER"}
                        removeGame={() => removeGame(game.id)}
                      />
                    }
                    icon={Icon.Sidebar}
                  />
                  {deal?.url && (
                    <Action.OpenInBrowser
                      title="Open Best Deal"
                      url={deal.url}
                      icon={Icon.Cart}
                    />
                  )}
                </ActionPanel.Section>
                <ActionPanel.Section>
                  <Action
                    title="Remove from Saved"
                    onAction={() => removeGame(game.id)}
                    icon={Icon.Trash}
                    shortcut={{
                      Windows: { modifiers: ["ctrl"], key: "backspace" },
                      macOS: { modifiers: ["cmd"], key: "backspace" },
                    }}
                    style={Action.Style.Destructive}
                  />
                  <Action
                    title="Clear All Saved Games"
                    onAction={clearAll}
                    icon={Icon.DeleteDocument}
                    shortcut={{
                      Windows: {
                        modifiers: ["ctrl", "shift"],
                        key: "backspace",
                      },
                      macOS: { modifiers: ["cmd", "shift"], key: "backspace" },
                    }}
                    style={Action.Style.Destructive}
                  />
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}

function GameDetail({
  gameId,
  gameTitle,
  gameSlug,
  gameType,
  removeGame,
}: {
  gameId: string;
  gameTitle: string;
  gameSlug: string;
  gameType: string;
  removeGame: () => void;
}) {
  const [data, setData] = useState<{
    steamData: any;
    realBundles: any[];
    deals: any[];
    historyLow: any;
    overview: any;
  }>({
    steamData: null,
    realBundles: [],
    deals: [],
    historyLow: null,
    overview: null,
  });

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const abortController = new AbortController();
    const detailCacheKey = `itad_detail_${gameId}`;

    const fetchDetailData = async () => {
      setIsLoading(true);

      // Cache Kontrolü
      const cachedString = cache.get(detailCacheKey);
      if (cachedString) {
        const parsed = JSON.parse(cachedString);
        if (Date.now() - parsed.timestamp < CACHE_TTL) {
          if (isMounted) {
            setData(parsed.data);
            setIsLoading(false);
          }
          return;
        }
      }

      try {
        // 1. Steam Verisini Çek
        let steamData = null;
        const searchRes = await fetch(
          `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(gameTitle)}&l=english&cc=US`,
          { signal: abortController.signal },
        );
        const searchJson = await searchRes.json();

        let targetItem = searchJson?.items?.find(
          (item: any) => item.name.toLowerCase() === gameTitle.toLowerCase(),
        );
        if (!targetItem) {
          targetItem = searchJson?.items?.find((item: any) => {
            const sName = item.name.toLowerCase();
            const iName = gameTitle.toLowerCase();
            if (sName.includes(iName) || iName.includes(sName)) {
              const sNums = sName.match(/\b\d+\b/g) || [];
              const iNums: string[] = iName.match(/\b\d+\b/g) || [];
              return sNums.every((n: string) => iNums.includes(n));
            }
            return false;
          });
        }
        if (!targetItem) targetItem = searchJson?.items?.[0];

        if (targetItem?.id) {
          const detailRes = await fetch(
            `https://store.steampowered.com/api/appdetails?appids=${targetItem.id}`,
            { signal: abortController.signal },
          );
          const detailJson = await detailRes.json();
          steamData = detailJson?.[targetItem.id]?.data || null;
        }

        // 2. ITAD Verilerini Tek Seferde Çek
        const [bundlesRes, pricesRes, historyRes, overviewRes] =
          await Promise.all([
            fetch(
              `https://api.isthereanydeal.com/games/bundles/v2?key=${API_KEY}&id=${gameId}`,
              { signal: abortController.signal },
            ),
            fetch(
              `https://api.isthereanydeal.com/games/prices/v2?key=${API_KEY}&country=${COUNTRY}&nondeals=true`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify([gameId]),
                signal: abortController.signal,
              },
            ),
            fetch(
              `https://api.isthereanydeal.com/games/historylow/v1?key=${API_KEY}&country=${COUNTRY}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify([gameId]),
                signal: abortController.signal,
              },
            ),
            fetch(
              `https://api.isthereanydeal.com/games/overview/v2?key=${API_KEY}&country=${COUNTRY}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify([gameId]),
                signal: abortController.signal,
              },
            ),
          ]);

        const [bundlesJson, pricesJson, historyJson, overviewJson] =
          await Promise.all([
            bundlesRes.json(),
            pricesRes.json(),
            historyRes.json(),
            overviewRes.json(),
          ]);

        // Verileri Formatla
        const realBundles = Array.isArray(bundlesJson)
          ? bundlesJson[0]?.bundles || bundlesJson
          : bundlesJson[gameId]?.bundles || [];
        const deals = Array.isArray(pricesJson)
          ? pricesJson[0]?.deals
          : pricesJson?.[gameId]?.deals || pricesJson?.deals || [];
        const historyLow = Array.isArray(historyJson)
          ? historyJson[0]?.low
          : historyJson?.[gameId]?.low || historyJson?.low || null;
        const overview = Array.isArray(overviewJson)
          ? overviewJson[0]
          : overviewJson?.[gameId] || overviewJson;

        const combinedData = {
          steamData,
          realBundles,
          deals,
          historyLow,
          overview,
        };

        // Cache'e Kaydet ve State'i Güncelle
        if (isMounted) {
          cache.set(
            detailCacheKey,
            JSON.stringify({ timestamp: Date.now(), data: combinedData }),
          );
          setData(combinedData);
        }
      } catch (error: any) {
        if (error.name !== "AbortError")
          console.error("Failed to fetch game details", error);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchDetailData();
    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [gameId, gameTitle]);

  const { steamData, realBundles, deals, historyLow, overview } = data;

  const hAmount = historyLow?.price?.amount ?? historyLow?.amount;
  const hCurrency = historyLow?.price?.currency ?? historyLow?.currency ?? "";
  const hDate = historyLow?.timestamp
    ? new Date(historyLow.timestamp).toLocaleDateString("en-GB")
    : "N/A";

  let totalBundles = 0;
  let activeBundlesCount = 0;
  let bundleSiteNames = "";

  if (overview?.bundles && Array.isArray(overview.bundles)) {
    totalBundles = overview.bundles.length;
  }

  if (realBundles && realBundles.length > 0) {
    const now = new Date();
    const activeList = realBundles.filter((b: any) =>
      b.expiry ? new Date(b.expiry) > now : true,
    );
    activeBundlesCount = activeList.length;
    if (activeBundlesCount > 0) {
      const uniqueShops = Array.from(
        new Set(activeList.map((b: any) => b.page?.name).filter(Boolean)),
      );
      bundleSiteNames =
        uniqueShops.length > 1
          ? "Multiple"
          : (uniqueShops[0] as string) || "Unknown";
    }
  }

  const isExactSteamMatch =
    steamData &&
    (steamData.name?.toLowerCase() === gameTitle.toLowerCase() ||
      steamData.name?.toLowerCase().replace(/[^a-z0-9]/g, "") ===
        gameTitle.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const cleanDescription = isExactSteamMatch
    ? steamData?.short_description?.replace(/<[^>]*>?/gm, "")
    : "";
  const coverImage = isExactSteamMatch ? steamData?.header_image : "";
  const metacriticScore = isExactSteamMatch
    ? steamData?.metacritic?.score
    : null;

  const markdown = `
${coverImage ? `![](${coverImage})\n` : ""}
# ${gameTitle}

${cleanDescription ? `*${cleanDescription}*\n` : ""}

Current prices in **${COUNTRY}**:

| Shop | Current | Regular | Cut |
| :--- | :--- | :--- | :--- |
${
  deals?.length
    ? deals
        .map(
          (p: any) =>
            `| ${p.url ? `[${p.shop?.name || "-"}](${p.url})` : p.shop?.name || "-"} | **${p.price?.amount || "-"} ${p.price?.currency || ""}** | ${p.regular?.amount || "-"} | -${p.cut || 0}% |`,
        )
        .join("\n")
    : "| No active store data | - | - | - |"
}
`;

  return (
    <Detail
      isLoading={isLoading}
      markdown={markdown}
      navigationTitle={gameTitle}
      metadata={
        <Detail.Metadata>
          {(deals?.[0]?.cut > 0 || activeBundlesCount > 0) && (
            <Detail.Metadata.TagList title="">
              {deals?.[0]?.cut > 0 && (
                <Detail.Metadata.TagList.Item
                  text="ON SALE"
                  color={Color.Green}
                />
              )}
              {activeBundlesCount > 0 && (
                <Detail.Metadata.TagList.Item
                  text="IN BUNDLE"
                  color={Color.Purple}
                />
              )}
            </Detail.Metadata.TagList>
          )}
          <Detail.Metadata.Label title="Type" text={gameType.toUpperCase()} />
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label title="Region" text={COUNTRY} />
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label
            title="All-Time Low"
            text={hAmount ? `${hAmount} ${hCurrency}` : "No History"}
            icon={
              hAmount
                ? { source: Icon.Checkmark, tintColor: Color.Green }
                : Icon.XMarkCircle
            }
          />
          <Detail.Metadata.Label
            title="Shop"
            text={historyLow?.shop?.name || "Unknown"}
          />
          <Detail.Metadata.Label title="Recorded Date" text={hDate} />
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label
            title="Bundles"
            text={`${activeBundlesCount} live of ${totalBundles} total`}
          />
          {activeBundlesCount > 0 && bundleSiteNames && (
            <Detail.Metadata.Label
              title="Active Bundle Site"
              text={bundleSiteNames}
            />
          )}
          {metacriticScore && (
            <>
              <Detail.Metadata.Separator />
              <Detail.Metadata.Label
                title="Metacritic"
                text={String(metacriticScore)}
              />
            </>
          )}
          {gameSlug && (
            <>
              <Detail.Metadata.Separator />
              <Detail.Metadata.Link
                title=""
                target={`https://isthereanydeal.com/game/${gameSlug}/info/`}
                text="View on IsThereAnyDeal"
              />
            </>
          )}
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            {deals?.[0]?.url && (
              <Action.OpenInBrowser
                url={deals[0].url}
                title={`Open Best Deal (${deals[0].shop?.name})`}
                icon={Icon.Cart}
              />
            )}
            <Action
              title="Remove from Saved"
              onAction={removeGame}
              icon={Icon.Trash}
              shortcut={{
                Windows: { modifiers: ["ctrl"], key: "s" },
                macOS: { modifiers: ["cmd"], key: "s" },
              }}
              style={Action.Style.Destructive}
            />
            {gameSlug && (
              <Action.OpenInBrowser
                url={`https://isthereanydeal.com/game/${gameSlug}/info/`}
                title="View on Isthereanydeal"
                icon={Icon.Globe}
                shortcut={{
                  Windows: { modifiers: ["ctrl"], key: "o" },
                  macOS: { modifiers: ["cmd"], key: "o" },
                }}
              />
            )}
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

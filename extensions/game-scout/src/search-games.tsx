import { useEffect, useState } from "react";
import {
  List,
  ActionPanel,
  Action,
  Icon,
  Color,
  Detail,
  LocalStorage,
  Cache,
  getPreferenceValues,
  openExtensionPreferences,
} from "@raycast/api";

interface Preferences {
  itadApiKey: string;
  country: string;
  maxResults: string;
  showMature: boolean;
  showDLCGameSearch: boolean;
}

const preferences = getPreferenceValues<Preferences>();
const API_KEY = (preferences.itadApiKey || "").trim();
const COUNTRY = preferences.country;
const MAX_RESULTS = parseInt(preferences.maxResults) || 25;

const detailCache = new Cache({ namespace: "search_detail" });
const DETAIL_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 Saat

export default function Command() {
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

  const [searchText, setSearchText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchData, setSearchData] = useState<any[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);

  const [savedGames, setSavedGames] = useState<
    { id: string; title: string; slug: string; type?: string }[]
  >([]);

  useEffect(() => {
    LocalStorage.getItem<string>("saved_itad_games").then((stored) => {
      if (stored) setSavedGames(JSON.parse(stored));
    });
  }, []);

  const toggleSave = async (game: any) => {
    let newList;
    if (savedGames.some((g) => g.id === game.id)) {
      newList = savedGames.filter((g) => g.id !== game.id);
    } else {
      newList = [
        ...savedGames,
        {
          id: game.id,
          title: game.title,
          slug: game.slug,
          type: game.type || "OTHER",
        },
      ];
      const cache = new Cache();
      cache.remove(`itad_saved_prices_${COUNTRY}`);
    }
    setSavedGames(newList);
    await LocalStorage.setItem("saved_itad_games", JSON.stringify(newList));
  };

  useEffect(() => {
    if (!searchQuery) {
      setSearchData([]);
      return;
    }

    const fetchData = async () => {
      setLoadingSearch(true);
      try {
        const res = await fetch(
          `https://api.isthereanydeal.com/games/search/v1?key=${API_KEY}&title=${encodeURIComponent(searchQuery)}`,
        );
        const json = await res.json();

        let results = [];
        if (Array.isArray(json)) results = json;
        else if (Array.isArray(json.data)) results = json.data;
        else if (Array.isArray(json.results)) results = json.results;

        const query = searchQuery.toLowerCase();
        results.sort((a: any, b: any) => {
          const aTitle = a.title.toLowerCase();
          const bTitle = b.title.toLowerCase();

          if (aTitle === query && bTitle !== query) return -1;
          if (bTitle === query && aTitle !== query) return 1;
          if (aTitle.startsWith(query) && !bTitle.startsWith(query)) return -1;
          if (bTitle.startsWith(query) && !aTitle.startsWith(query)) return 1;
          return 0;
        });

        setSearchData(results);
      } catch {
        setSearchData([]);
      }
      setLoadingSearch(false);
    };

    fetchData();
  }, [searchQuery]);

  const SHOW_MATURE = preferences.showMature;
  const SHOW_DLC = preferences.showDLCGameSearch;

  const filteredData = searchData.filter((game: any) => {
    if (!SHOW_MATURE && game.mature) return false;
    if (!SHOW_DLC && game.type === "dlc") return false;
    return true;
  });

  const isTyping =
    searchText.trim() !== searchQuery && searchText.trim().length > 0;

  return (
    <List
      isLoading={loadingSearch}
      onSearchTextChange={(text) => {
        setSearchText(text);
        if (text.trim() === "") setSearchQuery("");
      }}
      searchBarPlaceholder="Search games (e.g. No Man's Sky)..."
      // "throttle" ve global "actions" buradan tamamen kaldırıldı
    >
      {searchQuery.length === 0 ? (
        <List.EmptyView
          title="Waiting for Input"
          description="Type a game name and press Enter to search."
          icon={Icon.MagnifyingGlass}
          actions={
            <ActionPanel>
              <Action
                title="Search"
                onAction={() => setSearchQuery(searchText.trim())}
                icon={Icon.MagnifyingGlass}
              />
            </ActionPanel>
          }
        />
      ) : filteredData.length === 0 && !loadingSearch ? (
        <List.EmptyView
          title="No Results Found"
          description="Try a different search term and press Enter."
          icon={Icon.MagnifyingGlass}
          actions={
            <ActionPanel>
              <Action
                title="Search"
                onAction={() => setSearchQuery(searchText.trim())}
                icon={Icon.MagnifyingGlass}
              />
            </ActionPanel>
          }
        />
      ) : (
        filteredData.slice(0, MAX_RESULTS).map((game: any) => {
          const accessories = [];
          if (game.mature)
            accessories.push({
              text: "18+",
              color: Color.Red,
              tooltip: "Mature Content",
            });

          const typeLabel = game.type ? game.type.toUpperCase() : "OTHER";
          accessories.push({ text: typeLabel, color: Color.SecondaryText });

          const isSaved = savedGames.some((g) => g.id === game.id);

          return (
            <List.Item
              key={game.id}
              title={game.title}
              icon={isSaved ? Icon.Star : Icon.GameController}
              accessories={accessories}
              actions={
                <ActionPanel>
                  <ActionPanel.Section>
                    {/* Senin Mükemmel UX Mantığın (Şimdi Gecikmesiz Çalışacak) */}
                    {isTyping && (
                      <Action
                        title="Search"
                        onAction={() => setSearchQuery(searchText.trim())}
                        icon={Icon.MagnifyingGlass}
                      />
                    )}

                    {!isTyping && (
                      <Action.Push
                        title="View Game Details"
                        target={
                          <GameDetail
                            gameId={game.id}
                            gameTitle={game.title}
                            gameSlug={game.slug}
                            gameType={game.type || "OTHER"}
                            isSaved={isSaved}
                            toggleSave={() => toggleSave(game)}
                          />
                        }
                        icon={Icon.Sidebar}
                      />
                    )}

                    <Action
                      title={isSaved ? "Remove from Saved" : "Save Game"}
                      onAction={() => toggleSave(game)}
                      icon={isSaved ? Icon.Trash : Icon.Star}
                      shortcut={{
                        Windows: { modifiers: ["ctrl"], key: "s" },
                        macOS: { modifiers: ["cmd"], key: "s" },
                      }}
                      style={
                        isSaved
                          ? Action.Style.Destructive
                          : Action.Style.Regular
                      }
                    />
                    <Action.OpenInBrowser
                      title="Open on Isthereanydeal"
                      url={`https://isthereanydeal.com/game/${game.slug}/info/`}
                      shortcut={{
                        Windows: { modifiers: ["ctrl"], key: "o" },
                        macOS: { modifiers: ["cmd"], key: "o" },
                      }}
                      icon={Icon.Globe}
                    />
                  </ActionPanel.Section>
                </ActionPanel>
              }
            />
          );
        })
      )}
    </List>
  );
}

function GameDetail({
  gameId,
  gameTitle,
  gameSlug,
  gameType,
  isSaved,
  toggleSave,
}: {
  gameId: string;
  gameTitle: string;
  gameSlug: string;
  gameType: string;
  isSaved: boolean;
  toggleSave: () => void;
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
    const cacheKey = `search_detail_${gameId}_${COUNTRY}`;

    const fetchDetailData = async () => {
      setIsLoading(true);

      // Cache Kontrolü (6 Saat)
      const cachedString = detailCache.get(cacheKey);
      if (cachedString) {
        const parsed = JSON.parse(cachedString);
        if (Date.now() - parsed.timestamp < DETAIL_CACHE_TTL) {
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
          detailCache.set(
            cacheKey,
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
    const activeList = realBundles.filter((b: any) => {
      if (b.expiry) return new Date(b.expiry) > now;
      return true;
    });
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

  let isExactSteamMatch = false;
  if (steamData) {
    const steamName = steamData.name?.toLowerCase() || "";
    const searchName = gameTitle.toLowerCase();
    const cleanSteamName = steamName.replace(/[^a-z0-9]/g, "");
    const cleanSearchName = searchName.replace(/[^a-z0-9]/g, "");
    isExactSteamMatch =
      steamName === searchName || cleanSteamName === cleanSearchName;
  }

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
              title={isSaved ? "Remove from Saved" : "Save Game"}
              onAction={toggleSave}
              icon={isSaved ? Icon.Trash : Icon.Star}
              shortcut={{
                Windows: { modifiers: ["ctrl"], key: "s" },
                macOS: { modifiers: ["cmd"], key: "s" },
              }}
              style={isSaved ? Action.Style.Destructive : Action.Style.Regular}
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

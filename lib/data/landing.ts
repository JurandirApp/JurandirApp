/** Static, non-translatable landing data (images, icons). Text lives in messages/. */

// Category image ids (Unsplash). Labels are translated via `categories.items.<key>`.
export const categories = [
  { key: "beers", id: "photo-1608270586620-248524c67de9" },
  { key: "caipirinhas", id: "photo-1551538827-9c037cb4f32a" },
  { key: "coconut", id: "photo-1520950237264-3e10a6d27dd5" },
  { key: "snacks", id: "photo-1625938145312-c971e35e51f3" },
  { key: "portions", id: "photo-1573080496219-bb080dd4f877" },
  { key: "skewers", id: "photo-1555939594-58d7cb561ad1" },
  { key: "drinks", id: "photo-1560512823-829485b8bf24" },
  { key: "desserts", id: "photo-1576506295286-5cda18df43e7" },
  { key: "combos", id: "photo-1414235077428-338989a2e8c0" },
].map((c) => ({
  ...c,
  img: `https://images.unsplash.com/${c.id}?auto=format&fit=crop&w=300&q=70`,
}));

// Icons for the "how it works" steps (text is translated).
export const stepIcons = ["qr_code_2", "restaurant", "smartphone"] as const;

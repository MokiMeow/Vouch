// Arrays keep their order. Object keys use JavaScript's deterministic UTF-16
// ordering, at every depth. JSONB key ordering cannot change the digest.
export function canonicalJson(value: unknown): string {
  const json = JSON.stringify(value, (_key, item: unknown) => {
    if (item && typeof item === "object" && !Array.isArray(item))
      return Object.fromEntries(
        Object.keys(item)
          .sort()
          .map((key) => [key, Reflect.get(item, key)]),
      );
    return item;
  });
  if (json === undefined) throw new Error("A JSON configuration is required");
  return json;
}

const normalizeRootDomain = (rootDomain) =>
  String(rootDomain || "")
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, "");

const getTenantSlugFromOrigin = (origin, rootDomain) => {
  const root = normalizeRootDomain(rootDomain);
  if (!origin || !root) return null;

  let hostname;
  try {
    const parsedOrigin = new URL(origin);
    if (
      !["http:", "https:"].includes(parsedOrigin.protocol) ||
      (process.env.NODE_ENV === "production" && parsedOrigin.protocol !== "https:")
    ) {
      return null;
    }
    hostname = parsedOrigin.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }

  const suffix = `.${root}`;
  if (!hostname.endsWith(suffix)) return null;

  const slug = hostname.slice(0, -suffix.length);
  if (!slug || slug.includes(".") || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return null;
  }

  return slug;
};

const isAllowedTenantOrigin = (origin, rootDomain) => {
  const root = normalizeRootDomain(rootDomain);
  if (!origin || !root) return false;

  try {
    const parsedOrigin = new URL(origin);
    const hostname = parsedOrigin.hostname.toLowerCase().replace(/\.$/, "");
    const prefix = hostname.endsWith(`.${root}`)
      ? hostname.slice(0, -(root.length + 1))
      : "";
    const isSingleTenantSubdomain = Boolean(
      prefix && !prefix.includes(".") && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(prefix),
    );
    const matchesDomain = hostname === root || isSingleTenantSubdomain;
    const secureOrigin = parsedOrigin.protocol === "https:";
    const localDevelopmentOrigin =
      process.env.NODE_ENV !== "production" && parsedOrigin.protocol === "http:";
    return matchesDomain && (secureOrigin || localDevelopmentOrigin);
  } catch {
    return false;
  }
};

module.exports = {
  getTenantSlugFromOrigin,
  isAllowedTenantOrigin,
  normalizeRootDomain,
};

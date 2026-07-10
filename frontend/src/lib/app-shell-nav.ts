export interface AppShellNavItem {
  label: string;
  to: string;
}

export function isRepositoryAreaPath(pathname: string) {
  return (
    pathname === "/repositories" ||
    pathname.startsWith("/repositories/") ||
    /^\/organizations\/[^/]+\/repositories(?:\/|$)/.test(pathname)
  );
}

export function getPrimaryNavActive(item: AppShellNavItem, pathname: string) {
  switch (item.label) {
    case "Dashboard":
      return pathname === "/";
    case "Organization":
      return (
        pathname === "/organizations" ||
        (pathname.startsWith("/organizations/") &&
          !isRepositoryAreaPath(pathname))
      );
    case "Repositories":
      return isRepositoryAreaPath(pathname);
    case "Reviews":
      return pathname === "/reviews" || pathname.startsWith("/reviews/");
    case "Activity":
      return (
        pathname === "/activity" ||
        /^\/organizations\/[^/]+\/activity(?:\/|$)/.test(pathname)
      );
    case "Settings":
      return pathname === "/settings" || pathname.startsWith("/settings/");
    default:
      return pathname === item.to || pathname.startsWith(`${item.to}/`);
  }
}

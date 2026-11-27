import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/** Locale-aware navigation helpers (auto-prefix `/en` e `/es`, keep `/` for pt). */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);

"use client";

import { getAuthToken, getUser } from "@/utils/api";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Role = "jobseeker" | "employer" | "admin";

type UseAuthGuardOptions = {
  requireAuth?: boolean;
  roles?: Role[];
  redirectTo?: string;
};

export function useAuthGuard({
  requireAuth = true,
  roles,
  redirectTo = "/login",
}: UseAuthGuardOptions) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const token = getAuthToken();
    const user = getUser();
    if (requireAuth && !token) {
      const current =
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : "";
      const suffix =
        current && current !== "/login"
          ? `?redirect=${encodeURIComponent(current)}`
          : "";
      router.replace(`${redirectTo}${suffix}`);
      return;
    }
    if (roles && roles.length > 0) {
      if (!user || !roles.includes(user.role)) {
        router.replace("/jobs");
        return;
      }
    }
    setChecked(true);
  }, [requireAuth, roles, redirectTo, router]);

  return useMemo(() => ({ ready: checked }), [checked]);
}

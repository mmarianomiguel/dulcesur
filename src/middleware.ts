import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const ADMIN_ROLES = ["admin", "vendedor", "cajero", "encargado"];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Block /login from public access — only authenticated admins or referer from /admin
  if (pathname === "/login") {
    if (user) {
      // Already logged in → go to admin
      const url = request.nextUrl.clone();
      url.pathname = "/admin";
      return NextResponse.redirect(url);
    }
    // Check if coming from admin (redirected because not authenticated)
    const referer = request.headers.get("referer") || "";
    const hasAdminCookie = request.cookies.get("admin_login_allowed");
    if (!referer.includes("/admin") && !hasAdminCookie) {
      // Random visitor or Google → redirect to client account page
      const url = request.nextUrl.clone();
      url.pathname = "/cuenta";
      return NextResponse.redirect(url);
    }
  }

  if (pathname.startsWith("/admin") && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Set a cookie so the login page knows it was redirected from admin
    const response = NextResponse.redirect(url);
    response.cookies.set("admin_login_allowed", "1", { maxAge: 300, path: "/" });
    return response;
  }

  // Role-based protection for /admin routes
  if (pathname.startsWith("/admin") && user) {
    // Check cookie cache to skip DB query for role verification (TTL: 5 min)
    const roleCache = request.cookies.get("admin_role_verified");
    if (roleCache) {
      return supabaseResponse;
    }

    const supabaseService = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        cookies: {
          getAll() { return []; },
          setAll() {},
        },
      }
    );
    const { data: usuario } = await supabaseService
      .from("usuarios")
      .select("rol, es_admin, activo")
      .eq("auth_id", user.id)
      .single();

    if (!usuario || !usuario.activo) {
      const url = request.nextUrl.clone();
      url.pathname = "/cuenta";
      return NextResponse.redirect(url);
    }

    const hasAdminAccess = usuario.es_admin === true || ADMIN_ROLES.includes(usuario.rol);
    if (!hasAdminAccess) {
      const url = request.nextUrl.clone();
      url.pathname = "/cuenta";
      return NextResponse.redirect(url);
    }

    // Cache the role verification result for 5 minutes
    supabaseResponse.cookies.set("admin_role_verified", "1", {
      maxAge: 300,
      path: "/admin",
      httpOnly: true,
    });
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/admin/:path*", "/login"],
};

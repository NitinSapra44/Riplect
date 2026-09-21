import type { Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.warn("Supabase credentials not configured. Authentication will not work.");
  console.warn("Missing:", !supabaseUrl ? "SUPABASE_URL" : "", !supabaseServiceRoleKey ? "SUPABASE_SERVICE_ROLE_KEY" : "");
}

export const supabase = supabaseUrl && supabaseServiceRoleKey 
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;

export function isSupabaseConfigured(): boolean {
  return supabase !== null;
}

export interface SupabaseUser {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
}

declare global {
  namespace Express {
    interface Request {
      supabaseUser?: SupabaseUser;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!isSupabaseConfigured() || !supabase) {
    return res.status(500).json({ message: "Authentication not configured" });
  }

  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.substring(7);

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    req.supabaseUser = {
      id: user.id,
      email: user.email || "",
      firstName: user.user_metadata?.first_name || null,
      lastName: user.user_metadata?.last_name || null,
      profileImageUrl: user.user_metadata?.avatar_url || null,
    };

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(401).json({ message: "Authentication failed" });
  }
}

export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ") || !isSupabaseConfigured() || !supabase) {
    return next();
  }

  const token = authHeader.substring(7);

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user) {
      req.supabaseUser = {
        id: user.id,
        email: user.email || "",
        firstName: user.user_metadata?.first_name || null,
        lastName: user.user_metadata?.last_name || null,
        profileImageUrl: user.user_metadata?.avatar_url || null,
      };
    }
  } catch (error) {
    // Ignore errors for optional auth
  }
  
  next();
}

export function getUserId(req: Request): string {
  if (!req.supabaseUser) {
    throw new Error("User not authenticated");
  }
  return req.supabaseUser.id;
}

export function getUserEmail(req: Request): string {
  if (!req.supabaseUser) {
    throw new Error("User not authenticated");
  }
  return req.supabaseUser.email;
}

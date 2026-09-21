import { waitForSupabase } from "@/lib/supabase";

export async function uploadQrImage(file: File): Promise<string> {
  const supabase = await waitForSupabase();
  let authHeaders: Record<string, string> = {};
  if (supabase) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      authHeaders = { Authorization: `Bearer ${session.access_token}` };
    }
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", "images");

  const res = await fetch("/api/upload/image", {
    method: "POST",
    headers: authHeaders,
    body: formData,
  });

  if (!res.ok) throw new Error("Upload failed");
  const { url } = await res.json();
  return url as string;
}

import { createClient } from "@/lib/supabase/client";

export async function uploadSpotPhoto(file: File) {
  const supabase = createClient();

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const filePath = `spots/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("spot-photos")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage.from("spot-photos").getPublicUrl(filePath);
  return data.publicUrl;
}
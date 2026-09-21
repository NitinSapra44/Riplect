import { supabase, isSupabaseConfigured } from "./supabaseAuth";
import { randomUUID } from "crypto";

const PUBLIC_BUCKET = "public_assets";
const PRIVATE_BUCKET = "secure_products";
const PAYMENT_PROOF_BUCKET = "Payment_Proof";

export class SupabaseStorageService {
  private getSupabase() {
    if (!isSupabaseConfigured() || !supabase) {
      throw new Error("Supabase not configured. Storage operations unavailable.");
    }
    return supabase;
  }

  async uploadPublicFile(
    file: Buffer,
    fileName: string,
    contentType: string,
    folder: string = "uploads"
  ): Promise<string> {
    const client = this.getSupabase();
    const fileId = randomUUID();
    const extension = fileName.split('.').pop() || '';
    const storagePath = `${folder}/${fileId}${extension ? '.' + extension : ''}`;

    const { data, error } = await client.storage
      .from(PUBLIC_BUCKET)
      .upload(storagePath, file, {
        contentType,
        upsert: false
      });

    if (error) {
      console.error("Supabase upload error:", error);
      throw new Error(`Failed to upload file: ${error.message}`);
    }

    const { data: publicUrlData } = client.storage
      .from(PUBLIC_BUCKET)
      .getPublicUrl(storagePath);

    return publicUrlData.publicUrl;
  }

  async uploadPrivateFile(
    file: Buffer,
    fileName: string,
    contentType: string,
    folder: string = "products",
    customFileName?: string
  ): Promise<string> {
    const client = this.getSupabase();
    const fileId = randomUUID().slice(0, 8); // Short unique ID
    const extension = fileName.split('.').pop() || '';
    
    // Use custom filename if provided, otherwise use original filename
    let baseName: string;
    if (customFileName) {
      // Sanitize the custom filename: remove special chars, replace spaces with underscores
      baseName = customFileName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
        .replace(/\s+/g, '_')          // Replace spaces with underscores
        .replace(/-+/g, '_')           // Replace hyphens with underscores
        .replace(/_+/g, '_')           // Replace multiple underscores with single
        .substring(0, 50);             // Limit length
    } else {
      baseName = fileId;
    }
    
    const storagePath = `${folder}/${baseName}_${fileId}${extension ? '.' + extension : ''}`;

    const { data, error } = await client.storage
      .from(PRIVATE_BUCKET)
      .upload(storagePath, file, {
        contentType,
        upsert: false
      });

    if (error) {
      console.error("Supabase private upload error:", error);
      throw new Error(`Failed to upload private file: ${error.message}`);
    }

    return storagePath;
  }

  async getSignedDownloadUrl(storagePath: string, expiresIn: number = 3600, downloadFileName?: string): Promise<string> {
    const client = this.getSupabase();

    const options: { download?: string | boolean } = {};
    if (downloadFileName) {
      options.download = downloadFileName;
    }

    const { data, error } = await client.storage
      .from(PRIVATE_BUCKET)
      .createSignedUrl(storagePath, expiresIn, options);

    if (error) {
      console.error("Supabase signed URL error:", error);
      throw new Error(`Failed to create signed URL: ${error.message}`);
    }

    return data.signedUrl;
  }

  async uploadPaymentProof(
    file: Buffer,
    fileName: string,
    contentType: string
  ): Promise<string> {
    const client = this.getSupabase();
    const fileId = randomUUID();
    const extension = fileName.split('.').pop() || '';
    const storagePath = `proofs/${fileId}${extension ? '.' + extension : ''}`;

    const { data, error } = await client.storage
      .from(PAYMENT_PROOF_BUCKET)
      .upload(storagePath, file, {
        contentType,
        upsert: false
      });

    if (error) {
      console.error("Supabase payment proof upload error:", error);
      throw new Error(`Failed to upload payment proof: ${error.message}`);
    }

    const { data: signedData, error: signedError } = await client.storage
      .from(PAYMENT_PROOF_BUCKET)
      .createSignedUrl(storagePath, 365 * 24 * 60 * 60);

    if (signedError || !signedData?.signedUrl) {
      console.error("Failed to create signed URL for payment proof:", signedError);
      const { data: publicUrlData } = client.storage
        .from(PAYMENT_PROOF_BUCKET)
        .getPublicUrl(storagePath);
      return publicUrlData.publicUrl;
    }

    return signedData.signedUrl;
  }

  async deletePublicFile(fileUrl: string): Promise<void> {
    const client = this.getSupabase();
    
    const storagePath = this.extractPathFromPublicUrl(fileUrl);
    if (!storagePath) return;

    const { error } = await client.storage
      .from(PUBLIC_BUCKET)
      .remove([storagePath]);

    if (error) {
      console.error("Supabase delete error:", error);
    }
  }

  async deletePrivateFile(storagePath: string): Promise<void> {
    const client = this.getSupabase();

    const { error } = await client.storage
      .from(PRIVATE_BUCKET)
      .remove([storagePath]);

    if (error) {
      console.error("Supabase private delete error:", error);
    }
  }

  private extractPathFromPublicUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      const pathMatch = urlObj.pathname.match(/\/storage\/v1\/object\/public\/public_assets\/(.+)/);
      return pathMatch ? pathMatch[1] : null;
    } catch {
      return null;
    }
  }

  getPublicUrl(storagePath: string): string {
    const client = this.getSupabase();
    const { data } = client.storage
      .from(PUBLIC_BUCKET)
      .getPublicUrl(storagePath);
    return data.publicUrl;
  }
}

export const supabaseStorage = new SupabaseStorageService();

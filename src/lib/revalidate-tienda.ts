export async function revalidateTienda(): Promise<void> {
  try {
    await fetch("/api/revalidate-tienda", { method: "POST" });
  } catch {}
}

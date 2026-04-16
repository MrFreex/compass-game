"use server";

export async function getTargetCoordinates() {
	const PASTEBIN_URL = process.env.PASTEBIN_URL!;

	const response = await fetch(PASTEBIN_URL, {
		// Use nextjs fetch caching options to always grab the latest Pastebin state instead of using a proxy
		cache: "no-store",
	});

	if (!response.ok) throw new Error("Failed to fetch target coordinates");

	const text = await response.json();
	return text as { lat: number; lng: number; range: number };
}

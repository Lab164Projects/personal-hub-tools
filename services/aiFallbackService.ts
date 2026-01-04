/**
 * AI Fallback Service using Pollinations.ai
 * Provides a free, infinite-limit fallback when Gemini API is exhausted.
 */

// Interface for the Enrichment Result
interface EnrichmentResult {
    description: string;
    category: string;
    tags: string[];
}

/**
 * Normalizes the response from the crude text API
 */
const parsePollinationsResponse = (text: string): EnrichmentResult => {
    // Pollinations returns raw text, we need to try to parse it or just use it as description.
    // The prompt will ask for a specific format (e.g. JSON-like) but it's not guaranteed.
    // We will use a robust parsing strategy.

    // SANITIZATION: Remove Deprecation Warnings if present
    let cleanText = text;
    if (text.includes("IMPORTANT NOTICE") && text.includes("Pollinations")) {
        // Try to find the start of the real content.
        // Usually the warning is a header. We take the last part if safe, or just try to clean it.
        // Heuristic: Remove lines starting with warning symbols or containing known warning text
        const lines = text.split('\n');
        cleanText = lines.filter(line =>
            !line.includes("IMPORTANT NOTICE") &&
            !line.includes("deprecated") &&
            !line.includes("migrate to") &&
            !line.includes("Anonymous requests")
        ).join('\n').trim();
    }

    let description = "Descrizione generata (Fallback)";
    let category = "Internet Tools";
    let tags = ["tool", "fallback"];

    try {
        // clean up markdown code blocks if any
        const cleaned = cleanText.replace(/```json/g, '').replace(/```/g, '').trim();
        const json = JSON.parse(cleaned);
        return {
            description: json.description || cleanText.substring(0, 200),
            category: json.category || "General",
            tags: json.tags || ["fallback"]
        };
    } catch (e) {
        // If JSON parsing fails, use the whole text as description if it's reasonable
        if (cleanText.length > 10) {
            description = cleanText.substring(0, 300); // Limit length
        }

        // Simple heuristic for category
        if (text.toLowerCase().includes('security') || text.toLowerCase().includes('vulnerability')) category = "Security & Pentest";
        else if (text.toLowerCase().includes('network')) category = "Networking";

        return { description, category, tags };
    }
};

export const enrichWithPollinations = async (toSearch: string): Promise<EnrichmentResult> => {
    try {
        // Construct a prompt that asks for JSON to make parsing easier
        const prompt = `Analyze this tool/url: "${toSearch}". Return ONLY a JSON object with: { "description": "short summary in Italian", "category": "one short category", "tags": ["tag1", "tag2"] }. Do not add introductions.`;

        const encodedPrompt = encodeURIComponent(prompt);
        // Add random seed to avoid cache if needed, though they don't strictly cache per se
        const url = `https://text.pollinations.ai/${encodedPrompt}?seed=${Math.floor(Math.random() * 1000)}`;

        const response = await fetch(url);
        if (!response.ok) throw new Error("Pollinations API Error: " + response.status);

        const text = await response.text();
        return parsePollinationsResponse(text);

    } catch (error) {
        console.error("Pollinations Fallback Failed:", error);
        throw error;
    }
};

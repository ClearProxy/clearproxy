import fetch from "node-fetch";
import { parseProxies, formatOutput } from "./utils.js";

const API_BASE = "https://api.clearproxy.io";

/**
 * ClearProxy SDK
 * Lightweight SDK for checking proxies via the ClearProxy.io API.
 */
export class ClearProxy {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error("API key is required");
    }
    this.apiKey = apiKey;
    this.baseURL = API_BASE;
  }

  /**
   * Check proxies using ClearProxy API
   * @param {string|Array} input - File path, array of proxies, or single proxy string
   * @param {Object} options - Check options
   * @param {string} [options.region] - Region code (us, eu, sg, etc)
   * @param {number} [options.timeout=4000] - Timeout in milliseconds
   * @param {string} [options.type=http] - Proxy type: http, socks4, socks5
   * @returns {Promise<Object>} Result object with summary, metadata, and proxies
   */
  async check(input, options = {}) {
    const { region, timeout = 4000, type = "http" } = options;

    const allowedTypes = ["http", "socks4", "socks5"];
    if (!allowedTypes.includes(type)) {
      throw new Error(`Invalid type '${type}'. Allowed: ${allowedTypes.join(", ")}`);
    }

    let proxies = [];
    if (typeof input === "string") {
      try {
        proxies = await parseProxies(input);
      } catch {
        proxies = [input];
      }
    } else if (Array.isArray(input)) {
      proxies = await parseProxies(input);
    } else {
      throw new Error("Input must be a file path, proxy string, or array of proxies");
    }

    if (!proxies.length) {
      throw new Error("No proxies found in input");
    }

    const res = await fetch(`${this.baseURL}/check`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        proxies,
        region: region || undefined,
        timeout: Number(timeout),
        type,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API Error (${res.status}): ${text}`);
    }

    const data = await res.json();
    if (!data.result_url) {
      throw new Error("Unexpected API response: missing 'result_url'");
    }

    const resultRes = await fetch(data.result_url);
    if (!resultRes.ok) {
      throw new Error(`Failed to fetch result: ${resultRes.status}`);
    }

    const resultData = await resultRes.json();

    return {
      summary: resultData.summary || {},
      metadata: resultData.metadata || {},
      proxies: resultData.proxies || [],
      working: resultData.proxies?.filter(p => p.status === "working") || [],
      failed: resultData.proxies?.filter(p => p.status === "failed") || [],
    };
  }

  /**
   * Export proxy results to various formats
   * @param {Array} proxies - Array of proxy result objects
   * @param {string} [format=json] - Output format (json, txt, yaml)
   * @param {boolean} [simple=false] - Export only ip:port if true
   * @returns {string} Formatted output
   */
  export(proxies, format = "json", simple = false) {
    return formatOutput(proxies, format, simple);
  }
}

export default ClearProxy;

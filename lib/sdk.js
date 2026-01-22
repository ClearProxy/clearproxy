import fetch from "node-fetch";
import WebSocket from "ws";
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
   * @param {Array} [options.customUrls] - Array of custom URL validation objects
   * @param {string} [options.jobId] - Client-generated unique Job ID for real-time tracking
   * @param {Function} [options.onProgress] - Callback function for real-time progress updates
   * @returns {Promise<Object>} Result object with summary, metadata, proxies, and custom validation
   * 
   * @example
   * // Basic check
   * const result = await client.check('proxies.txt', {
   *   region: 'us1',
   *   timeout: 5000,
   *   type: 'http'
   * });
   * 
   * @example
   * // Check with custom URL validation
   * const result = await client.check('proxies.txt', {
   *   region: 'us1',
   *   customUrls: [
   *     {
   *       url: 'https://discord.com',
   *       requiredStatusCodes: [200, 301, 302]
   *     },
   *     {
   *       url: 'https://www.google.com',
   *       requiredStatusCodes: [200],
   *       requiredText: 'Search',
   *       caseSensitive: false
   *     }
   *   ]
   * });
   * 
   * console.log(result.custom_url_validation);
   */
  async check(input, options = {}) {
    const {
      region,
      timeout = 4000,
      type = "http",
      customUrls = [],
      jobId,
      onProgress
    } = options;

    let effectiveJobId = jobId;
    if (onProgress && !effectiveJobId) {
      effectiveJobId = `sdk_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
    }

    const allowedTypes = ["http", "socks4", "socks5"];
    if (!allowedTypes.includes(type)) {
      throw new Error(`Invalid type '${type}'. Allowed: ${allowedTypes.join(", ")}`);
    }

    // Validate customUrls if provided
    if (customUrls.length > 0) {
      if (!Array.isArray(customUrls)) {
        throw new Error("customUrls must be an array");
      }
      customUrls.forEach((urlConfig, idx) => {
        if (!urlConfig.url) {
          throw new Error(`Custom URL at index ${idx} is missing 'url' field`);
        }
        if (typeof urlConfig.url !== 'string') {
          throw new Error(`Custom URL at index ${idx}: 'url' must be a string`);
        }
      });
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
        customUrls: customUrls.length > 0 ? customUrls : undefined,
        jobId: effectiveJobId || undefined,
      }),
    });

    // Start WebSocket if onProgress is provided
    let ws;
    if (onProgress && effectiveJobId) {
      const wsURL = `${this.baseURL.replace("http", "ws")}/ws?jobId=${effectiveJobId}`;
      ws = new WebSocket(wsURL);

      ws.on("message", (data) => {
        try {
          const event = JSON.parse(data);
          onProgress(event);
        } catch (e) {
          // Ignore invalid JSON
        }
      });

      ws.on("error", () => {
        // Silently handle WS errors
      });
    }

    try {
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

      // Extract custom URL validation if present
      const custom_url_validation = resultData.custom_url_validation ||
        data.custom_url_validation ||
        null;

      return {
        summary: resultData.summary || {},
        metadata: resultData.metadata || {},
        proxies: resultData.proxies || [],
        working: resultData.proxies?.filter(p => p.status === "working") || [],
        failed: resultData.proxies?.filter(p => p.status === "failed") || [],
        custom_url_validation,
      };
    } finally {
      if (ws) {
        ws.close();
      }
    }
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

  /**
   * Get account information
   * @returns {Promise<Object>} User account info including email, checks, and UnlimitedPro status
   */
  async me() {
    const res = await fetch(`${this.baseURL}/me`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API Error (${res.status}): ${text}`);
    }

    return await res.json();
  }

  /**
   * Get available regions
   * @returns {Promise<Object>} List of available regions
   */
  async regions() {
    const res = await fetch(`${this.baseURL}/regions`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API Error (${res.status}): ${text}`);
    }

    return await res.json();
  }

  /**
   * Check API health status
   * @returns {Promise<Object>} Health status
   */
  async health() {
    const res = await fetch(`${this.baseURL}/health`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API Error (${res.status}): ${text}`);
    }

    return await res.json();
  }

  /**
   * Filter working proxies that passed custom URL validation
   * @param {Object} result - Result object from check() method
   * @param {string} url - URL to filter by
   * @returns {Array} Array of proxies that passed validation for the specified URL
   * 
   * @example
   * const result = await client.check('proxies.txt', {
   *   customUrls: [
   *     { url: 'https://discord.com', requiredStatusCodes: [200, 301, 302] }
   *   ]
   * });
   * 
   * const discordProxies = client.filterByCustomUrl(result, 'https://discord.com');
   * console.log(`Found ${discordProxies.length} working proxies for Discord`);
   */
  filterByCustomUrl(result, url) {
    if (!result.custom_url_validation) {
      throw new Error("No custom URL validation data available");
    }

    const perUrlResults = result.custom_url_validation.per_url_summary ||
      result.custom_url_validation.results ||
      (Array.isArray(result.custom_url_validation) ? result.custom_url_validation : []);

    const urlResult = perUrlResults.find(r => r.url === url);

    if (!urlResult) {
      throw new Error(`URL '${url}' not found in custom validation results`);
    }

    return urlResult.successful_proxies || [];
  }

  /**
   * Get custom URL validation summary
   * @param {Object} result - Result object from check() method
   * @returns {Object} Summary of custom URL validation results
   * 
   * @example
   * const result = await client.check('proxies.txt', {
   *   customUrls: [{ url: 'https://discord.com', requiredStatusCodes: [200] }]
   * });
   * 
   * const summary = client.getCustomUrlSummary(result);
   * console.log(`Total URLs tested: ${summary.total_urls}`);
   * console.log(`Overall success rate: ${summary.overall_success_rate}`);
   */
  getCustomUrlSummary(result) {
    if (!result.custom_url_validation) {
      return null;
    }

    const perUrlResults = result.custom_url_validation.per_url_summary ||
      result.custom_url_validation.results ||
      (Array.isArray(result.custom_url_validation) ? result.custom_url_validation : []);

    const totalSuccess = perUrlResults.reduce((sum, r) => sum + (r.success_count || 0), 0);
    const totalFailed = perUrlResults.reduce((sum, r) => sum + (r.failed_count || 0), 0);
    const totalTested = totalSuccess + totalFailed;

    return {
      total_urls: perUrlResults.length,
      total_proxies_tested: totalTested,
      total_success: totalSuccess,
      total_failed: totalFailed,
      overall_success_rate: totalTested > 0 ? `${((totalSuccess / totalTested) * 100).toFixed(2)}%` : '0.00%',
      per_url: perUrlResults.map(r => ({
        url: r.url,
        success_count: r.success_count,
        failed_count: r.failed_count,
        success_rate: r.success_rate,
      }))
    };
  }
}

export default ClearProxy;